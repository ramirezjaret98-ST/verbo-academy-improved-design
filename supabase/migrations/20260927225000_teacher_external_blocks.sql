-- External lessons occupy teacher time without creating Academy students.
-- All dates and wall-clock minutes are interpreted in America/Mexico_City.
create table public.teacher_external_blocks (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.app_users(id) on delete restrict,
  label text not null check (length(trim(label)) between 1 and 120),
  weekday smallint not null check (weekday between 0 and 6),
  start_min integer not null check (start_min between 0 and 1439),
  end_min integer not null check (end_min between 1 and 1440),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_block_time_order check (start_min < end_min),
  constraint external_block_date_order check (start_date <= end_date)
);

create index teacher_external_blocks_lookup on public.teacher_external_blocks (teacher_id, weekday, start_date, end_date);
alter table public.teacher_external_blocks enable row level security;
revoke all on public.teacher_external_blocks from public, anon;
grant select, insert, update, delete on public.teacher_external_blocks to authenticated;
grant usage, select on sequence public.teacher_external_blocks_id_seq to authenticated;

create policy teacher_external_blocks_admin_select on public.teacher_external_blocks
  for select to authenticated using ((select private.is_super_admin()));
create policy teacher_external_blocks_admin_insert on public.teacher_external_blocks
  for insert to authenticated with check ((select private.is_super_admin()));
create policy teacher_external_blocks_admin_update on public.teacher_external_blocks
  for update to authenticated using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));
create policy teacher_external_blocks_admin_delete on public.teacher_external_blocks
  for delete to authenticated using ((select private.is_super_admin()));

create function private.teacher_external_blocked(t uuid, dt timestamptz, duration_min integer)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_external_blocks b
    where b.teacher_id = t
      and b.weekday = extract(dow from dt at time zone 'America/Mexico_City')::integer
      and (dt at time zone 'America/Mexico_City')::date between b.start_date and b.end_date
      and b.start_min < extract(hour from dt at time zone 'America/Mexico_City') * 60
                        + extract(minute from dt at time zone 'America/Mexico_City') + duration_min
      and b.end_min > extract(hour from dt at time zone 'America/Mexico_City') * 60
                      + extract(minute from dt at time zone 'America/Mexico_City')
  )
$$;

-- Serialize block edits with session bookings. Existing sessions are retained.
create function private.lock_external_block_edit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 if tg_op = 'DELETE' then return old; end if;
 return new;
end $$;
create trigger teacher_external_blocks_lock before insert or update or delete
on public.teacher_external_blocks for each row execute function private.lock_external_block_edit();

-- Keep the existing qualification, weekly availability and session checks.
create or replace function private.reschedule_slot_free(s public.sessions, t uuid, dt timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.app_users a where a.id=t and a.role='teacher' and a.teacher_status='active'
   and ((select u.product from public.app_users u where u.id=s.student_id) is null
     or (select u.product from public.app_users u where u.id=s.student_id)=any(a.qualified_products)))
 and exists(select 1 from public.teacher_availability a where a.teacher_id=t and a.confirmed_at is not null)
 and exists(select 1 from public.teacher_availability_blocks b where b.teacher_id=t
   and b.day::text=(array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from dt at time zone 'America/Mexico_City')::integer+1]
   and b.start_min<=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')
   and b.end_min>=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')+s.duration_minutes)
 and not private.teacher_external_blocked(t, dt, s.duration_minutes)
 and not exists(select 1 from public.sessions x where x.id<>s.id
   and (x.teacher_id=t or x.student_id=s.student_id)
   and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
   and x.date_time<dt+make_interval(mins=>s.duration_minutes)
   and x.date_time+make_interval(mins=>x.duration_minutes)>dt)
$$;

-- Older admin clients write sessions directly: enforce the block at the DB boundary.
create or replace function private.guard_session_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.date_time=old.date_time and new.teacher_id is not distinct from old.teacher_id
   and new.student_id is not distinct from old.student_id and new.duration_minutes=old.duration_minutes
   and (old.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
     or new.status not in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')) then return new; end if;
 if new.status not in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 if private.teacher_external_blocked(new.teacher_id,new.date_time,new.duration_minutes) then
   raise exception 'That time is reserved for an external lesson. Refresh and choose another time.';
 end if;
 if exists(select 1 from public.sessions x where x.id<>new.id and
   (x.teacher_id=new.teacher_id or (new.student_id is not null and x.student_id=new.student_id))
   and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
   and x.date_time<new.date_time+make_interval(mins=>new.duration_minutes)
   and x.date_time+make_interval(mins=>x.duration_minutes)>new.date_time) then
   raise exception 'That time overlaps another session. Refresh and choose another time.';
 end if;
 return new;
end $$;

-- A blocked time must not appear even as a "request review" option.
create or replace function public.student_reschedule_slots(p_session_id bigint,p_date date)
returns table(date_time timestamptz,available boolean)
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; u public.app_users;
begin
 select * into s from public.sessions where id=p_session_id and student_id=auth.uid();
 if not found or s.group_id is not null or s.workshop_cohort_id is not null then raise exception 'Individual session not found'; end if;
 select * into u from public.app_users where id=auth.uid();
 if p_date<(now() at time zone 'America/Mexico_City')::date or p_date>(now() at time zone 'America/Mexico_City')::date+180 then return; end if;
 if extract(dow from p_date)=0 then return; end if;
 return query select d.dt,private.reschedule_slot_free(s,s.teacher_id,d.dt)
 from (select (p_date+make_interval(mins=>m)) at time zone 'America/Mexico_City' dt from generate_series(420,1320-s.duration_minutes,30)m)d
 where d.dt>=now()+make_interval(hours=>private.reschedule_notice(u)) and d.dt<>s.date_time
   and not private.teacher_external_blocked(s.teacher_id,d.dt,s.duration_minutes);
end $$;

-- Also reject direct RPC submissions of an externally reserved time.
create function private.guard_external_reschedule_request() returns trigger
language plpgsql security definer set search_path='' as $$
declare original public.sessions;
begin
 if new.kind <> 'reschedule' or new.origin_session_id is null or new.proposed_datetime is null then return new; end if;
 select * into original from public.sessions where id = new.origin_session_id;
 if found and private.teacher_external_blocked(coalesce(new.assigned_teacher_id,original.teacher_id),
                                                new.proposed_datetime,coalesce(new.duration_minutes,original.duration_minutes)) then
   raise exception 'That time is reserved for an external lesson. Refresh and choose another time.';
 end if;
 return new;
end $$;
create trigger student_requests_guard_external_block before insert or update of proposed_datetime,assigned_teacher_id
on public.student_requests for each row execute function private.guard_external_reschedule_request();

revoke all on function private.teacher_external_blocked(uuid,timestamptz,integer),
  private.guard_external_reschedule_request(),private.lock_external_block_edit() from public,anon,authenticated;
