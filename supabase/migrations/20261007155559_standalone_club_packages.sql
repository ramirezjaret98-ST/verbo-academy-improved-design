-- Standalone Clubs have one non-resetting credit pool per contracted package.
-- Performance students continue to use their existing monthly allowances.
alter table public.app_users
  add column club_package_id uuid,
  add column club_package_months integer,
  add column club_package_started_on date,
  add column club_package_expires_on date,
  add column club_insight_base integer not null default 0,
  add column club_book_base integer not null default 0,
  add column club_insight_bonus integer not null default 0,
  add column club_book_bonus integer not null default 0,
  add column club_package_changed_by uuid,
  add column club_package_change_reason text,
  add constraint club_package_terms_check check (
    (club_package_id is null and club_package_months is null and club_package_started_on is null and club_package_expires_on is null)
    or (club_package_id is not null and club_package_months in (1, 3, 6)
      and club_package_started_on is not null and club_package_expires_on is not null
      and club_package_expires_on >= (club_package_started_on + make_interval(months => 2 * club_package_months))::date
      and (club_insight_base = 4 * club_package_months or club_insight_base = 0)
      and (club_book_base = 4 * club_package_months or club_book_base = 0)
      and club_insight_base + club_book_base > 0)
  ),
  add constraint club_package_bonus_check check (club_insight_bonus >= 0 and club_book_bonus >= 0
    and (club_insight_base > 0 or club_insight_bonus = 0)
    and (club_book_base > 0 or club_book_bonus = 0));

alter table public.club_bookings add column club_package_id uuid;
create index club_bookings_package_type_idx on public.club_bookings (club_package_id, club_type)
  where club_package_id is not null;

