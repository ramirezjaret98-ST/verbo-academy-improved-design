-- Preserve classes and their academic status while releasing their reservation.
alter table public.sessions add column schedule_hold text
  check (schedule_hold in ('suspended', 'needs_schedule'));
comment on column public.sessions.schedule_hold is
  'Server owned: suspended releases the slot; needs_schedule requires a new time after reactivation.';

create function private.session_suspension_applies(s public.sessions)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when s.workshop_cohort_id is not null or s.origin = 'workshop' then false
    when s.group_id is not null then
      not exists(select 1 from public.group_members gm join public.app_users u on u.id=gm.student_id
        where gm.group_id=s.group_id and gm.status='active' and u.status is distinct from 'suspended')
    else exists(select 1 from public.app_users u where u.id=s.student_id and u.status='suspended')
  end
$$;
revoke all on function private.session_suspension_applies(public.sessions) from public, anon, authenticated;

create function private.derive_session_schedule_hold()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous_hold text; moved boolean := false;
begin
  if TG_OP='UPDATE' then
    previous_hold := old.schedule_hold;
    moved := new.date_time is distinct from old.date_time
      or new.teacher_id is distinct from old.teacher_id;
  end if;
  -- Callers cannot set/clear the marker themselves, including on INSERT.
  new.schedule_hold := previous_hold;
  if new.status not in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule') then
    if previous_hold is not null and new.status in ('completed','absent','no_show') then
      raise exception 'Assign a new time before reporting a released class.';
    end if;
    new.schedule_hold := null;
    return new;
  end if;
  if private.session_suspension_applies(new) then
    new.schedule_hold := 'suspended';
    return new;
  end if;
  if previous_hold is null then return new; end if;
  -- An explicit new assignment goes through the ordinary booking guard.
  if moved then
    if new.date_time <= now() then raise exception 'Choose a future time for this released class.'; end if;
    new.schedule_hold := null;
    return new;
  end if;
  if previous_hold='needs_schedule' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
  if new.date_time <= now()
    or private.teacher_external_blocked(new.teacher_id,new.date_time,new.duration_minutes)
    or exists(select 1 from public.sessions x where x.id<>new.id and x.schedule_hold is null
      and (x.teacher_id=new.teacher_id or (new.student_id is not null and x.student_id=new.student_id))
      and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
      and x.date_time<new.date_time+make_interval(mins=>new.duration_minutes)
      and x.date_time+make_interval(mins=>x.duration_minutes)>new.date_time)
  then new.schedule_hold := 'needs_schedule';
  else new.schedule_hold := null;
  end if;
  return new;
end $$;
revoke all on function private.derive_session_schedule_hold() from public, anon, authenticated;

-- Alphabetically before sessions_guard_booking.
create trigger sessions_derive_schedule_hold before insert or update on public.sessions
for each row execute function private.derive_session_schedule_hold();

CREATE OR REPLACE FUNCTION private.guard_session_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.schedule_hold is not null then return new; end if;
 if TG_OP='UPDATE' and new.date_time=old.date_time and new.teacher_id is not distinct from old.teacher_id
   and new.student_id is not distinct from old.student_id and new.duration_minutes=old.duration_minutes
   and (old.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
     or new.status not in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')) then return new; end if;
 if new.status not in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 if private.teacher_external_blocked(new.teacher_id,new.date_time,new.duration_minutes) then
   raise exception 'That time is reserved for an external lesson. Refresh and choose another time.';
 end if;
 if exists(select 1 from public.sessions x where x.id<>new.id and x.schedule_hold is null and
   (x.teacher_id=new.teacher_id or (new.student_id is not null and x.student_id=new.student_id))
   and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
   and x.date_time<new.date_time+make_interval(mins=>new.duration_minutes)
   and x.date_time+make_interval(mins=>x.duration_minutes)>new.date_time) then
   raise exception 'That time overlaps another session. Refresh and choose another time.';
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.reschedule_slot_free(s sessions, t uuid, dt timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.app_users a where a.id=t and a.role='teacher' and a.teacher_status='active'
   and ((select u.product from public.app_users u where u.id=s.student_id) is null
     or (select u.product from public.app_users u where u.id=s.student_id)=any(a.qualified_products)))
 and exists(select 1 from public.teacher_availability a where a.teacher_id=t and a.confirmed_at is not null)
 and exists(select 1 from public.teacher_availability_blocks b where b.teacher_id=t
   and b.day::text=(array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from dt at time zone 'America/Mexico_City')::integer+1]
   and b.start_min<=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')
   and b.end_min>=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')+s.duration_minutes)
 and not private.teacher_external_blocked(t, dt, s.duration_minutes)
 and not exists(select 1 from public.sessions x where x.id<>s.id and x.schedule_hold is null
   and (x.teacher_id=t or x.student_id=s.student_id)
   and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
   and x.date_time<dt+make_interval(mins=>s.duration_minutes)
   and x.date_time+make_interval(mins=>x.duration_minutes)>dt)
$function$
;

create function private.refresh_student_schedule_holds()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is not distinct from new.status then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
  -- Only the new derived column changes. No cancellation, credit use, or schedule emails.
  update public.sessions s set schedule_hold=s.schedule_hold
    where (s.student_id=new.id or s.group_id in
      (select gm.group_id from public.group_members gm where gm.student_id=new.id))
      and s.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule');
  return new;
end $$;
revoke all on function private.refresh_student_schedule_holds() from public, anon, authenticated;
create trigger app_users_refresh_schedule_holds after update of status on public.app_users
for each row execute function private.refresh_student_schedule_holds();

create function private.refresh_group_schedule_holds()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_group bigint; new_group bigint;
begin
  if TG_OP<>'INSERT' then old_group:=old.group_id; end if;
  if TG_OP<>'DELETE' then new_group:=new.group_id; end if;
  perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
  update public.sessions s set schedule_hold=s.schedule_hold
    where s.group_id in (old_group,new_group)
      and s.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule');
  return null;
end $$;
revoke all on function private.refresh_group_schedule_holds() from public, anon, authenticated;
create trigger group_members_refresh_schedule_holds after insert or update or delete on public.group_members
for each row execute function private.refresh_group_schedule_holds();

-- Existing suspended students receive exactly the same derived behavior.
update public.sessions s set schedule_hold=s.schedule_hold
where s.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
  and private.session_suspension_applies(s);
