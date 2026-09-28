-- Keep the per-session audit trail, but one admin transaction owns one summary.
alter table private.session_email_jobs add column event_id uuid references public.session_schedule_events(id) on delete cascade;
update private.session_email_jobs set event_id=id;
alter table private.session_email_jobs drop constraint session_email_jobs_id_fkey;
alter table private.session_email_jobs add column batch_transaction_id bigint unique;

create table private.session_email_deliveries (
 job_id uuid not null references private.session_email_jobs(id) on delete cascade,
 delivery_key text not null, message jsonb not null, provider_id text, sent_at timestamptz,
 primary key(job_id,delivery_key)
);
alter table private.session_email_deliveries enable row level security;
revoke all on private.session_email_deliveries from public,anon,authenticated;
grant all on private.session_email_deliveries to service_role;

create function public.prepare_session_email_delivery(p_job_id uuid,p_delivery_key text,p_message jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d private.session_email_deliveries;
begin
 if not exists(select 1 from private.session_email_jobs where id=p_job_id and status='sending') then raise exception 'Job not claimed'; end if;
 insert into private.session_email_deliveries(job_id,delivery_key,message) values(p_job_id,p_delivery_key,p_message) on conflict do nothing;
 select * into d from private.session_email_deliveries where job_id=p_job_id and delivery_key=p_delivery_key;
 return jsonb_build_object('message',d.message,'sent',d.sent_at is not null,'id',d.provider_id);
end $$;
create function public.confirm_session_email_delivery(p_job_id uuid,p_delivery_key text,p_provider_id text) returns void
language sql security definer set search_path='' as $$
 update private.session_email_deliveries set sent_at=now(),provider_id=p_provider_id where job_id=p_job_id and delivery_key=p_delivery_key and sent_at is null;
$$;
revoke all on function public.prepare_session_email_delivery(uuid,text,jsonb),public.confirm_session_email_delivery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_session_email_delivery(uuid,text,jsonb),public.confirm_session_email_delivery(uuid,text,text) to service_role;

create or replace function private.queue_session_schedule_event() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; event_id uuid; previous_teacher uuid; capability text; job_id uuid; change jsonb; dispatch boolean:=true;
begin
 if new.date_time is distinct from old.date_time or new.teacher_id is distinct from old.teacher_id then
   k:=case when old.status='pending_reschedule' or (not old.student_reschedule_used and new.student_reschedule_used) then 'reschedule_approved' else 'admin_rescheduled' end;
 elsif new.status='pending_reschedule' and old.status<>'pending_reschedule' then k:='pending_reschedule';
 elsif old.status='pending_reschedule' and new.status='scheduled' then k:='reschedule_declined';
 else return new; end if;
 previous_teacher:=case when old.teacher_id is distinct from new.teacher_id then old.teacher_id end;
 insert into public.session_schedule_events(session_id,student_id,teacher_id,previous_teacher_id,kind,previous_date_time,date_time,reason)
 values(new.id,new.student_id,new.teacher_id,previous_teacher,k,old.date_time,new.date_time,nullif(current_setting('academy.reschedule_reason',true),'')) returning id into event_id;
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
end $$;

create or replace function public.finish_session_email_job(p_id uuid,p_ok boolean,p_error text default null) returns void
language sql security definer set search_path='' as $$
 update private.session_email_jobs set status=case when p_ok then 'sent' when attempts>=12 then 'failed' else 'pending' end,
   lease_until=null,next_attempt_at=case
     when p_error like '%daily_quota_exceeded%' then (date_trunc('day',now() at time zone 'UTC')+interval '1 day 5 minutes') at time zone 'UTC'
     when p_error like '%monthly_quota_exceeded%' then now()+interval '1 day'
     else now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)) end,
   last_error=left(p_error,500)
 where id=p_id and status='sending';
$$;

-- One authenticated admin request = one transaction, one summary, no partial save.
create function public.admin_update_sessions(p_updates jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare item jsonb; s public.sessions; patch public.sessions; n integer:=0;
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
   patch:=jsonb_populate_record(s,item->'patch');
   if patch.date_time<=now() or patch.teacher_id is null or patch.status not in ('scheduled','ready','rescheduled','rearranged','delayed') then raise exception 'Invalid future schedule'; end if;
   if not exists(select 1 from public.app_users where id=patch.teacher_id and role='teacher') then raise exception 'Teacher required'; end if;
   update public.sessions set date_time=patch.date_time,teacher_id=patch.teacher_id,teams_link=patch.teams_link,status=patch.status where id=s.id;
   n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.admin_update_sessions(jsonb) from public,anon;
grant execute on function public.admin_update_sessions(jsonb) to authenticated;