create table public.club_package_audit (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.app_users(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.app_users(id) on delete set null,
  reason text,
  previous_package jsonb,
  new_package jsonb not null
);
alter table public.club_package_audit enable row level security;
revoke all on public.club_package_audit from anon, authenticated;
grant select on public.club_package_audit to authenticated;
create policy club_package_audit_admin_select on public.club_package_audit
  for select to authenticated using (private.is_admin());

create or replace function public.audit_club_package_change()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if row(new.club_package_id, new.club_package_months, new.club_package_started_on,
      new.club_package_expires_on, new.club_insight_base, new.club_book_base,
      new.club_insight_bonus, new.club_book_bonus)
    is distinct from
    row(old.club_package_id, old.club_package_months, old.club_package_started_on,
      old.club_package_expires_on, old.club_insight_base, old.club_book_base,
      old.club_insight_bonus, old.club_book_bonus) then
    insert into public.club_package_audit
      (student_id, changed_by, reason, previous_package, new_package)
    values (new.id, new.club_package_changed_by, new.club_package_change_reason,
      jsonb_build_object('id', old.club_package_id, 'months', old.club_package_months,
        'start', old.club_package_started_on, 'expires', old.club_package_expires_on,
        'insights', old.club_insight_base, 'books', old.club_book_base,
        'insight_bonus', old.club_insight_bonus, 'book_bonus', old.club_book_bonus),
      jsonb_build_object('id', new.club_package_id, 'months', new.club_package_months,
        'start', new.club_package_started_on, 'expires', new.club_package_expires_on,
        'insights', new.club_insight_base, 'books', new.club_book_base,
        'insight_bonus', new.club_insight_bonus, 'book_bonus', new.club_book_bonus));
  end if;
  return new;
end;
$function$;
revoke all on function public.audit_club_package_change() from public, anon, authenticated;
create trigger audit_club_package_change after update on public.app_users
  for each row execute function public.audit_club_package_change();

-- A standalone booking is assigned to the current package by the database,
-- never by a browser-supplied value. Club row locking serializes capacity and
-- package-credit checks for concurrent bookings of the same event.
create or replace function public.club_bookings_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_club public.clubs%rowtype;
  v_student public.app_users%rowtype;
  v_used integer;
  v_cap bigint;
  v_local_date date;
begin
  select * into v_club from public.clubs where id = new.club_id for update;
  if not found then raise exception 'Club % does not exist', new.club_id; end if;
  if new.club_type is distinct from v_club.type then
    raise exception 'Reservation type does not match this club.';
  end if;
  if v_club.status in ('cancelled', 'completed') then
    raise exception 'This session is no longer open for reservations.';
  end if;
  if v_club.date - now() < interval '24 hours' then
    raise exception 'Reservations close 24h before start.';
  end if;
  if coalesce(v_club.spots_taken, 0) >= v_club.spots_total then
    raise exception 'This session is full.';
  end if;

  select * into v_student from public.app_users where id = new.student_id for update;
  if not found then raise exception 'Student does not exist.'; end if;
  if v_student.product_type = 'insights' then
    v_local_date := (v_club.date at time zone 'America/Mexico_City')::date;
    if v_student.club_package_id is null
       or (now() at time zone 'America/Mexico_City')::date < v_student.club_package_started_on
       or (now() at time zone 'America/Mexico_City')::date >= v_student.club_package_expires_on
       or v_local_date < v_student.club_package_started_on
       or v_local_date >= v_student.club_package_expires_on then
      raise exception 'Your Clubs package has expired or does not cover this session.';
    end if;
    v_cap := case when v_club.type = 'book'
      then v_student.club_book_base::bigint + v_student.club_book_bonus
      else v_student.club_insight_base::bigint + v_student.club_insight_bonus end;
    if v_cap <= 0 then
      raise exception 'Your Clubs package does not include this collection.';
    end if;
    select count(*) into v_used from public.club_bookings b
      join public.clubs c on c.id = b.club_id
      where b.club_package_id = v_student.club_package_id and b.club_type = v_club.type
        and c.status <> 'cancelled';
    if v_used >= v_cap then
      raise exception 'You have used all reservations in this Clubs package.';
    end if;
    new.club_package_id := v_student.club_package_id;
  else
    -- Preserve the existing Performance path. A client cannot tag a booking
    -- with a package to bypass the monthly rules in the application.
    new.club_package_id := null;
  end if;

  update public.clubs set spots_taken = coalesce(spots_taken, 0) + 1 where id = new.club_id;
  return new;
end;
$function$;

-- Keep commercial fields immutable from the student's own API session.
create or replace function public.guard_app_users_self_update()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if row(new.club_package_id, new.club_package_months, new.club_package_started_on,
      new.club_package_expires_on, new.club_insight_base, new.club_book_base,
      new.club_insight_bonus, new.club_book_bonus,
      new.club_package_changed_by, new.club_package_change_reason)
    is distinct from
    row(old.club_package_id, old.club_package_months, old.club_package_started_on,
      old.club_package_expires_on, old.club_insight_base, old.club_book_base,
      old.club_insight_bonus, old.club_book_bonus,
      old.club_package_changed_by, old.club_package_change_reason)
    and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Clubs package changes require the authorized admin service';
  end if;
  if current_setting('request.jwt.claim.role', true) = 'service_role' then return new; end if;
  if private.is_admin() and auth.uid() is distinct from old.id then return new; end if;
  if private.is_super_admin() then return new; end if;
  if coalesce(current_setting('app.bypass_app_users_guard', true), '') = 'on' then return new; end if;
  if new.role is distinct from old.role
     or new.admin_type is distinct from old.admin_type
     or new.access_plan is distinct from old.access_plan
     or new.product is distinct from old.product
     or new.product_type is distinct from old.product_type
     or new.addon_insights_per_month is distinct from old.addon_insights_per_month
     or new.addon_bookclubs_per_month is distinct from old.addon_bookclubs_per_month
     or new.addon_spotlight_per_month is distinct from old.addon_spotlight_per_month
     or new.addon_workshops_enabled is distinct from old.addon_workshops_enabled
     or new.contracted_levels is distinct from old.contracted_levels
     or new.hired_sessions is distinct from old.hired_sessions
     or new.remaining_sessions is distinct from old.remaining_sessions
     or new.monthly_amount is distinct from old.monthly_amount
     or new.next_payment is distinct from old.next_payment
     or new.payment_day is distinct from old.payment_day
     or new.status is distinct from old.status
     or new.teacher_status is distinct from old.teacher_status
     or new.hourly_rate is distinct from old.hourly_rate
     or new.club_package_id is distinct from old.club_package_id
     or new.club_package_months is distinct from old.club_package_months
     or new.club_package_started_on is distinct from old.club_package_started_on
     or new.club_package_expires_on is distinct from old.club_package_expires_on
     or new.club_insight_base is distinct from old.club_insight_base
     or new.club_book_base is distinct from old.club_book_base
     or new.club_insight_bonus is distinct from old.club_insight_bonus
     or new.club_book_bonus is distinct from old.club_book_bonus
     or new.club_package_changed_by is distinct from old.club_package_changed_by
     or new.club_package_change_reason is distinct from old.club_package_change_reason
  then
    raise exception 'No tienes permiso para modificar campos restringidos de tu propio perfil';
  end if;
  return new;
end;
$function$;
