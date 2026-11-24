-- Individual contract credits are allocated when a booking is created.
-- Existing rows retain their historical close-time behavior until reconciled.
alter table public.sessions
  add column session_credit text,
  add constraint sessions_session_credit_check
    check (session_credit in ('plan', 'courtesy', 'released'));

create function private.account_session_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_refundable boolean;
  v_delta integer;
  v_hired integer;
  v_balance integer;
  v_guard text;
begin
  if tg_op = 'INSERT' and tg_when = 'AFTER' then
    if new.session_credit is distinct from 'plan' then return new; end if;
    v_student := new.student_id;
    v_delta := -1;
  elsif tg_op = 'DELETE' then
    -- Removing a future reservation reopens that slot in the contract.
    if old.session_credit is distinct from 'plan' or old.date_time <= pg_catalog.now()
       or old.status not in ('scheduled', 'ready', 'rescheduled', 'rearranged', 'delayed', 'pending_reschedule') then
      return old;
    end if;
    v_student := old.student_id;
    v_delta := 1;
  else
    v_student := new.student_id;
    v_refundable := new.status = 'converted_to_spotlight'
      or (new.status = 'cancelled' and coalesce(new.attendance_sub_status::text = 'cancelled_holiday', false))
      or (new.status = 'absent' and coalesce(new.absent_cause = 'teacher', false));

    if tg_op = 'UPDATE' then
      if new.session_credit is distinct from old.session_credit then
        raise exception 'The session credit is managed by the schedule' using errcode = '42501';
      end if;
      if old.session_credit is null then
        return new;
      end if;
      if old.student_id is distinct from new.student_id or old.group_id is distinct from new.group_id
         or old.origin is distinct from new.origin
         or old.workshop_cohort_id is distinct from new.workshop_cohort_id
         or old.workshop_template_id is distinct from new.workshop_template_id then
        raise exception 'Create a new booking to change who this session belongs to';
      end if;
      if old.session_credit = 'courtesy' then
        return new;
      end if;
      if old.session_credit = 'plan' and v_refundable then
        v_delta := 1;
      elsif old.session_credit = 'released' and not v_refundable then
        v_delta := -1;
      else
        return new;
      end if;
    else
      if new.session_credit is not null and (new.session_credit <> 'courtesy'
          or not coalesce(private.is_admin(), false)) then
        raise exception 'Only an administrator can schedule a courtesy session' using errcode = '42501';
      end if;
      if v_student is null or new.group_id is not null or new.workshop_cohort_id is not null
         or new.workshop_template_id is not null or new.is_sales_demo
         or (new.origin is not null and new.origin <> 'course') then
        if new.session_credit is not null then
          raise exception 'Courtesy is only available for individual sessions';
        end if;
        return new;
      end if;
      if new.session_credit = 'courtesy' then
        return new;
      end if;
      select a.hired_sessions into v_hired from public.app_users a
        where a.id = v_student and a.role = 'student' for no key update;
      if coalesce(v_hired, 0) > 0 then
        new.session_credit := case when v_refundable then 'released' else 'plan' end;
      end if;
      return new;
    end if;
  end if;

  -- Serialize reservations for the same student, including concurrent bulk inserts.
  select a.hired_sessions, a.remaining_sessions into v_hired, v_balance
    from public.app_users a where a.id = v_student and a.role = 'student' for no key update;
  if coalesce(v_hired, 0) <= 0 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if v_delta < 0 and coalesce(v_balance, 0) <= 0 then
    raise exception 'No plan sessions available to schedule. Use a courtesy session if applicable.' using errcode = 'P0001';
  end if;

  v_guard := pg_catalog.current_setting('app.bypass_app_users_guard', true);
  perform pg_catalog.set_config('app.bypass_app_users_guard', 'on', true);
  update public.app_users
    set remaining_sessions = greatest(0, least(v_hired, coalesce(v_balance, 0) + v_delta))
    where id = v_student;
  perform pg_catalog.set_config('app.bypass_app_users_guard', coalesce(v_guard, ''), true);
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then return new; end if;
  new.session_credit := case when v_delta < 0 then 'plan' else 'released' end;
  return new;
end;
$$;

revoke all on function private.account_session_credit() from public, anon, authenticated;

create trigger sessions_account_credit
before insert or update or delete on public.sessions
for each row execute function private.account_session_credit();

-- Debit only persisted rows, including when a caller uses ON CONFLICT DO NOTHING.
create trigger sessions_account_inserted_credit
after insert on public.sessions
for each row execute function private.account_session_credit();

