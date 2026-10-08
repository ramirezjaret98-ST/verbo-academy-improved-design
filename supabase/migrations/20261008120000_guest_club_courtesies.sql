-- Guest courtesies have their own identity, seat and access capability.
-- Neither anon nor authenticated may read these tables through the Data API.
create table public.club_guest_invitations (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null check (length(trim(guest_name)) between 2 and 120),
  email text not null check (length(trim(email)) between 3 and 254),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  allowed_types text[] not null default array['insight','book']::text[],
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  invitation_sent_at timestamptz,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint guest_types_valid check (allowed_types <@ array['insight','book']::text[] and cardinality(allowed_types) > 0)
);

create table public.club_guest_bookings (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique references public.club_guest_invitations(id),
  club_id bigint not null references public.clubs(id),
  access_hash text not null unique check (access_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'booked' check (status in ('booked','cancelled','revoked')),
  attendance text check (attendance in ('present','absent')),
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  confirmation_sent_at timestamptz
);
create index club_guest_bookings_active_idx on public.club_guest_bookings(club_id)
  where status = 'booked';

create table public.club_guest_code_attempts (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);

alter table public.club_guest_invitations enable row level security;
alter table public.club_guest_bookings enable row level security;
alter table public.club_guest_code_attempts enable row level security;
revoke all on public.club_guest_invitations, public.club_guest_bookings,
  public.club_guest_code_attempts from public, anon, authenticated;
grant all on public.club_guest_invitations, public.club_guest_bookings,
  public.club_guest_code_attempts to service_role;

-- The public Edge Function calls this with service_role. A club row lock also
-- serializes the two potential claimants of the one extra guest seat.
create function public.reserve_guest_club(
  p_code_hash text, p_club_id bigint, p_access_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  invitation public.club_guest_invitations%rowtype;
  club public.clubs%rowtype;
  booking_id uuid;
begin
  select * into invitation from public.club_guest_invitations
    where code_hash = p_code_hash for update;
  if not found or invitation.revoked_at is not null or invitation.redeemed_at is not null
    or invitation.expires_at <= now() then
    raise exception 'Invalid or expired courtesy' using errcode = 'P0001';
  end if;

  select * into club from public.clubs where id = p_club_id for update;
  if not found or club.status <> 'upcoming' or club.date - now() < interval '24 hours'
    or club.teacher_id is null or nullif(trim(coalesce(club.link, '')), '') is null
    or not (club.type::text = any(invitation.allowed_types)) then
    raise exception 'This club is not available for this courtesy' using errcode = 'P0001';
  end if;
  if (select count(*) from public.club_guest_bookings
      where club_id = p_club_id and status = 'booked') >= 1 then
    raise exception 'The courtesy seat is no longer available' using errcode = 'P0001';
  end if;

  insert into public.club_guest_bookings(invitation_id, club_id, access_hash)
    values(invitation.id, club.id, p_access_hash) returning id into booking_id;
  update public.club_guest_invitations set redeemed_at = now() where id = invitation.id;
  return jsonb_build_object('booking_id', booking_id, 'email', invitation.email,
    'guest_name', invitation.guest_name, 'club_title', club.title,
    'club_date', club.date, 'club_type', club.type);
end $$;

create function public.cancel_guest_club(p_access_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  booking public.club_guest_bookings%rowtype;
  club public.clubs%rowtype;
begin
  select * into booking from public.club_guest_bookings where access_hash = p_access_hash;
  if not found then return false; end if;
  select * into club from public.clubs where id = booking.club_id for update;
  select * into booking from public.club_guest_bookings where id = booking.id for update;
  if booking.status <> 'booked' or club.status <> 'upcoming'
    or club.date - now() < interval '24 hours' then return false; end if;
  update public.club_guest_bookings set status = 'cancelled', cancelled_at = now()
    where id = booking.id;
  -- The invitation remains redeemed. Cancellation never restores its code.
  return true;
end $$;

create function public.revoke_guest_invitation(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare invitation public.club_guest_invitations%rowtype;
begin
  select * into invitation from public.club_guest_invitations
    where id = p_invitation_id for update;
  if not found then return false; end if;
  update public.club_guest_invitations set revoked_at = coalesce(revoked_at, now())
    where id = p_invitation_id;
  update public.club_guest_bookings set status = 'revoked', cancelled_at = now()
    where invitation_id = p_invitation_id and status = 'booked';
  return true;
end $$;

create function public.check_guest_code_rate_limit(p_key_hash text, p_limit integer default 10)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempt_count integer;
begin
  if p_limit < 1 or p_limit > 100 then return false; end if;
  insert into public.club_guest_code_attempts(key_hash) values (p_key_hash)
    on conflict (key_hash) do update set
      window_start = case when club_guest_code_attempts.window_start < now() - interval '15 minutes'
        then now() else club_guest_code_attempts.window_start end,
      attempts = case when club_guest_code_attempts.window_start < now() - interval '15 minutes'
        then 1 else club_guest_code_attempts.attempts + 1 end
    returning attempts into attempt_count;
  return attempt_count <= p_limit;
end $$;

revoke all on function public.reserve_guest_club(text,bigint,text),
  public.cancel_guest_club(text), public.revoke_guest_invitation(uuid),
  public.check_guest_code_rate_limit(text,integer) from public, anon, authenticated;
grant execute on function public.reserve_guest_club(text,bigint,text),
  public.cancel_guest_club(text), public.revoke_guest_invitation(uuid),
  public.check_guest_code_rate_limit(text,integer) to service_role;

-- A teacher can see only invited guests booked into their own club.
create function public.guest_club_roster(p_club_id bigint)
returns table(booking_id uuid, guest_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clubs c where c.id = p_club_id
    and (c.teacher_id = (select auth.uid()) or private.is_admin())) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query select b.id, i.guest_name
    from public.club_guest_bookings b
    join public.club_guest_invitations i on i.id = b.invitation_id
    where b.club_id = p_club_id and b.status = 'booked' and i.revoked_at is null
    order by b.booked_at;
end $$;
revoke all on function public.guest_club_roster(bigint) from public, anon;
grant execute on function public.guest_club_roster(bigint) to authenticated;

-- Extend the existing atomic report to account for guest attendance as well.
-- Student IDs retain their existing keys; guest keys use guest:<booking UUID>.
create or replace function public.submit_club_report(
  p_club_id bigint, p_comments text, p_attendance jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_club public.clubs%rowtype; v_report_id bigint;
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
    raise exception 'Attendance must be an object keyed by booked attendee ID.';
  end if;
  if exists (
    select 1 from public.club_bookings b where b.club_id = p_club_id
      and coalesce(p_attendance ->> b.student_id::text, '') not in ('present','absent')
  ) or exists (
    select 1 from public.club_guest_bookings b where b.club_id = p_club_id and b.status = 'booked'
      and coalesce(p_attendance ->> ('guest:' || b.id::text), '') not in ('present','absent')
  ) or exists (
    select 1 from jsonb_object_keys(p_attendance) as attendee(key)
    where not exists (select 1 from public.club_bookings b
      where b.club_id = p_club_id and b.student_id::text = attendee.key)
      and not exists (select 1 from public.club_guest_bookings b
      where b.club_id = p_club_id and b.status = 'booked' and ('guest:' || b.id::text) = attendee.key)
  ) then
    raise exception 'Attendance must match every real booking exactly.';
  end if;

  insert into public.club_reports(event_type, club_id, session_id, teacher_id, comments, submitted_at)
    values(v_club.type::text::public.club_report_event_type, p_club_id, null,
      v_club.teacher_id, nullif(trim(p_comments), ''), now()) returning id into v_report_id;
  insert into public.club_report_attendance(club_report_id, student_id, attendance)
    select v_report_id, b.student_id, p_attendance ->> b.student_id::text
    from public.club_bookings b where b.club_id = p_club_id;
  update public.club_guest_bookings b set attendance = p_attendance ->> ('guest:' || b.id::text)
    where b.club_id = p_club_id and b.status = 'booked';
  update public.clubs set status = 'completed' where id = p_club_id;
end $$;
revoke all on function public.submit_club_report(bigint,text,jsonb) from public, anon;
grant execute on function public.submit_club_report(bigint,text,jsonb) to authenticated;
