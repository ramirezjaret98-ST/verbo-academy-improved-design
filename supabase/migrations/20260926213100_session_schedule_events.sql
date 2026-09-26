-- A committed schedule change owns its notification, independent of the browser.
create extension if not exists pg_cron;
create table public.session_schedule_events (
 id uuid primary key default gen_random_uuid(), session_id bigint not null references public.sessions(id) on delete cascade,
 student_id uuid, teacher_id uuid, previous_teacher_id uuid, kind text not null,
 previous_date_time timestamptz, date_time timestamptz not null, reason text,
 created_at timestamptz not null default now()
);
alter table public.session_schedule_events enable row level security;
revoke all on public.session_schedule_events from anon,authenticated;
grant select on public.session_schedule_events to authenticated;
create policy session_schedule_events_read on public.session_schedule_events for select to authenticated
 using(student_id=auth.uid() or teacher_id=auth.uid() or previous_teacher_id=auth.uid() or private.is_coordinator_ops());
create index session_schedule_events_session_idx on public.session_schedule_events(session_id,created_at desc);

create table private.session_email_jobs (
 id uuid primary key references public.session_schedule_events(id) on delete cascade,
 token text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
 payload jsonb not null, status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_until timestamptz, last_error text, created_at timestamptz not null default now()
);
alter table private.session_email_jobs enable row level security;
revoke all on private.session_email_jobs from public,anon,authenticated;
grant all on private.session_email_jobs to service_role;
create index session_email_jobs_pending_idx on private.session_email_jobs(next_attempt_at) where status in ('pending','sending');

create function private.queue_session_schedule_event() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; event_id uuid; previous_teacher uuid; capability text;
begin
 if new.date_time is distinct from old.date_time or new.teacher_id is distinct from old.teacher_id then
   k:=case when old.status='pending_reschedule' or (not old.student_reschedule_used and new.student_reschedule_used) then 'reschedule_approved' else 'admin_rescheduled' end;
 elsif new.status='pending_reschedule' and old.status<>'pending_reschedule' then k:='pending_reschedule';
 elsif old.status='pending_reschedule' and new.status='scheduled' then k:='reschedule_declined';
 else return new; end if;
 previous_teacher:=case when old.teacher_id is distinct from new.teacher_id then old.teacher_id end;
 insert into public.session_schedule_events(session_id,student_id,teacher_id,previous_teacher_id,kind,previous_date_time,date_time,reason)
 values(new.id,new.student_id,new.teacher_id,previous_teacher,k,old.date_time,new.date_time,nullif(current_setting('academy.reschedule_reason',true),'')) returning id into event_id;
 insert into private.session_email_jobs(id,payload) values(event_id,jsonb_build_object(
   'sessionId',new.id,'kind',k,'eventId',event_id,'session',to_jsonb(new),
   'previousTeacherId',previous_teacher,'extra',jsonb_build_object('previousDateTime',old.date_time,'reason',nullif(current_setting('academy.reschedule_reason',true),'')))) returning token into capability;
 -- Dispatch after commit; Cron recovers a failed/lost HTTP dispatch.
 begin
   perform net.http_post(url:='https://tudkeownvrohnijulsvk.supabase.co/functions/v1/session-email-worker',
     headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',event_id,'token',capability),timeout_milliseconds:=10000);
 exception when others then
   -- The durable job remains pending. Email transport must not undo a booking.
   null;
 end;
 return new;
end $$;
create trigger sessions_queue_schedule_event after update on public.sessions for each row execute function private.queue_session_schedule_event();

-- Worker authenticates each dispatch using a per-job random capability. No
-- service-role key is stored in SQL, Cron text, public tables or client code.
create function public.claim_session_email_job(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.session_email_jobs;
begin
 select * into j from private.session_email_jobs where id=p_id and token=p_token for update;
 if not found or j.status in ('sent','failed') or (j.status='sending' and j.lease_until>now()) or j.next_attempt_at>now() then return null; end if;
 update private.session_email_jobs set status='sending',attempts=attempts+1,lease_until=now()+interval '5 minutes' where id=p_id;
 return j.payload;
end $$;
create function public.finish_session_email_job(p_id uuid,p_ok boolean,p_error text default null) returns void
language sql security definer set search_path='' as $$
 update private.session_email_jobs set status=case when p_ok then 'sent' when attempts>=12 then 'failed' else 'pending' end,
   lease_until=null,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),last_error=left(p_error,500)
 where id=p_id and status='sending';
$$;
create function private.dispatch_session_email_jobs() returns void language plpgsql security definer set search_path='' as $$
declare j record;
begin
 for j in select id,token from private.session_email_jobs where next_attempt_at<=now()
   and (status='pending' or (status='sending' and lease_until<now())) and attempts<12 order by created_at limit 10 loop
   perform net.http_post(url:='https://tudkeownvrohnijulsvk.supabase.co/functions/v1/session-email-worker',
     headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',j.id,'token',j.token),timeout_milliseconds:=10000);
 end loop;
 update private.session_email_jobs set status='failed',last_error=coalesce(last_error,'retry_limit')
   where status='sending' and lease_until<now() and attempts>=12;
end $$;
revoke all on function public.claim_session_email_job(uuid,text),public.finish_session_email_job(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_session_email_job(uuid,text),public.finish_session_email_job(uuid,boolean,text) to service_role;
revoke all on function private.queue_session_schedule_event(),private.dispatch_session_email_jobs() from public,anon,authenticated;
alter publication supabase_realtime add table public.session_schedule_events;
select cron.schedule('academy-session-email-jobs','* * * * *','select private.dispatch_session_email_jobs()');
