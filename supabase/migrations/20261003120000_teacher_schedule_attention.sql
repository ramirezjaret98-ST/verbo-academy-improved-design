-- Record scheduling intent separately from the session lifecycle status.
-- Existing events remain unclassified; only newly committed changes drive teacher attention.
alter table public.session_schedule_events
  add column change_scope text check (change_scope in ('one_off','regular')),
  add column batch_id uuid;
create index session_schedule_events_teacher_upcoming_idx on public.session_schedule_events(teacher_id,date_time,created_at desc) where change_scope is not null;

-- Reading a bell notification is not proof that the assigned teacher saw the new slot.
create table public.teacher_schedule_acknowledgements (
  event_id uuid not null references public.session_schedule_events(id) on delete cascade,
  teacher_id uuid not null references public.app_users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key(event_id,teacher_id)
);
alter table public.teacher_schedule_acknowledgements enable row level security;
revoke all on public.teacher_schedule_acknowledgements from public,anon,authenticated;
grant select,insert on public.teacher_schedule_acknowledgements to authenticated;
create policy teacher_schedule_ack_read on public.teacher_schedule_acknowledgements
  for select to authenticated using (teacher_id=(select auth.uid()) or private.is_coordinator_ops());
create policy teacher_schedule_ack_insert on public.teacher_schedule_acknowledgements
  for insert to authenticated with check (
    teacher_id=(select auth.uid()) and exists (
      select 1 from public.session_schedule_events e
      join public.sessions s on s.id=e.session_id
      where e.id=event_id and e.teacher_id=(select auth.uid()) and s.teacher_id=(select auth.uid())
        and e.kind in ('admin_rescheduled','reschedule_approved') and e.change_scope is not null
    )
  );

-- Both functions below are copied from their remote production definitions on 2026-10-03.
-- Changes are limited to event metadata and the bulk RPC's scheduling intent.
CREATE OR REPLACE FUNCTION private.queue_session_schedule_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k text; event_id uuid; previous_teacher uuid; capability text; job_id uuid; change jsonb; dispatch boolean:=true; change_scope text; change_batch_id uuid;
begin
 if new.date_time is distinct from old.date_time or new.teacher_id is distinct from old.teacher_id then
   k:=case when old.status='pending_reschedule' or (not old.student_reschedule_used and new.student_reschedule_used) then 'reschedule_approved' else 'admin_rescheduled' end;
 elsif new.status='pending_reschedule' and old.status<>'pending_reschedule' then k:='pending_reschedule';
 elsif old.status='pending_reschedule' and new.status='scheduled' then k:='reschedule_declined';
 else return new; end if;
 previous_teacher:=case when old.teacher_id is distinct from new.teacher_id then old.teacher_id end;
 change_scope:=coalesce(nullif(current_setting('academy.schedule_change_scope',true),''),'one_off');
 change_batch_id:=nullif(current_setting('academy.schedule_batch_id',true),'')::uuid;
 insert into public.session_schedule_events(session_id,student_id,teacher_id,previous_teacher_id,kind,previous_date_time,date_time,reason,change_scope,batch_id)
 values(new.id,new.student_id,new.teacher_id,previous_teacher,k,old.date_time,new.date_time,nullif(current_setting('academy.reschedule_reason',true),''),change_scope,change_batch_id) returning id into event_id;
 change:=jsonb_build_object('sessionId',new.id,'kind',k,'eventId',event_id,'session',jsonb_build_object(
   'id',new.id,'student_id',new.student_id,'teacher_id',new.teacher_id,'group_id',new.group_id,'date_time',new.date_time,'duration_minutes',new.duration_minutes),
   'previousTeacherId',previous_teacher,'extra',jsonb_build_object('previousDateTime',old.date_time,'reason',nullif(current_setting('academy.reschedule_reason',true),'')));
 if k='admin_rescheduled' then
   job_id:=gen_random_uuid();
   insert into private.session_email_jobs(id,batch_transaction_id,payload)
   values(job_id,txid_current(),jsonb_build_object('kind','admin_schedule_summary','eventId',job_id,'changes',jsonb_build_array(change)))
   on conflict(batch_transaction_id) do update set payload=jsonb_set(private.session_email_jobs.payload,'{changes}',private.session_email_jobs.payload->'changes' || jsonb_build_array(change))
   returning id,token,jsonb_array_length(payload->'changes')=1 into job_id,capability,dispatch;
 else
   job_id:=event_id;
   insert into private.session_email_jobs(id,event_id,payload) values(job_id,event_id,change) returning token into capability;
 end if;
 if dispatch then
   begin
     perform net.http_post(url:='https://tudkeownvrohnijulsvk.supabase.co/functions/v1/session-email-worker',headers:='{"Content-Type":"application/json"}'::jsonb,
       body:=jsonb_build_object('id',job_id,'token',capability),timeout_milliseconds:=10000);
   exception when others then null; end;
 end if;
 return new;
end $function$;


CREATE OR REPLACE FUNCTION public.admin_update_sessions(p_updates jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; s public.sessions; patch public.sessions; n integer:=0; change_batch_id uuid:=gen_random_uuid(); change_scope text;
begin
 if not private.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if jsonb_typeof(p_updates) is distinct from 'array' then raise exception 'Updates must be an array'; end if;
 if jsonb_array_length(p_updates)<1 or jsonb_array_length(p_updates)>500 then raise exception 'Choose between 1 and 500 sessions'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_updates) x)<>jsonb_array_length(p_updates) then raise exception 'Duplicate or missing session ID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('academy-bookings',0));
 perform 1 from public.sessions where id in(select (x->>'id')::bigint from jsonb_array_elements(p_updates) x) order by id for update;
 for item in select x from jsonb_array_elements(p_updates) x order by (x->>'id')::bigint loop
   select * into s from public.sessions where id=(item->>'id')::bigint;
   if not found then raise exception 'Session not found'; end if;
   if s.date_time<=now() or s.status not in ('scheduled','ready','rescheduled','rearranged','delayed') then raise exception 'Only active future sessions can be bulk edited'; end if;
   if not(item ? 'expected_date_time') or s.date_time is distinct from (item->>'expected_date_time')::timestamptz
     or not(item ? 'expected_teacher_id') or s.teacher_id is distinct from (item->>'expected_teacher_id')::uuid then raise exception 'Calendar changed; refresh before applying'; end if;
   if jsonb_typeof(item->'patch') is distinct from 'object' or exists(select 1 from jsonb_object_keys(item->'patch') f where f not in ('date_time','teacher_id','teams_link','status')) then raise exception 'Invalid bulk fields'; end if;
   change_scope:=coalesce(item->>'change_scope','one_off');
   if change_scope not in ('one_off','regular') then raise exception 'Invalid change scope'; end if;
   patch:=jsonb_populate_record(s,item->'patch');
   if patch.date_time<=now() or patch.teacher_id is null or patch.status not in ('scheduled','ready','rescheduled','rearranged','delayed') then raise exception 'Invalid future schedule'; end if;
   if not exists(select 1 from public.app_users where id=patch.teacher_id and role='teacher') then raise exception 'Teacher required'; end if;
   perform set_config('academy.schedule_change_scope',change_scope,true);
   perform set_config('academy.schedule_batch_id',change_batch_id::text,true);
   update public.sessions set date_time=patch.date_time,teacher_id=patch.teacher_id,teams_link=patch.teams_link,status=patch.status where id=s.id;
   n:=n+1;
 end loop;
 return n;
end $function$;
