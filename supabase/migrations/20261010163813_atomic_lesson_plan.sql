-- U34: a lesson plan and its Ready status are one durable operation.
create or replace function public.save_lesson_plan_and_ready(
  p_session_id bigint, p_plan jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_session public.sessions%rowtype; v_first boolean; v_focus text[];
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if not (v_session.teacher_id = auth.uid() or private.is_super_admin() or private.is_coordinator_ops()) then
    raise exception 'Only the assigned teacher or Operations can save this plan' using errcode = '42501';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_plan->>'title', '')), '') is null then
    raise exception 'Plan title is required';
  end if;
  select not exists(select 1 from public.lesson_plans where session_id = p_session_id) into v_first;
  select coalesce(pg_catalog.array_agg(value), '{}'::text[]) into v_focus
    from pg_catalog.jsonb_array_elements_text(coalesce(p_plan->'focus_subskills', '[]'::jsonb)) as x(value);
  insert into public.lesson_plans
    (session_id, title, type, level_id, unit_id, custom_unit_id,
     focus_subskills, comments, planning_status, saved_at)
  values (p_session_id, pg_catalog.btrim(p_plan->>'title'),
    (p_plan->>'type')::public.lesson_session_type,
    nullif(p_plan->>'level_id', ''), nullif(p_plan->>'unit_id', ''),
    nullif(p_plan->>'custom_unit_id', '')::bigint, v_focus,
    coalesce(p_plan->>'comments', ''), coalesce(p_plan->>'planning_status', 'on-time'), pg_catalog.now())
  on conflict (session_id) do update set
    title = excluded.title, type = excluded.type,
    level_id = excluded.level_id, unit_id = excluded.unit_id,
    custom_unit_id = excluded.custom_unit_id,
    focus_subskills = excluded.focus_subskills,
    comments = excluded.comments, planning_status = excluded.planning_status,
    saved_at = excluded.saved_at;
  if v_session.status in ('scheduled','rescheduled','rearranged') then
    update public.sessions set status = 'ready' where id = p_session_id;
  end if;
  return v_first;
end;
$$;
revoke all on function public.save_lesson_plan_and_ready(bigint,jsonb) from public, anon;
grant execute on function public.save_lesson_plan_and_ready(bigint,jsonb) to authenticated;
