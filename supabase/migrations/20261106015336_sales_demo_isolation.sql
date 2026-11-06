-- Sales demo is a server-owned identity, independent of existing test accounts.
alter table public.app_users
  add column is_sales_demo boolean not null default false,
  add column sales_demo_teacher_id uuid references public.app_users(id);
alter table public.app_users add constraint sales_demo_student_teacher
  check (not is_sales_demo or (role = 'student' and sales_demo_teacher_id is not null));
alter table public.sessions add column is_sales_demo boolean not null default false;
alter table public.clubs
  add column is_sales_demo boolean not null default false,
  add column sales_demo_owner_id uuid references public.app_users(id);
alter table public.clubs add constraint sales_demo_club_owner
  check (is_sales_demo = (sales_demo_owner_id is not null));

create function private.is_sales_demo(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_sales_demo from public.app_users where id = p_user_id), false)
$$;
revoke all on function private.is_sales_demo(uuid) from public;
grant execute on function private.is_sales_demo(uuid) to authenticated, anon;

create function private.guard_sales_demo_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare marker_changed boolean;
begin
  if tg_op = 'INSERT' then
    marker_changed := new.is_sales_demo or new.sales_demo_teacher_id is not null;
  else
    marker_changed := row(new.is_sales_demo,new.sales_demo_teacher_id) is distinct from row(old.is_sales_demo,old.sales_demo_teacher_id);
    if old.is_sales_demo and not new.is_sales_demo then raise exception 'A sales demo cannot be converted into a real student'; end if;
  end if;
  if marker_changed and auth.uid() is not null and not private.is_super_admin() then
    raise insufficient_privilege using message = 'Only Super Admin can manage sales demo identity';
  end if;
  if new.is_sales_demo then
    if not exists(select 1 from public.app_users t where t.id=new.sales_demo_teacher_id and t.role='teacher') then
      raise exception 'A sales demo requires its designated teacher';
    end if;
    new.exclude_from_financials := true;
    new.custom_price := 0;
    new.welcome_pending := false;
  end if;
  return new;
end $$;
revoke all on function private.guard_sales_demo_profile() from public;
create trigger aaa_sales_demo_profile before insert or update on public.app_users
  for each row execute function private.guard_sales_demo_profile();

create function private.derive_sales_demo_session() returns trigger
language plpgsql security definer set search_path = '' as $$
declare demo_teacher uuid; demo boolean;
begin
  select is_sales_demo,sales_demo_teacher_id into demo,demo_teacher from public.app_users where id=new.student_id;
  if tg_op='UPDATE' and old.is_sales_demo and not coalesce(demo,false) then
    raise exception 'A demo session cannot be reassigned to a real student';
  end if;
  new.is_sales_demo := coalesce(demo,false);
  if new.is_sales_demo then
    if new.teacher_id is distinct from demo_teacher or new.group_id is not null or new.workshop_cohort_id is not null then
      raise exception 'Sales demo sessions must use the designated demo teacher and individual calendar';
    end if;
    new.excluded_from_pay := true;
  end if;
  return new;
end $$;
revoke all on function private.derive_sales_demo_session() from public;
create trigger aaa_sales_demo_session before insert or update on public.sessions
  for each row execute function private.derive_sales_demo_session();

create function private.guard_sales_demo_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.app_users s where s.id=new.student_id and s.is_sales_demo and s.sales_demo_teacher_id is distinct from new.teacher_id) then
    raise exception 'Sales demo can only be assigned to its designated teacher';
  end if;
  return new;
end $$;
revoke all on function private.guard_sales_demo_assignment() from public;
create trigger aaa_sales_demo_assignment before insert or update on public.assignments
  for each row execute function private.guard_sales_demo_assignment();

create function private.guard_sales_demo_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare designated uuid;
begin
  select sales_demo_teacher_id into designated from public.app_users where id=new.student_id and is_sales_demo;
  if designated is not null then
    if new.claimed_by is not null and new.claimed_by is distinct from designated then
      raise exception 'Only the designated demo teacher can claim demo requests';
    end if;
    new.assigned_teacher_id := designated;
  end if;
  return new;
end $$;
revoke all on function private.guard_sales_demo_request() from public;
create trigger aaa_sales_demo_request before insert or update on public.student_requests
  for each row execute function private.guard_sales_demo_request();
create policy sales_demo_request_isolation on public.student_requests as restrictive for all to authenticated
using (not private.is_sales_demo(student_id) or student_id=(select auth.uid()) or private.is_admin()
  or private.teaches_student(student_id))
