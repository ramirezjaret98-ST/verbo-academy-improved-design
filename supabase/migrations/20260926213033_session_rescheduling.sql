-- Atomic individual rescheduling. Availability is always Mexico City time.
alter table public.sessions add column student_reschedule_used boolean not null default false;

create function private.reschedule_notice(u public.app_users) returns integer
language sql immutable set search_path = '' as $$
 select greatest(0,coalesce(u.reschedule_custom_hours,substring(u.reschedule_policy from '(\d+)\s*h')::integer,24))
$$;

create function private.reschedule_slot_free(s public.sessions, t uuid, dt timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.app_users a where a.id=t and a.role='teacher' and a.teacher_status='active'
   and ((select u.product from public.app_users u where u.id=s.student_id) is null
     or (select u.product from public.app_users u where u.id=s.student_id)=any(a.qualified_products)))
 and exists(select 1 from public.teacher_availability a where a.teacher_id=t and a.confirmed_at is not null)
 and exists(select 1 from public.teacher_availability_blocks b where b.teacher_id=t
   and b.day::text=(array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from dt at time zone 'America/Mexico_City')::integer+1]
   and b.start_min<=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')
   and b.end_min>=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')+s.duration_minutes)
 and not exists(select 1 from public.sessions x where x.id<>s.id
   and (x.teacher_id=t or x.student_id=s.student_id)
   and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
   and x.date_time<dt+make_interval(mins=>s.duration_minutes)
   and x.date_time+make_interval(mins=>x.duration_minutes)>dt)
$$;

-- Every scheduling writer takes the same lock, including older admin clients.
-- Existing overlaps are not revalidated when editing reports or notes.
create function private.guard_session_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.date_time=old.date_time and new.teacher_id is not distinct from old.teacher_id
   and new.student_id is not distinct from old.student_id and new.duration_minutes=old.duration_minutes
   and (old.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
     or new.status not in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')) then return new; end if;
 if new.status not in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule') then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 if exists(select 1 from public.sessions x where x.id<>new.id and
   (x.teacher_id=new.teacher_id or (new.student_id is not null and x.student_id=new.student_id))
   and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
   and x.date_time<new.date_time+make_interval(mins=>new.duration_minutes)
   and x.date_time+make_interval(mins=>x.duration_minutes)>new.date_time) then
   raise exception 'That time overlaps another session. Refresh and choose another time.';
 end if;
 return new;
end $$;
create trigger sessions_guard_booking before insert or update on public.sessions for each row execute function private.guard_session_booking();

create function public.student_reschedule_slots(p_session_id bigint,p_date date)
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
 where d.dt>=now()+make_interval(hours=>private.reschedule_notice(u)) and d.dt<>s.date_time;
end $$;

