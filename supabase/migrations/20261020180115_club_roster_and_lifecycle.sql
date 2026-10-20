-- Keep consumed reservations for quota accounting, outside the active roster.
alter table public.club_bookings add column removed_at timestamptz;
alter table public.club_bookings drop constraint club_bookings_student_club_unique;
create unique index club_bookings_active_student_club on public.club_bookings(student_id,club_id) where removed_at is null;
drop policy club_bookings_write_delete on public.club_bookings;
create policy club_bookings_write_delete on public.club_bookings for delete to authenticated
using (private.is_admin() or (student_id=(select auth.uid()) and removed_at is null));

create table private.club_removal_audit (
  id bigint generated always as identity primary key,
  club_id bigint not null, attendee_id text not null, actor_id uuid not null,
  return_credit boolean not null, removed_at timestamptz not null default now()
);
revoke all on private.club_removal_audit from public,anon,authenticated;

create or replace function public.club_bookings_after_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.removed_at is null then
    update public.clubs set spots_taken=greatest(0,coalesce(spots_taken,0)-1) where id=old.club_id;
  end if;
  return old;
end $$;

create function public.club_staff_roster(p_club_id bigint)
returns table(attendee_id text, name text, kind text, booked_at timestamptz, attendance_id text)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.clubs c
    where c.id=p_club_id and (private.is_admin() or (private.is_teacher() and c.teacher_id=auth.uid()))) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  return query
    select 'student:'||b.id::text,u.name,'student'::text,b.booked_at,b.student_id::text
      from public.club_bookings b join public.app_users u on u.id=b.student_id
      where b.club_id=p_club_id and b.removed_at is null
    union all
    select 'guest:'||b.id::text,i.guest_name,'courtesy'::text,b.booked_at,'guest:'||b.id::text
      from public.club_guest_bookings b join public.club_guest_invitations i on i.id=b.invitation_id
      where b.club_id=p_club_id and b.status='booked' and i.revoked_at is null
    order by 4,1;
end $$;
revoke all on function public.club_staff_roster(bigint) from public,anon;
grant execute on function public.club_staff_roster(bigint) to authenticated;

create function public.admin_remove_club_attendee(p_club_id bigint,p_attendee_id text,p_return_credit boolean)
returns void language plpgsql security definer set search_path='' as $$
declare c public.clubs; b public.club_bookings; g public.club_guest_bookings;
begin
  if auth.uid() is null or not coalesce(private.is_coordinator_ops(),false) then
    raise exception 'Only operations administrators can remove attendees' using errcode='42501';
  end if;
  if p_return_credit is null then raise exception 'Choose whether to return access'; end if;
  -- Reservation locks invitation before club. Use the same order for courtesies.
  if p_attendee_id like 'guest:%' then
    select * into g from public.club_guest_bookings where id=substring(p_attendee_id from 7)::uuid;
    if not found or g.club_id<>p_club_id then raise exception 'Reservation changed. Reload.'; end if;
    perform 1 from public.club_guest_invitations where id=g.invitation_id for update;
  end if;
  select * into c from public.clubs where id=p_club_id for update;
  if not found then raise exception 'Club not found'; end if;
  if exists(select 1 from public.club_reports where club_id=c.id) then
    raise exception 'Reported attendance is historical and cannot be removed.';
  end if;
  if p_attendee_id like 'student:%' then
    select * into b from public.club_bookings where id=substring(p_attendee_id from 9)::bigint
      and club_id=c.id and removed_at is null for update;
    if not found then raise exception 'Reservation changed. Reload.'; end if;
    if p_return_credit then
      delete from public.club_bookings where id=b.id;
      -- Return a Core one-time credit only when no other consumed booking uses it.
      if not exists(select 1 from public.club_bookings where student_id=b.student_id and club_type=b.club_type) then
        update public.freemium_state set used_at=null where student_id=b.student_id and kind::text=b.club_type::text;
      end if;
    else
      update public.club_bookings set removed_at=now() where id=b.id;
      update public.clubs set spots_taken=greatest(0,coalesce(spots_taken,0)-1) where id=c.id;
    end if;
  elsif p_attendee_id like 'guest:%' then
    select * into g from public.club_guest_bookings where id=g.id and status='booked' for update;
    if not found then raise exception 'Reservation changed. Reload.'; end if;
    if p_return_credit then
      -- Keep the audit; discard the old access capability so it cannot reopen a seat.
      delete from public.club_guest_bookings where id=g.id;
      update public.club_guest_invitations set redeemed_at=null,expires_at=greatest(expires_at,now()+interval '7 days')
        where id=g.invitation_id and revoked_at is null;
    else
      update public.club_guest_bookings set status='cancelled',cancelled_at=now() where id=g.id;
    end if;
  else raise exception 'Invalid attendee';
  end if;
  insert into private.club_removal_audit(club_id,attendee_id,actor_id,return_credit)
    values(c.id,p_attendee_id,auth.uid(),p_return_credit);
end $$;
revoke all on function public.admin_remove_club_attendee(bigint,text,boolean) from public,anon;
grant execute on function public.admin_remove_club_attendee(bigint,text,boolean) to authenticated;

create function private.refresh_club_lifecycle() returns void
language sql security definer set search_path='' as $$
  update public.clubs c set status=case
    when c.date+make_interval(mins=>c.duration_minutes)<=now() then 'expired'::public.time_status
    when c.date<=now() then 'live'::public.time_status else 'upcoming'::public.time_status end
  where c.status in ('upcoming','live','expired')
    and not exists(select 1 from public.club_reports r where r.club_id=c.id)
    and c.status is distinct from case
      when c.date+make_interval(mins=>c.duration_minutes)<=now() then 'expired'::public.time_status
      when c.date<=now() then 'live'::public.time_status else 'upcoming'::public.time_status end;