with check (not private.is_sales_demo(student_id) or student_id=(select auth.uid()) or private.is_admin()
  or private.teaches_student(student_id));

create function private.guard_sales_demo_club() returns trigger
language plpgsql security definer set search_path = '' as $$
declare designated uuid;
begin
  if tg_op='UPDATE' and row(new.is_sales_demo,new.sales_demo_owner_id) is distinct from row(old.is_sales_demo,old.sales_demo_owner_id)
    and auth.uid() is not null and not private.is_super_admin() then
    raise insufficient_privilege using message = 'Only Super Admin can manage demo club identity';
  end if;
  if tg_op='UPDATE' and old.is_sales_demo and not new.is_sales_demo then raise exception 'A demo club cannot become a real event'; end if;
  if new.is_sales_demo then
    select sales_demo_teacher_id into designated from public.app_users where id=new.sales_demo_owner_id and is_sales_demo;
    if designated is null or new.teacher_id is distinct from designated then raise exception 'Demo events require the designated demo teacher'; end if;
    new.teacher_payment := 0;
  elsif new.sales_demo_owner_id is not null then raise exception 'Invalid demo club owner';
  end if;
  return new;
end $$;
revoke all on function private.guard_sales_demo_club() from public;
create trigger aaa_sales_demo_club before insert or update on public.clubs
  for each row execute function private.guard_sales_demo_club();

create policy sales_demo_catalog_isolation on public.clubs as restrictive for select to anon, authenticated using (
  private.is_admin()
  or (private.is_sales_demo((select auth.uid())) and sales_demo_owner_id=(select auth.uid()))
  or (not private.is_sales_demo((select auth.uid())) and (not is_sales_demo or teacher_id=(select auth.uid())))
);

create function private.guard_sales_demo_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare demo_event boolean; demo_owner uuid;
begin
  select is_sales_demo,sales_demo_owner_id into demo_event,demo_owner from public.clubs where id=new.club_id;
  if tg_table_name='club_guest_bookings' then
    if demo_event then raise exception 'Demo events are not available for guest reservations'; end if;
  elsif private.is_sales_demo(new.student_id) is distinct from demo_event
    or (demo_event and demo_owner is distinct from new.student_id) then
    raise exception 'Demo reservations are separate from real Academy events';
  end if;
  return new;
end $$;
revoke all on function private.guard_sales_demo_booking() from public;
create trigger aaa_sales_demo_booking before insert or update on public.club_bookings
  for each row execute function private.guard_sales_demo_booking();
create trigger aaa_sales_demo_guest_booking before insert or update on public.club_guest_bookings
  for each row execute function private.guard_sales_demo_booking();

-- Private, expiring, one-use provisioning capability. No credentials are persisted.
create table private.sales_demo_setup_jobs (
  id uuid primary key default gen_random_uuid(), token_hash text not null,
  teacher_id uuid not null references public.app_users(id),
  expires_at timestamptz not null default now()+interval '10 minutes',
  claimed_at timestamptz, completed_at timestamptz, user_id uuid,
  error text
);
alter table private.sales_demo_setup_jobs enable row level security;
revoke all on private.sales_demo_setup_jobs from public,anon,authenticated;

create function public.claim_sales_demo_setup(p_id uuid,p_token text)
returns table(teacher_id uuid) language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise insufficient_privilege; end if;
  return query update private.sales_demo_setup_jobs j set claimed_at=now()
    where j.id=p_id and j.claimed_at is null and j.expires_at>now()
      and j.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    returning j.teacher_id;
