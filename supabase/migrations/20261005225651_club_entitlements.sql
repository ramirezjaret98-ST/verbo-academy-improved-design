-- Standalone club customers retain the historical product_type='insights'
-- key, but each collection is granted independently by its monthly allowance.
-- Existing Performance and staff catalog access remains unchanged.

drop policy if exists clubs_select_all on public.clubs;
create policy clubs_select_all on public.clubs
  for select to authenticated
  using (
    private.is_admin() or private.is_teacher() or exists (
      select 1 from public.app_users u
      where u.id = (select auth.uid()) and u.role = 'student'
        and (
          u.product_type is distinct from 'insights'
          or (clubs.type = 'insight' and coalesce(u.addon_insights_per_month, 0) > 0)
          or (clubs.type = 'book' and coalesce(u.addon_bookclubs_per_month, 0) > 0)
        )
    )
  );

create or replace function public.club_bookings_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_status public.time_status;
  v_type public.club_type;
  v_date timestamptz;
  v_spots_taken integer;
  v_spots_total integer;
  v_product_type public.product_type;
  v_insights integer;
  v_bookclubs integer;
begin
  select status, type, date, spots_taken, spots_total
    into v_status, v_type, v_date, v_spots_taken, v_spots_total
    from public.clubs where id = new.club_id for update;

  if not found then
    raise exception 'Club % does not exist', new.club_id;
  end if;
  if new.club_type is distinct from v_type then
    raise exception 'Reservation type does not match this club.';
  end if;
  if v_status in ('cancelled', 'completed') then
    raise exception 'This session is no longer open for reservations.';
  end if;
  if v_date - now() < interval '24 hours' then
    raise exception 'Reservations close 24h before start.';
  end if;
  if coalesce(v_spots_taken, 0) >= v_spots_total then
    raise exception 'This session is full.';
  end if;

  -- A student cannot bypass the catalog by posting directly to club_bookings.
  -- Admin-created reservations remain an intentional administrative action.
  if (select auth.uid()) = new.student_id then
    select product_type, addon_insights_per_month, addon_bookclubs_per_month
      into v_product_type, v_insights, v_bookclubs
      from public.app_users where id = new.student_id;
    if v_product_type = 'insights' and (
      (v_type = 'insight' and coalesce(v_insights, 0) <= 0)
      or (v_type = 'book' and coalesce(v_bookclubs, 0) <= 0)
    ) then
      raise exception 'Your Clubs access does not include this collection.';
    end if;
  end if;

  update public.clubs set spots_taken = coalesce(spots_taken, 0) + 1 where id = new.club_id;
  return new;
end;
$function$;

-- app_users has table-level UPDATE for authenticated users. Keep commercial
-- entitlements immutable in a student's own session even through direct API calls.
create or replace function public.guard_app_users_self_update()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if private.is_admin() and auth.uid() is distinct from old.id then
    return new;
  end if;
  if private.is_super_admin() then
    return new;
  end if;
  if coalesce(current_setting('app.bypass_app_users_guard', true), '') = 'on' then
    return new;
  end if;

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
  then
    raise exception 'No tienes permiso para modificar campos restringidos de tu propio perfil';
  end if;
  return new;
end;
$function$;
