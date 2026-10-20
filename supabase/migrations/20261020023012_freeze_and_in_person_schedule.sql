-- Freeze dates come from date inputs persisted at UTC midnight; compare Academy calendar days.
alter table public.sessions drop constraint sessions_schedule_hold_check;
alter table public.sessions add constraint sessions_schedule_hold_check check(schedule_hold in ('suspended','frozen','needs_schedule'));
create function private.student_schedule_unavailable(u public.app_users, dt timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select u.status='suspended' or (u.status='frozen'
  and (dt at time zone 'America/Mexico_City')::date >= coalesce((u.freeze_start at time zone 'UTC')::date,'-infinity'::date)
  and (dt at time zone 'America/Mexico_City')::date <= coalesce((u.freeze_end at time zone 'UTC')::date,'infinity'::date))
$$;
revoke all on function private.student_schedule_unavailable(public.app_users,timestamptz) from public,anon,authenticated;

create function private.session_schedule_hold_reason(s public.sessions)
returns text language sql stable security definer set search_path='' as $$
 select case
 when s.workshop_cohort_id is not null or s.origin='workshop' then null
 when s.group_id is not null then
  case when exists(select 1 from public.group_members gm join public.app_users u on u.id=gm.student_id
    where gm.group_id=s.group_id and gm.status='active' and not coalesce(private.student_schedule_unavailable(u,s.date_time),false)) then null
  when exists(select 1 from public.group_members gm join public.app_users u on u.id=gm.student_id
    where gm.group_id=s.group_id and gm.status='active' and u.status='frozen' and private.student_schedule_unavailable(u,s.date_time)) then 'frozen'
  else 'suspended' end
 else (select case when private.student_schedule_unavailable(u,s.date_time) then case when u.status='frozen' then 'frozen' else 'suspended' end end
  from public.app_users u where u.id=s.student_id)
 end
$$;
revoke all on function private.session_schedule_hold_reason(public.sessions) from public,anon,authenticated;
create or replace function private.session_suspension_applies(s public.sessions)
returns boolean language sql stable security definer set search_path='' as $$
 select private.session_schedule_hold_reason(s) is not null
$$;
CREATE OR REPLACE FUNCTION private.derive_session_schedule_hold()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous_hold text; moved boolean := false; hold_reason text;
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
  hold_reason := private.session_schedule_hold_reason(new);
  if hold_reason is not null then
    new.schedule_hold := hold_reason;
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
end $function$
;
CREATE OR REPLACE FUNCTION private.refresh_student_schedule_holds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if row(old.status,old.freeze_start,old.freeze_end) is not distinct from row(new.status,new.freeze_start,new.freeze_end) then return new; end if;
 if new.status='frozen' and new.freeze_start is not null and new.freeze_end is not null
   and (new.freeze_end at time zone 'UTC')::date < (new.freeze_start at time zone 'UTC')::date then
  raise exception 'Freeze end must be on or after its start date.';
 end if;
  perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
  -- Only the new derived column changes. No cancellation, credit use, or schedule emails.
  update public.sessions s set schedule_hold=s.schedule_hold
    where (s.student_id=new.id or s.group_id in
      (select gm.group_id from public.group_members gm where gm.student_id=new.id))
      and s.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule');
  return new;
end $function$
;
drop trigger app_users_refresh_schedule_holds on public.app_users;
create trigger app_users_refresh_schedule_holds after update of status,freeze_start,freeze_end on public.app_users
for each row execute function private.refresh_student_schedule_holds();

update public.sessions s set schedule_hold=s.schedule_hold
where s.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
 and private.session_schedule_hold_reason(s)='frozen';

-- Date-specific changes preserve the weekly series.
alter table public.teacher_external_blocks add constraint external_block_bounded_dates check(end_date-start_date<=730);
create table public.teacher_external_overrides(
 block_id bigint not null references public.teacher_external_blocks(id) on delete cascade,
 on_date date not null,
 cancelled boolean not null default false,
 replacement_date date,
 start_min integer,
 end_min integer,
 updated_at timestamptz not null default now(),
 primary key(block_id,on_date),
 constraint external_override_time check(
  (cancelled and replacement_date is null and start_min is null and end_min is null) or
  (not cancelled and replacement_date is not null and start_min is not null and end_min is not null and start_min>=0 and end_min<=1440 and start_min<end_min
    and abs(replacement_date-on_date)<=366))
);
alter table public.teacher_external_overrides enable row level security;
revoke all on public.teacher_external_overrides from public,anon;
grant select,insert,update,delete on public.teacher_external_overrides to authenticated;
create policy external_overrides_staff_read on public.teacher_external_overrides for select to authenticated
 using((select private.is_admin()) or exists(select 1 from public.teacher_external_blocks b where b.id=block_id and b.teacher_id=(select auth.uid())));
create policy external_overrides_admin_insert on public.teacher_external_overrides for insert to authenticated with check((select private.is_super_admin()));
create policy external_overrides_admin_update on public.teacher_external_overrides for update to authenticated using((select private.is_super_admin())) with check((select private.is_super_admin()));
create policy external_overrides_admin_delete on public.teacher_external_overrides for delete to authenticated using((select private.is_super_admin()));
create policy external_blocks_staff_read on public.teacher_external_blocks for select to authenticated
 using((select private.is_admin()) or teacher_id=(select auth.uid()));

create function private.external_occurrences(t uuid,first_date date,last_date date)
returns table(block_id bigint,on_date date,teacher_id uuid,label text,date_time timestamptz,duration_minutes integer)
language sql stable security definer set search_path='' as $$
 select b.id,d.day::date,b.teacher_id,b.label,
  (d.day::date+make_interval(mins=>b.start_min)) at time zone 'America/Mexico_City',b.end_min-b.start_min
 from public.teacher_external_blocks b
 cross join lateral generate_series(greatest(b.start_date,first_date)::timestamp,least(b.end_date,last_date)::timestamp,interval '1 day') d(day)
 where (t is null or b.teacher_id=t) and extract(dow from d.day)=b.weekday
 and not exists(select 1 from public.teacher_external_overrides o where o.block_id=b.id and o.on_date=d.day::date)
 union all
 select b.id,o.on_date,b.teacher_id,b.label,
  (o.replacement_date+make_interval(mins=>o.start_min)) at time zone 'America/Mexico_City',o.end_min-o.start_min
 from public.teacher_external_overrides o join public.teacher_external_blocks b on b.id=o.block_id
 where not o.cancelled and (t is null or b.teacher_id=t) and o.replacement_date between first_date and last_date
$$;
revoke all on function private.external_occurrences(uuid,date,date) from public,anon,authenticated;

create or replace function private.teacher_external_blocked(t uuid,dt timestamptz,duration_min integer)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.external_occurrences(t,
  (dt at time zone 'America/Mexico_City')::date-1,
  ((dt+make_interval(mins=>duration_min)) at time zone 'America/Mexico_City')::date) x
 where x.date_time<dt+make_interval(mins=>duration_min)
 and x.date_time+make_interval(mins=>x.duration_minutes)>dt)
