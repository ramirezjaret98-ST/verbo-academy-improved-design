-- U34: nullable admin helpers cannot grant report access.
-- U34: the report, performance, coverage and student credit commit together.
create or replace function public.submit_one_on_one_session_report(
  p_session_id bigint, p_attendance text, p_absent_cause text,
  p_sub_status public.attendance_sub_status, p_subskills jsonb,
  p_performance jsonb, p_report_comments text, p_notes text,
  p_exclude_pay boolean default false
) returns public.sessions language plpgsql security definer set search_path = '' as $$
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
  v_occurred := v_session.origin is null and not (v_absent and p_absent_cause = 'teacher');
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
$$;
revoke all on function public.submit_one_on_one_session_report(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean) from public, anon;
grant execute on function public.submit_one_on_one_session_report(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean) to authenticated;
