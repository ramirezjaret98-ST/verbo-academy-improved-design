-- Persist the financial arrays previously kept only in the admin browser.
-- NULL leaves one collection untouched; [] clears it. Both replacements and
-- the optional cycle reset commit together or not at all.
create or replace function public.admin_save_teacher_financial(
  p_teacher_id uuid,
  p_adjustments jsonb default null,
  p_payment_records jsonb default null,
  p_reset_hours boolean default false,
  p_expected_adjustment_ids bigint[] default null,
  p_expected_payment_ids bigint[] default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_coordinator_fin() then
    raise exception 'Only financial administrators can save teacher payments' using errcode = '42501';
  end if;
  if not exists (select 1 from public.app_users where id = p_teacher_id and role = 'teacher') then
    raise exception 'Teacher not found' using errcode = '22023';
  end if;
  if p_reset_hours and (p_adjustments is null or p_payment_records is null) then
    raise exception 'A cycle reset requires both financial collections' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20260930, pg_catalog.hashtext(p_teacher_id::text));
  if p_adjustments is not null and p_expected_adjustment_ids is distinct from
    (select coalesce(array_agg(id order by id), '{}'::bigint[])
       from public.teacher_adjustments where teacher_id = p_teacher_id) then
    raise exception 'Adjustments changed in another session; reload before saving' using errcode = '40001';
  end if;
  if p_payment_records is not null and p_expected_payment_ids is distinct from
    (select coalesce(array_agg(id order by id), '{}'::bigint[])
       from public.teacher_payment_records where teacher_id = p_teacher_id) then
    raise exception 'Payment records changed in another session; reload before saving' using errcode = '40001';
  end if;

  if p_adjustments is not null then
    if jsonb_typeof(p_adjustments) <> 'array' then
      raise exception 'Invalid adjustments list' using errcode = '22023';
    end if;
    if jsonb_array_length(p_adjustments) > 500 then
      raise exception 'Invalid adjustments list' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_adjustments) as entry
      where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry->'amount') <> 'number'
        or nullif(pg_catalog.btrim(entry->>'reason'), '') is null
        or nullif(entry->>'date', '') is null
    ) then
      raise exception 'Invalid adjustment' using errcode = '22023';
    end if;
    delete from public.teacher_adjustments where teacher_id = p_teacher_id;
    insert into public.teacher_adjustments (teacher_id, date, amount, reason)
    select p_teacher_id, left(entry->>'date', 10)::date,
      (entry->>'amount')::numeric, pg_catalog.btrim(entry->>'reason')
    from jsonb_array_elements(p_adjustments) as entry;
  end if;

  if p_payment_records is not null then
    if jsonb_typeof(p_payment_records) <> 'array' then
      raise exception 'Invalid payment records list' using errcode = '22023';
    end if;
    if jsonb_array_length(p_payment_records) > 500 then
      raise exception 'Invalid payment records list' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_payment_records) as entry
      where jsonb_typeof(entry) <> 'object'
        or nullif(entry->>'date', '') is null
        or entry->>'status' not in ('pending', 'paid')
    ) then
      raise exception 'Invalid payment record' using errcode = '22023';
    end if;
    delete from public.teacher_payment_records where teacher_id = p_teacher_id;
    insert into public.teacher_payment_records (teacher_id, date, status)
    select p_teacher_id, left(entry->>'date', 10)::date,
      (entry->>'status')::public.payment_record_status
    from jsonb_array_elements(p_payment_records) as entry;
  end if;

  if p_reset_hours then
    update public.app_users set hours_cycle = 0, hours_month = 0 where id = p_teacher_id;
  end if;
end;
$$;

revoke all on function public.admin_save_teacher_financial(uuid, jsonb, jsonb, boolean, bigint[], bigint[]) from public, anon;
grant execute on function public.admin_save_teacher_financial(uuid, jsonb, jsonb, boolean, bigint[], bigint[]) to authenticated;