end $$;
revoke all on function public.claim_sales_demo_setup(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_sales_demo_setup(uuid,text) to service_role;
create function public.finish_sales_demo_setup(p_id uuid,p_user_id uuid,p_error text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise insufficient_privilege; end if;
  update private.sales_demo_setup_jobs set completed_at=now(),user_id=p_user_id,error=left(p_error,200)
    where id=p_id and claimed_at is not null and completed_at is null;
end $$;
revoke all on function public.finish_sales_demo_setup(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_sales_demo_setup(uuid,uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.challenge_leaderboard()
 RETURNS TABLE(student_id uuid, legacy_id text, display_name text, avatar_seed text, use_real_avatar boolean, completed_count bigint, current_streak bigint, longest_streak bigint, last_delivery_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_users caller where caller.id = auth.uid()
      and caller.role in ('student', 'teacher', 'admin')
  ) then
    raise insufficient_privilege using message = 'An Academy account is required';
  end if;
  return query
  with deliveries as (
    -- A resubmission replaces the evidence, not the first participation date.
    select cs.id, cs.student_id, cs.status, cs.challenge_format,
      coalesce(min(h.submitted_at), cs.submitted_at) as delivered_at
    from public.challenge_submissions cs
    left join public.challenge_submission_history h on h.submission_id = cs.id
    group by cs.id, cs.student_id, cs.status, cs.challenge_format, cs.submitted_at
  ), approved as (
    select d.student_id, count(*) as completed
    from deliveries d where d.status = 'approved' group by d.student_id
  ), ordered_deliveries as (
    -- Preserve the existing normal/Mystery streak and fourteen-day interval.
    -- Lightning and Season retain independent completion/cooldown rules.
    select d.student_id, d.id, d.delivered_at,
      lag(d.delivered_at) over (partition by d.student_id order by d.delivered_at, d.id) as previous_at
    from deliveries d
    where d.status in ('pending_review', 'needs_resubmission', 'approved')
      and d.challenge_format in ('normal', 'mystery_box')
  ), grouped_deliveries as (
    select d.student_id, d.id, d.delivered_at,
      sum(case when d.previous_at is null or d.delivered_at - d.previous_at > interval '14 days'
        then 1 else 0 end) over (partition by d.student_id order by d.delivered_at, d.id) as streak_group
    from ordered_deliveries d
  ), streaks as (
    select d.student_id, d.streak_group, count(*) as length, max(d.delivered_at) as last_at
    from grouped_deliveries d group by d.student_id, d.streak_group
  ), student_stats as (
    select s.student_id, max(s.length) as longest, max(s.last_at) as last_at,
      (array_agg(s.length order by s.last_at desc))[1] as latest_length
    from streaks s group by s.student_id
  )
  select u.id, u.legacy_id,
    case when i.mode = 'nickname' and length(btrim(coalesce(i.nickname, ''))) > 0
      then btrim(i.nickname) else u.name end,
    case when i.mode = 'nickname' and length(btrim(coalesce(i.nickname, ''))) > 0
      then btrim(i.nickname) else u.name end,
    not (coalesce(i.mode, 'real') = 'nickname' and length(btrim(coalesce(i.nickname, ''))) > 0),
    coalesce(a.completed, 0),
    case when u.id = auth.uid() then
      case when s.last_at >= now() - interval '14 days' then coalesce(s.latest_length, 0) else 0 end
      else null end,
    case when u.id = auth.uid() then coalesce(s.longest, 0) else null end,
    case when u.id = auth.uid() then s.last_at else null end
  from public.app_users u
  left join public.leaderboard_identities i on i.student_id = u.id
  left join approved a on a.student_id = u.id
  left join student_stats s on s.student_id = u.id
  where u.role = 'student' and u.is_sales_demo = private.is_sales_demo(auth.uid())
  order by coalesce(a.completed, 0) desc, u.name, u.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.leaderboard_challenge_completion_counts()
 RETURNS TABLE(legacy_id text, completed_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select u.legacy_id, count(cs.id) as completed_count
  from public.app_users u
  left join public.challenge_submissions cs
    on cs.student_id = u.id and cs.status = 'approved'
  where u.role = 'student' and u.is_sales_demo = private.is_sales_demo(auth.uid()) and u.legacy_id is not null
  group by u.legacy_id
$function$
;

CREATE OR REPLACE FUNCTION private.queue_club_booking_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare event_id bigint; capability text; club_record public.clubs;
begin
  if private.is_sales_demo(new.student_id) then return new; end if;
  select * into club_record from public.clubs where id = new.club_id;
  insert into public.club_booking_events(booking_id, club_id, student_id, teacher_id, club_title, club_date, club_type, created_at)
    values(new.id, new.club_id, new.student_id, club_record.teacher_id, club_record.title,
      club_record.date, new.club_type::text, new.booked_at) returning id into event_id;
  insert into private.club_booking_email_jobs(id) values(event_id) returning token into capability;
  begin
    perform net.http_post(
      url := 'https://tudkeownvrohnijulsvk.supabase.co/functions/v1/club-booking-email-worker',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('id', event_id, 'token', capability),
      timeout_milliseconds := 10000);
  exception when others then
    -- Cron recovers dispatch; email transport must never undo the reservation.
    null;
  end;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.queue_session_schedule_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k text; event_id uuid; previous_teacher uuid; capability text; job_id uuid; change jsonb; dispatch boolean:=true; change_scope text; change_batch_id uuid;
begin
 if new.is_sales_demo then return new; end if;
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
end $function$
;
