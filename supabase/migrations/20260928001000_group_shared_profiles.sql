-- Shared program and teacher assignment are synchronized in the same
-- transaction as the group/member change. No email is sent by these triggers.
create or replace function private.apply_group_profile(p_group_id bigint, p_student_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  g public.groups%rowtype;
  previous_guard text;
begin
  select * into g from public.groups where id = p_group_id;
  if not found then return; end if;
  previous_guard := coalesce(current_setting('app.bypass_app_users_guard', true), '');
  perform set_config('app.bypass_app_users_guard', 'on', true);
  update public.app_users u set
    product_type = g.product_type, product = g.product, focus = g.focus,
    access_plan = g.access_plan, contracted_levels = g.contracted_levels,
    current_roadmap_level = g.current_roadmap_level, company = g.company_client,
    hired_sessions = g.hired_sessions, remaining_sessions = g.remaining_sessions,
    sessions_per_week = g.sessions_per_week, session_duration = g.session_duration,
    reschedule_policy = g.reschedule_policy, video_call_link = g.video_call_link,
    addon_insights_per_month = g.addon_insights_per_month,
    addon_bookclubs_per_month = g.addon_bookclubs_per_month,
    addon_spotlight_per_month = g.addon_spotlight_per_month,
    addon_workshops_enabled = g.addon_workshops_enabled,
    status = coalesce(u.status, 'active')
  where u.role = 'student' and exists (
    select 1 from public.group_members gm
     where gm.group_id = g.id and gm.student_id = u.id and gm.status <> 'archived'
       and (p_student_id is null or gm.student_id = p_student_id)
  );
  perform set_config('app.bypass_app_users_guard', previous_guard, true);
  delete from public.assignments a
  using public.group_members gm
  where gm.group_id = g.id and gm.status <> 'archived' and a.student_id = gm.student_id
    and (p_student_id is null or gm.student_id = p_student_id)
    and (g.teacher_id is null or a.teacher_id <> g.teacher_id);
  if g.teacher_id is not null then
    insert into public.assignments(student_id, teacher_id)
    select gm.student_id, g.teacher_id from public.group_members gm
     where gm.group_id = g.id and gm.status <> 'archived'
       and (p_student_id is null or gm.student_id = p_student_id)
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function private.apply_group_profile(bigint, uuid) from public, anon, authenticated;

create or replace function private.sync_group_member_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' then
    perform private.apply_group_profile(new.group_id, new.student_id);
  end if;
  return new;
end;
$$;
drop trigger if exists sync_group_member_profile on public.group_members;
create trigger sync_group_member_profile after insert or update of group_id, status on public.group_members
for each row execute function private.sync_group_member_profile();

create or replace function private.sync_group_shared_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.apply_group_profile(new.id);
  return new;
end;
$$;
drop trigger if exists sync_group_shared_profile on public.groups;
create trigger sync_group_shared_profile after update of product_type, product, focus, access_plan,
  contracted_levels, current_roadmap_level, company_client, hired_sessions, remaining_sessions,
  sessions_per_week, session_duration, reschedule_policy, video_call_link, teacher_id,
  addon_insights_per_month, addon_bookclubs_per_month, addon_spotlight_per_month,
  addon_workshops_enabled on public.groups
for each row execute function private.sync_group_shared_profile();
