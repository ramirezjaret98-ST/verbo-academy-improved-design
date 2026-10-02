-- Keep the implementation out of the exposed API schema. The public entry
-- points require an active teacher account before reaching the transaction.
alter function public.resequence_lesson_plans(bigint,bigint,text,boolean) set schema private;
alter function public.undo_lesson_plan_resequence(uuid) set schema private;
revoke all on function private.resequence_lesson_plans(bigint,bigint,text,boolean),
  private.undo_lesson_plan_resequence(uuid) from public, anon, authenticated;

create function public.resequence_lesson_plans(
  p_source_session_id bigint,
  p_target_session_id bigint,
  p_expected_snapshot text default null,
  p_apply boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.role = 'teacher'
      and coalesce(u.teacher_status::text, 'active') = 'active'
      and not coalesce(u.admin_disabled, false)
  ) then raise exception 'Only an active teacher can reorder lesson plans'; end if;
  return private.resequence_lesson_plans(p_source_session_id, p_target_session_id, p_expected_snapshot, p_apply);
end $$;

create function public.undo_lesson_plan_resequence(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.role = 'teacher'
      and coalesce(u.teacher_status::text, 'active') = 'active'
      and not coalesce(u.admin_disabled, false)
  ) then raise exception 'Only an active teacher can restore lesson plans'; end if;
  return private.undo_lesson_plan_resequence(p_event_id);
end $$;

revoke all on function public.resequence_lesson_plans(bigint,bigint,text,boolean),
  public.undo_lesson_plan_resequence(uuid) from public, anon;
grant execute on function public.resequence_lesson_plans(bigint,bigint,text,boolean),
  public.undo_lesson_plan_resequence(uuid) to authenticated;