-- The student cancellation and its late-notice teacher compensation share a
-- transaction. The server calculates the rate; the browser cannot supply it.
create or replace function public.student_set_session_status(
  p_session_id bigint, p_status public.ext_session_status,
  p_cancellation_note text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.sessions%rowtype;
  v_teacher public.app_users%rowtype;
  v_clock_start date;
  v_paused_days integer;
  v_active_days integer;
  v_rate numeric;
  v_late boolean;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_session.student_id is distinct from v_uid then
    raise exception 'No puedes modificar una sesión que no es tuya' using errcode = '42501';
  end if;
  if v_session.group_id is not null then
    raise exception 'Las sesiones de grupo usan otro flujo (upsert_session_member_statuses)';
  end if;
  if p_status not in ('absent', 'cancelled', 'pending_reschedule') then
    raise exception 'Estado no permitido para auto-servicio de alumno: %', p_status;
  end if;
  if v_session.status not in ('scheduled', 'ready', 'rescheduled') then
    raise exception 'Esta sesión ya no se puede modificar (estado actual: %)', v_session.status;
  end if;
  v_late := v_session.origin = 'spotlight' and p_status = 'cancelled'
            and v_session.date_time < pg_catalog.now() + interval '24 hours';
  update public.sessions
     set status = p_status,
         cancellation_note = case when v_session.origin = 'spotlight' and p_status = 'cancelled'
           then case when v_late
             then 'Cancelled by student with less than 24h notice — teacher paid.'
             else 'Cancelled by student with 24h+ notice — no payment.' end
           else coalesce(p_cancellation_note, cancellation_note) end
   where id = p_session_id;
  if v_late and v_session.teacher_id is not null then
    select * into v_teacher from public.app_users where id = v_session.teacher_id;
    if not found then raise exception 'Teacher not found'; end if;
    v_clock_start := case when v_teacher.hire_date is not null
      then (pg_catalog.date_trunc('month', v_teacher.hire_date::timestamp) + interval '1 month')::date
      else (pg_catalog.date_trunc('month', pg_catalog.now()) - interval '6 months')::date end;
    if v_teacher.tier_reset_at is not null then
      v_clock_start := greatest(v_clock_start, v_teacher.tier_reset_at::date);
    end if;
    v_paused_days := coalesce(v_teacher.tier_frozen_days, 0);
    if v_teacher.teacher_status::text = 'frozen' and v_teacher.tier_frozen_since is not null then
      v_paused_days := v_paused_days + greatest(0, current_date - v_teacher.tier_frozen_since::date);
    end if;
    v_active_days := greatest(0, current_date - v_clock_start - v_paused_days);
    v_rate := pg_catalog.round(coalesce(v_teacher.hourly_rate,
      120 + 10 * least(3, (v_active_days / 365)::integer)));
    insert into public.teacher_adjustments (teacher_id, date, amount, reason)
    values (v_session.teacher_id,
      (pg_catalog.now() at time zone 'America/Mexico_City')::date,
      v_rate, 'Spotlight Session — late cancellation (paid, <24h notice)');
  end if;
end;
$$;

-- Operations can approve a club release without gaining general access to
-- teacher finance. Releasing, recording the penalty, and clearing the request
-- happen together.
create or replace function public.admin_approve_club_release(
  p_request_id bigint, p_penalty numeric
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.club_release_requests%rowtype;
  v_club public.clubs%rowtype;
  v_label text;
begin
  if not (private.is_super_admin() or private.is_coordinator_ops()) then
    raise exception 'Only operations administrators can approve a club release' using errcode = '42501';
  end if;
  if p_penalty is null or p_penalty < 0 or p_penalty > 100000 then
    raise exception 'Invalid penalty' using errcode = '22023';
  end if;
  select * into v_request from public.club_release_requests where id = p_request_id for update;
  if not found then raise exception 'Release request not found'; end if;
  select * into v_club from public.clubs where id = v_request.club_id for update;
  if not found or v_club.teacher_id is distinct from v_request.teacher_id then
    raise exception 'Club assignment changed; reload before approving';
  end if;
  v_label := case when v_club.type = 'insight' then 'Insight' else 'Book Club' end;
  if p_penalty > 0 then
    insert into public.teacher_adjustments (teacher_id, date, amount, reason)
    values (v_request.teacher_id,
      (pg_catalog.now() at time zone 'America/Mexico_City')::date,
      -p_penalty,
      'Club release penalty — ' || v_label || ': ' || v_club.title || ' on ' ||
      pg_catalog.to_char(v_club.date, 'Mon DD, YYYY'));
  end if;
  update public.clubs set teacher_id = null, claimed_at = null where id = v_club.id;
  delete from public.club_release_requests where id = v_request.id;
end;
$$;
revoke all on function public.admin_approve_club_release(bigint, numeric) from public, anon;
grant execute on function public.admin_approve_club_release(bigint, numeric) to authenticated;
