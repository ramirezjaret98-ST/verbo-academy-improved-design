-- One immutable event per committed club reservation. The event drives the bell;
-- a private job drives email even if the student's browser closes.
create table public.club_booking_events (
  id bigint generated always as identity primary key,
  booking_id bigint not null unique,
  club_id bigint not null,
  student_id uuid not null,
  teacher_id uuid,
  club_title text not null,
  club_date timestamptz not null,
  club_type text not null check (club_type in ('book', 'insight')),
  created_at timestamptz not null default now()
);
create index club_booking_events_teacher_idx on public.club_booking_events (teacher_id, created_at desc);
alter table public.club_booking_events enable row level security;
revoke all on public.club_booking_events from anon, authenticated;
grant select on public.club_booking_events to authenticated;
create policy club_booking_events_read on public.club_booking_events for select to authenticated
  using (student_id = (select auth.uid()) or teacher_id = (select auth.uid()) or private.is_admin());

create table private.club_booking_email_jobs (
  id bigint primary key references public.club_booking_events(id) on delete cascade,
  token text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  sent_to text[] not null default '{}',
  last_error text,
  created_at timestamptz not null default now()
);
alter table private.club_booking_email_jobs enable row level security;
revoke all on private.club_booking_email_jobs from public, anon, authenticated;
grant all on private.club_booking_email_jobs to service_role;
create index club_booking_email_jobs_pending_idx on private.club_booking_email_jobs(next_attempt_at)
  where status in ('pending', 'sending');

create function private.queue_club_booking_email() returns trigger language plpgsql security definer set search_path = '' as $$
declare event_id bigint; capability text; club_record public.clubs;
begin
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
end $$;
create trigger club_bookings_queue_email after insert on public.club_bookings
  for each row execute function private.queue_club_booking_email();

create function public.claim_club_booking_email_job(p_id bigint, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j private.club_booking_email_jobs; e public.club_booking_events;
begin
  select * into j from private.club_booking_email_jobs where id = p_id and token = p_token for update;
  if not found or j.status in ('sent','failed') or (j.status = 'sending' and j.lease_until > now())
    or j.next_attempt_at > now() then return null; end if;
  select * into e from public.club_booking_events where id = p_id;
  update private.club_booking_email_jobs set status = 'sending', attempts = attempts + 1,
    lease_until = now() + interval '5 minutes' where id = p_id;
  return jsonb_build_object('event', to_jsonb(e), 'sentTo', to_jsonb(j.sent_to));
end $$;

create function public.mark_club_booking_email_sent(p_id bigint, p_email text) returns void
language sql security definer set search_path = '' as $$
  update private.club_booking_email_jobs set sent_to = array_append(sent_to, lower(trim(p_email)))
    where id = p_id and status = 'sending' and not (lower(trim(p_email)) = any(sent_to));
$$;

create function public.finish_club_booking_email_job(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update private.club_booking_email_jobs set status = case when p_ok then 'sent' when attempts >= 12 then 'failed' else 'pending' end,
    lease_until = null, next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, least(attempts, 7))::integer)),
    last_error = left(p_error, 500) where id = p_id and status = 'sending';
$$;

create function private.dispatch_club_booking_email_jobs() returns void language plpgsql security definer set search_path = '' as $$
declare j record;
begin
  for j in select id, token from private.club_booking_email_jobs where next_attempt_at <= now()
    and (status = 'pending' or (status = 'sending' and lease_until < now()))
    and attempts < 12 order by created_at limit 10 loop
    perform net.http_post(
      url := 'https://tudkeownvrohnijulsvk.supabase.co/functions/v1/club-booking-email-worker',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('id', j.id, 'token', j.token),
      timeout_milliseconds := 10000);
  end loop;
  update private.club_booking_email_jobs set status = 'failed', last_error = coalesce(last_error, 'retry_limit')
    where status = 'sending' and lease_until < now() and attempts >= 12;
end $$;

revoke all on function public.claim_club_booking_email_job(bigint,text),
  public.mark_club_booking_email_sent(bigint,text),
  public.finish_club_booking_email_job(bigint,boolean,text) from public, anon, authenticated;
grant execute on function public.claim_club_booking_email_job(bigint,text),
  public.mark_club_booking_email_sent(bigint,text),
  public.finish_club_booking_email_job(bigint,boolean,text) to service_role;
revoke all on function private.queue_club_booking_email(), private.dispatch_club_booking_email_jobs() from public, anon, authenticated;
alter publication supabase_realtime add table public.club_booking_events;
select cron.schedule('academy-club-booking-email-jobs', '* * * * *', 'select private.dispatch_club_booking_email_jobs()');