$$;

create function private.validate_external_schedule()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.teacher_external_blocks; affected bigint; x record; prev_end timestamptz; first_date date; last_date date;
begin
 if TG_TABLE_NAME='teacher_external_blocks' then affected:=new.id;
 elsif TG_OP='DELETE' then affected:=old.block_id;
 else affected:=new.block_id; end if;
 select * into b from public.teacher_external_blocks where id=affected;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 select least(b.start_date,coalesce(min(replacement_date),b.start_date)),
        greatest(b.end_date,coalesce(max(replacement_date),b.end_date))
 into first_date,last_date from public.teacher_external_overrides where block_id=b.id;
 for x in select * from private.external_occurrences(b.teacher_id,first_date,last_date)
  where block_id=b.id and date_time+make_interval(mins=>duration_minutes)>now() order by date_time
 loop
  if x.date_time<prev_end then raise exception 'This change overlaps another occurrence in this series.'; end if;
  prev_end:=x.date_time+make_interval(mins=>x.duration_minutes);
  if exists(select 1 from public.sessions s where s.teacher_id=b.teacher_id and s.schedule_hold is null
    and s.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
    and s.date_time<prev_end and s.date_time+make_interval(mins=>s.duration_minutes)>x.date_time) then
   raise exception 'This reserved time overlaps an Academy class. Choose another time.';
  end if;
  if exists(select 1 from private.external_occurrences(b.teacher_id,
    (x.date_time at time zone 'America/Mexico_City')::date-1,
    (prev_end at time zone 'America/Mexico_City')::date) other
    where other.block_id<>b.id and other.date_time<prev_end
      and other.date_time+make_interval(mins=>other.duration_minutes)>x.date_time) then
   raise exception 'This change overlaps another in-person reservation.';
  end if;
 end loop;
 return null;