create function public.student_request_reschedule(p_session_id bigint,p_datetime timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sessions; u public.app_users; r public.student_requests; quota integer; pct numeric; auto boolean; local_dt timestamp;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 -- Serialize quota checks, bookings and confirmations across all writers.
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 select * into s from public.sessions where id=p_session_id and student_id=auth.uid() for update;
 if not found then raise exception 'Session not found'; end if;
 if s.group_id is not null or s.workshop_cohort_id is not null then raise exception 'Group and Workshop sessions require manual review'; end if;
 select * into u from public.app_users where id=auth.uid() for update;
 if s.student_reschedule_used then raise exception 'You have already rescheduled this session once'; end if;
 select * into r from public.student_requests where origin_session_id=s.id and kind='reschedule' and status in ('open','escalated') order by id desc limit 1;
 if found then
   if r.proposed_datetime=p_datetime then return jsonb_build_object('outcome','review','request_id',r.id); end if;
   raise exception 'This session already has a request under review';
 end if;
 if s.status not in ('scheduled','ready','rescheduled','rearranged') then raise exception 'This session can no longer be rescheduled'; end if;
 if s.date_time<now()+make_interval(hours=>private.reschedule_notice(u)) or p_datetime<now()+make_interval(hours=>private.reschedule_notice(u)) then
   raise exception 'The original session and new time must meet the notice required by your plan'; end if;
 local_dt:=p_datetime at time zone 'America/Mexico_City';
 if p_datetime=s.date_time or extract(dow from local_dt)=0 or extract(second from local_dt)<>0
   or extract(minute from local_dt) not in (0,30) or local_dt::time<time '07:00'
   or local_dt::time+make_interval(mins=>s.duration_minutes)>time '22:00'
   or local_dt::date>(now() at time zone 'America/Mexico_City')::date+180 then raise exception 'Choose a valid Academy start time'; end if;
 pct:=coalesce(u.reschedule_custom_pct,substring(u.reschedule_policy from '(\d+)\s*%')::numeric,25);
 quota:=greatest(1,floor(coalesce(u.sessions_per_week,2)*4*pct/100)::integer);
 if (select count(*) from public.student_requests where student_id=auth.uid() and kind='reschedule' and status<>'cancelled'
   and date_trunc('month',requested_at at time zone 'America/Mexico_City')=date_trunc('month',now() at time zone 'America/Mexico_City'))>=quota then
   raise exception 'Your monthly reschedule allowance is exhausted'; end if;
 auto:=private.reschedule_slot_free(s,s.teacher_id,p_datetime);
 insert into public.student_requests(kind,student_id,assigned_teacher_id,origin_session_id,proposed_datetime,duration_minutes,status,claimed_by,claimed_at)
 values('reschedule',s.student_id,s.teacher_id,s.id,p_datetime,s.duration_minutes,
   case when auto then 'assigned'::public.student_request_status else 'open'::public.student_request_status end,
   case when auto then s.teacher_id end,case when auto then now() end) returning * into r;
 if auto then
   update public.sessions set date_time=p_datetime,status='rescheduled',student_reschedule_used=true where id=s.id;
 else
   update public.sessions set status='pending_reschedule' where id=s.id;
 end if;
 return jsonb_build_object('outcome',case when auto then 'confirmed' else 'review' end,'request_id',r.id);
end $$;

create function public.resolve_session_reschedule(p_session_id bigint,p_datetime timestamptz default null,p_teacher_id uuid default null,p_decline boolean default false,p_reason text default null,p_permanent boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sessions; r public.student_requests; t uuid; is_ops boolean;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 select * into s from public.sessions where id=p_session_id for update;
 if not found then raise exception 'Session not found'; end if;
 is_ops:=coalesce(private.is_coordinator_ops(),false);
 select * into r from public.student_requests where origin_session_id=s.id and kind='reschedule' and status in ('open','escalated') order by id desc limit 1 for update;
 if not is_ops and not (auth.uid()=s.teacher_id and r.id is not null and not p_decline) then raise exception 'Not allowed to resolve this request'; end if;
 if s.group_id is not null or s.workshop_cohort_id is not null then raise exception 'Use the existing group or Workshop review flow'; end if;
 if s.status not in ('scheduled','ready','rescheduled','rearranged','pending_reschedule') then raise exception 'This session can no longer be moved'; end if;
 if p_decline then
   if r.id is null then raise exception 'No pending request'; end if;
   update public.student_requests set status='cancelled' where id=r.id;
   perform set_config('academy.reschedule_reason',coalesce(p_reason,''),true);
   update public.sessions set status='scheduled' where id=s.id;
   return jsonb_build_object('outcome','declined');
 end if;
 t:=coalesce(p_teacher_id,s.teacher_id);
 if not is_ops and (t<>s.teacher_id or p_datetime is distinct from r.proposed_datetime) then raise exception 'Another teacher or time requires admin review'; end if;
 if p_datetime is null or p_datetime<=now() or p_datetime=s.date_time then raise exception 'Choose a new future time'; end if;
 if not private.reschedule_slot_free(s,t,p_datetime) then raise exception 'The teacher or student is unavailable at that time'; end if;
 if r.id is not null and s.student_reschedule_used then raise exception 'This session already used its student reschedule'; end if;
 if r.id is not null then
   update public.student_requests set status='assigned',claimed_by=t,claimed_at=now(),proposed_datetime=p_datetime where id=r.id;
 end if;
 update public.sessions set date_time=p_datetime,teacher_id=t,
   status=case when p_permanent then 'scheduled'::public.ext_session_status else 'rescheduled'::public.ext_session_status end,
   student_reschedule_used=student_reschedule_used or r.id is not null where id=s.id;
 return jsonb_build_object('outcome','confirmed','request_id',r.id);
end $$;

-- Students submit reschedules through the transactional RPC. Spotlight remains unchanged.
drop policy student_requests_student_insert on public.student_requests;
create policy student_requests_student_insert on public.student_requests for insert to authenticated
 with check(student_id=auth.uid() and (kind<>'reschedule' or
   (status='open' and claimed_by is null and claimed_at is null and exists(
     select 1 from public.sessions s join public.group_members gm on gm.group_id=s.group_id
     where s.id=origin_session_id and gm.student_id=auth.uid() and gm.status='active'))));
drop policy student_requests_student_escalate on public.student_requests;
create policy student_requests_student_escalate on public.student_requests for update to authenticated
 using(student_id=auth.uid() and status='open')
 with check(student_id=auth.uid() and status='escalated' and claimed_by is null and claimed_at is null);

-- Confirming a pending request from an older admin client still preserves the limit.
create function private.finish_reschedule_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='pending_reschedule' and new.status<>'pending_reschedule' then
   if new.date_time is distinct from old.date_time then
     new.student_reschedule_used:=true;
     update public.student_requests set status='assigned',claimed_by=new.teacher_id,claimed_at=now(),proposed_datetime=new.date_time
       where origin_session_id=new.id and kind='reschedule' and status in ('open','escalated');
   else
     update public.student_requests set status='cancelled' where origin_session_id=new.id and kind='reschedule' and status in ('open','escalated');
   end if;
 end if;
 -- The marker cannot be reset by ordinary direct writes.
 new.student_reschedule_used:=new.student_reschedule_used or old.student_reschedule_used;
 return new;
end $$;
create trigger sessions_finish_reschedule before update on public.sessions for each row execute function private.finish_reschedule_request();

revoke all on function private.reschedule_notice(public.app_users),private.reschedule_slot_free(public.sessions,uuid,timestamptz),private.guard_session_booking(),private.finish_reschedule_request() from public,anon,authenticated;
revoke all on function public.student_reschedule_slots(bigint,date),public.student_request_reschedule(bigint,timestamptz),public.resolve_session_reschedule(bigint,timestamptz,uuid,boolean,text,boolean) from public,anon;
grant execute on function public.student_reschedule_slots(bigint,date),public.student_request_reschedule(bigint,timestamptz),public.resolve_session_reschedule(bigint,timestamptz,uuid,boolean,text,boolean) to authenticated;
