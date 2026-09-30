-- A teacher closes an Insight or Book Club in one transaction against the
-- actual booked roster. A failed or partial report never completes the club.
create or replace function public.submit_club_report(
  p_club_id bigint,
  p_comments text,
  p_attendance jsonb
) returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_club public.clubs%rowtype;
  v_report_id bigint;
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
    raise exception 'Attendance must be an object keyed by booked student ID.';
  end if;
  if exists (
    select 1 from public.club_bookings b where b.club_id = p_club_id
    and coalesce(p_attendance ->> b.student_id::text, '') not in ('present', 'absent')
  ) or exists (
    select 1 from jsonb_object_keys(p_attendance) as keys(student_id)
    where not exists (select 1 from public.club_bookings b where b.club_id = p_club_id and b.student_id::text = keys.student_id)
  ) then
    raise exception 'Attendance must match every real booking exactly.';
  end if;

  insert into public.club_reports (event_type, club_id, session_id, teacher_id, comments, submitted_at)
  values (v_club.type::text::public.club_report_event_type, p_club_id, null, v_club.teacher_id, nullif(trim(p_comments), ''), now())
  returning id into v_report_id;

  insert into public.club_report_attendance (club_report_id, student_id, attendance)
  select v_report_id, b.student_id, p_attendance ->> b.student_id::text
  from public.club_bookings b where b.club_id = p_club_id;

  update public.clubs set status = 'completed' where id = p_club_id;
end;
$function$;

revoke all on function public.submit_club_report(bigint, text, jsonb) from public;
grant execute on function public.submit_club_report(bigint, text, jsonb) to authenticated;

-- The UI already closes cancellation 24h before start. Enforce the same
-- deadline at the database so a late self-delete cannot erase the roster.
create or replace function public.club_booking_before_delete_cutoff()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_date timestamptz;
begin
  if old.student_id = (select auth.uid()) then
    select date into v_date from public.clubs where id = old.club_id;
    if v_date - now() < interval '24 hours' then
      raise exception 'Cancellations close 24h before start.';
    end if;
  end if;
  return old;
end;
$function$;
revoke all on function public.club_booking_before_delete_cutoff() from public;
drop trigger if exists club_booking_before_delete_cutoff_trg on public.club_bookings;
create trigger club_booking_before_delete_cutoff_trg before delete on public.club_bookings
for each row execute function public.club_booking_before_delete_cutoff();

-- A booked student can read the shared group note and only their own
-- attendance row (the latter already has student-scoped RLS).
create policy club_reports_booked_student_select on public.club_reports
for select to authenticated
using (club_id is not null and exists (
  select 1 from public.club_bookings b
  where b.club_id = club_reports.club_id and b.student_id = (select auth.uid())
));