end $$;
revoke all on function private.validate_external_schedule() from public,anon,authenticated;
create trigger external_blocks_validate after insert or update on public.teacher_external_blocks
 for each row execute function private.validate_external_schedule();

create function private.guard_external_override()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.teacher_external_blocks;
begin
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 if TG_OP='DELETE' then return old; end if;
 if TG_OP='UPDATE' and row(new.block_id,new.on_date) is distinct from row(old.block_id,old.on_date) then
  raise exception 'The original occurrence cannot be reassigned to another series or date.';
 end if;
 select * into b from public.teacher_external_blocks where id=new.block_id;
 if TG_OP='INSERT' or row(new.block_id,new.on_date) is distinct from row(old.block_id,old.on_date) then
  if new.on_date not between b.start_date and b.end_date or extract(dow from new.on_date)<>b.weekday then
    raise exception 'Choose an original date from this weekly series.';
  end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function private.guard_external_override() from public,anon,authenticated;
create trigger external_overrides_guard before insert or update or delete on public.teacher_external_overrides
 for each row execute function private.guard_external_override();
create trigger external_overrides_validate after insert or update or delete on public.teacher_external_overrides
 for each row execute function private.validate_external_schedule();

-- Labels are visible only to Admin or the assigned teacher. Other callers receive busy intervals.
create function public.external_teacher_schedule()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=auth.uid(); staff boolean;
begin
 if caller is null or not exists(select 1 from public.app_users where id=caller) then
  raise exception 'Not authenticated' using errcode='42501';
 end if;
 staff:=coalesce(private.is_admin(),false);
 return jsonb_build_object(
 'blocks',(select coalesce(jsonb_agg(jsonb_build_object(
  'id',b.id,'teacher_id',b.teacher_id,'label',case when staff or b.teacher_id=caller then b.label else 'Reserved time' end,
  'weekday',b.weekday,'start_min',b.start_min,'end_min',b.end_min,'start_date',b.start_date,'end_date',b.end_date)), '[]'::jsonb)
  from public.teacher_external_blocks b),
 'overrides',(select coalesce(jsonb_agg(jsonb_build_object('block_id',o.block_id,'on_date',o.on_date,
  'cancelled',o.cancelled,'replacement_date',o.replacement_date,'start_min',o.start_min,'end_min',o.end_min,'updated_at',o.updated_at)), '[]'::jsonb)
  from public.teacher_external_overrides o));
end $$;
revoke all on function public.external_teacher_schedule() from public,anon;
grant execute on function public.external_teacher_schedule() to authenticated;

-- Realtime is best effort; clients also refresh on focus, reconnect and a visible-tab fallback.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='teacher_external_blocks') then
   alter publication supabase_realtime add table public.teacher_external_blocks;
  end if;
  alter publication supabase_realtime add table public.teacher_external_overrides;
 end if;
end $$;