$$;
revoke all on function private.refresh_club_lifecycle() from public,anon,authenticated;
select private.refresh_club_lifecycle();
select cron.schedule('academy-club-lifecycle','* * * * *','select private.refresh_club_lifecycle()');

CREATE OR REPLACE FUNCTION public.submit_club_report(p_club_id bigint, p_comments text, p_attendance jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_club public.clubs%rowtype; v_report_id bigint;
begin
  select * into v_club from public.clubs where id = p_club_id for update;
  if not found then raise exception 'Insight not found.'; end if;
  if v_club.teacher_id is distinct from (select auth.uid()) then
    raise exception 'Only the assigned teacher can submit this report.';
  end if;
  if v_club.status = 'cancelled' then raise exception 'Cancelled events cannot be reported.'; end if;
  if v_club.date + make_interval(mins => v_club.duration_minutes) > now() then
    raise exception 'Submit the report after the session ends.';
  end if;
  if exists (select 1 from public.club_reports where club_id = p_club_id) then
    raise exception 'This event already has a report.';
  end if;
  if jsonb_typeof(p_attendance) is distinct from 'object' then
    raise exception 'Attendance must be an object keyed by booked attendee ID.';
  end if;
  if exists (
    select 1 from public.club_bookings b where b.club_id = p_club_id and b.removed_at is null
      and coalesce(p_attendance ->> b.student_id::text, '') not in ('present','absent')
  ) or exists (
    select 1 from public.club_guest_bookings b where b.club_id = p_club_id and b.status = 'booked'
      and coalesce(p_attendance ->> ('guest:' || b.id::text), '') not in ('present','absent')
  ) or exists (
    select 1 from jsonb_object_keys(p_attendance) as attendee(key)
    where not exists (select 1 from public.club_bookings b
      where b.club_id = p_club_id and b.removed_at is null and b.student_id::text = attendee.key)
      and not exists (select 1 from public.club_guest_bookings b
      where b.club_id = p_club_id and b.status = 'booked' and ('guest:' || b.id::text) = attendee.key)
  ) then
    raise exception 'Attendance must match every real booking exactly.';
  end if;

  if not exists (select 1 from public.club_bookings where club_id=p_club_id and removed_at is null)
    and not exists (select 1 from public.club_guest_bookings where club_id=p_club_id and status='booked') then
    raise exception 'No reservations to report. This event remains expired.';
  end if;
  insert into public.club_reports(event_type, club_id, session_id, teacher_id, comments, submitted_at)
    values(v_club.type::text::public.club_report_event_type, p_club_id, null,
      v_club.teacher_id, nullif(trim(p_comments), ''), now()) returning id into v_report_id;
  insert into public.club_report_attendance(club_report_id, student_id, attendance)
    select v_report_id, b.student_id, p_attendance ->> b.student_id::text
    from public.club_bookings b where b.club_id = p_club_id and b.removed_at is null;
  update public.club_guest_bookings b set attendance = p_attendance ->> ('guest:' || b.id::text)
    where b.club_id = p_club_id and b.status = 'booked';
  update public.clubs set status = case when exists (select 1 from jsonb_each_text(p_attendance) a where a.value='present') then 'completed'::public.time_status else 'absent'::public.time_status end where id = p_club_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.club_bookings_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club public.clubs%rowtype;
  v_student public.app_users%rowtype;
  v_used integer;
  v_cap bigint;
  v_local_date date;
begin
  if new.removed_at is not null then raise exception 'Invalid reservation state.'; end if;
  select * into v_club from public.clubs where id = new.club_id for update;
  if not found then raise exception 'Club % does not exist', new.club_id; end if;
  if new.club_type is distinct from v_club.type then
    raise exception 'Reservation type does not match this club.';
  end if;
  if v_club.status not in ('upcoming', 'live') then
    raise exception 'This session is no longer open for reservations.';
  end if;
  if v_club.date - now() < interval '24 hours' then
    raise exception 'Reservations close 24h before start.';
  end if;
  if coalesce(v_club.spots_taken, 0) >= v_club.spots_total then
    raise exception 'This session is full.';
  end if;

  select * into v_student from public.app_users where id = new.student_id for update;
  if not found then raise exception 'Student does not exist.'; end if;
  if v_student.product_type = 'insights' then
    v_local_date := (v_club.date at time zone 'America/Mexico_City')::date;
    if v_student.club_package_id is null
       or (now() at time zone 'America/Mexico_City')::date < v_student.club_package_started_on
       or (now() at time zone 'America/Mexico_City')::date >= v_student.club_package_expires_on
       or v_local_date < v_student.club_package_started_on
       or v_local_date >= v_student.club_package_expires_on then
      raise exception 'Your Clubs package has expired or does not cover this session.';
    end if;
    v_cap := case when v_club.type = 'book'
      then v_student.club_book_base::bigint + v_student.club_book_bonus
      else v_student.club_insight_base::bigint + v_student.club_insight_bonus end;
    if v_cap <= 0 then
      raise exception 'Your Clubs package does not include this collection.';
    end if;
    select count(*) into v_used from public.club_bookings b
      join public.clubs c on c.id = b.club_id
      where b.club_package_id = v_student.club_package_id and b.club_type = v_club.type
        and c.status <> 'cancelled';
    if v_used >= v_cap then
      raise exception 'You have used all reservations in this Clubs package.';
    end if;
    new.club_package_id := v_student.club_package_id;
  else
    -- Preserve the existing Performance path. A client cannot tag a booking
    -- with a package to bypass the monthly rules in the application.
    new.club_package_id := null;
  end if;

  update public.clubs set spots_taken = coalesce(spots_taken, 0) + 1 where id = new.club_id;
  return new;
end;
$function$
;