CREATE OR REPLACE FUNCTION public.submit_one_on_one_session_report(p_session_id bigint, p_attendance text, p_absent_cause text, p_sub_status attendance_sub_status, p_subskills jsonb, p_performance jsonb, p_report_comments text, p_notes text, p_exclude_pay boolean DEFAULT false)
 RETURNS sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_session public.sessions%rowtype; v_saved public.sessions%rowtype;
  v_absent boolean; v_occurred boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_attendance not in ('present','delayed','absent') then raise exception 'Invalid attendance'; end if;
  if nullif(pg_catalog.btrim(coalesce(p_notes, '')), '') is null then raise exception 'Class notes are required'; end if;
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.student_id is null or v_session.group_id is not null
      or v_session.workshop_cohort_id is not null or v_session.workshop_template_id is not null then
    raise exception 'One-on-one session unavailable';
  end if;
  if v_session.report_locked or v_session.report_submitted_at is not null then
    raise exception 'Report has already been submitted';
  end if;
  if not (v_session.teacher_id = auth.uid() or coalesce(private.is_super_admin(), false) or coalesce(private.is_coordinator_ops(), false)) then
    raise exception 'Only the assigned teacher or Operations can submit this report' using errcode = '42501';
  end if;
  if v_session.teacher_id is null then raise exception 'Assigned teacher is required'; end if;
  if p_exclude_pay and not coalesce(private.is_super_admin(), false) then
    raise exception 'Only a super admin can exclude teacher pay' using errcode = '42501';
  end if;
  v_absent := p_attendance = 'absent';
  if v_absent and coalesce(p_absent_cause, '') not in ('student','teacher') then
    raise exception 'Absent cause is required';
  end if;
  if not v_absent then
    if p_performance is null or p_subskills is null or pg_catalog.jsonb_typeof(p_subskills) <> 'object' then
      raise exception 'Performance scores are required';
    end if;
    if coalesce((p_performance->>'fluency')::numeric, -1) not between 0 and 5
      or coalesce((p_performance->>'vocabulary')::numeric, -1) not between 0 and 5
      or coalesce((p_performance->>'confidence')::numeric, -1) not between 0 and 5
      or coalesce((p_performance->>'grammar')::numeric, -1) not between 0 and 5 then
      raise exception 'Performance scores must be from 0 to 5';
    end if;
  end if;
  v_occurred := v_session.session_credit is null and v_session.origin is null and not (v_absent and p_absent_cause = 'teacher');
  update public.sessions set
    status = case when v_absent then 'absent'::public.ext_session_status else 'completed'::public.ext_session_status end,
    absent_cause = case when v_absent then p_absent_cause else null end,
    attendance_delayed = p_attendance = 'delayed',
    attendance_sub_status = case when v_absent then p_sub_status else null end,
    report_submitted_at = pg_catalog.now(), report_locked = true,
    report_comments = nullif(pg_catalog.btrim(coalesce(p_report_comments, '')), ''),
    notes = pg_catalog.btrim(p_notes),
    excluded_from_pay = case when p_exclude_pay then true else excluded_from_pay end
  where id = p_session_id returning * into v_saved;
  if not v_absent then
    insert into public.performance_ratings
      (session_id, student_id, teacher_id, fluency, vocabulary, confidence, grammar, subskills)
    values (p_session_id, v_session.student_id, v_session.teacher_id,
      (p_performance->>'fluency')::numeric, (p_performance->>'vocabulary')::numeric,
      (p_performance->>'confidence')::numeric, (p_performance->>'grammar')::numeric,
      coalesce(p_subskills, '{}'::jsonb))
    on conflict (session_id, student_id) do update set
      teacher_id = excluded.teacher_id, fluency = excluded.fluency,
      vocabulary = excluded.vocabulary, confidence = excluded.confidence,
      grammar = excluded.grammar, subskills = excluded.subskills,
      updated_at = pg_catalog.now();
  end if;
  delete from public.coverage_notes
    where teacher_id = v_session.teacher_id and student_id = v_session.student_id;
  if v_occurred then
    perform public.adjust_remaining_sessions(v_session.student_id, -1);
  end if;
  return v_saved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.student_convert_session_to_spotlight(p_original_session_id bigint, p_spotlight_context text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_orig public.sessions;
  v_new_id bigint;
  v_duration integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_orig from public.sessions where id = p_original_session_id for update;
  if not found then
    raise exception 'Session not found';
  end if;

  if v_orig.student_id is distinct from v_uid then
    raise exception 'No puedes modificar una sesión que no es tuya';
  end if;

  if v_orig.group_id is not null then
    raise exception 'Las sesiones de grupo no están soportadas en este flujo todavía';
  end if;

  if v_orig.status not in ('scheduled', 'ready', 'rescheduled') then
    raise exception 'Esta sesión ya no se puede convertir (estado actual: %)', v_orig.status;
  end if;

  update public.sessions set status = 'converted_to_spotlight' where id = p_original_session_id;

  v_duration := least(60, v_orig.duration_minutes);

  insert into public.sessions (student_id, teacher_id, date_time, duration_minutes, teams_link, status, origin, notes)
  values (v_uid, v_orig.teacher_id, v_orig.date_time, v_duration, v_orig.teams_link, 'scheduled', 'spotlight',
          'Spotlight (converted) — ' || coalesce(p_spotlight_context, ''))
  returning id into v_new_id;

  if v_orig.session_credit is null then
    perform set_config('app.bypass_app_users_guard', 'on', true);
    update public.app_users
    set remaining_sessions = least(coalesce(hired_sessions, 0), coalesce(remaining_sessions, 0) + 1)
    where id = v_uid;
  end if;

  return v_new_id;
end;
$function$;
