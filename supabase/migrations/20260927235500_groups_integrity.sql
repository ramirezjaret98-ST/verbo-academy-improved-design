-- One current group record per student, matching Academy's roster model.
create unique index if not exists group_members_one_row_per_student
  on public.group_members (student_id);

-- Teacher roster access must not rely on groups' admin-only SELECT policy.
create or replace function private.teacher_owns_group(p_group_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.groups
                where id = p_group_id and teacher_id = (select auth.uid()))
$$;
revoke all on function private.teacher_owns_group(bigint) from public, anon;
grant execute on function private.teacher_owns_group(bigint) to authenticated;

drop policy if exists group_members_teacher_read on public.group_members;
create policy group_members_teacher_read on public.group_members
for select to authenticated using (private.teacher_owns_group(group_id));

create or replace function private.guard_group_membership()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target public.groups%rowtype;
  active_count integer;
  source_company text;
begin
  if new.status <> 'active' then return new; end if;
  -- Serialize roster changes for the target group before checking capacity.
  select * into target from public.groups where id = new.group_id for update;
  if not found then raise exception 'Group not found'; end if;
  if tg_op = 'INSERT' then
    select count(*) into active_count from public.group_members
     where group_id = new.group_id and status = 'active';
  else
    select count(*) into active_count from public.group_members
     where group_id = new.group_id and status = 'active' and student_id <> old.student_id;
  end if;
  if active_count >= target.max_capacity then raise exception 'Group is full'; end if;
  if tg_op = 'UPDATE' and old.group_id <> new.group_id and old.status <> 'archived'
     and not (old.status = 'pending_removal' and old.removal_started_at <= now() - interval '30 days') then
    select company_client into source_company from public.groups where id = old.group_id;
    if source_company is distinct from target.company_client then
      raise exception 'Groups must belong to the same company or client';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_group_membership on public.group_members;
create trigger guard_group_membership before insert or update on public.group_members
for each row execute function private.guard_group_membership();

create or replace function private.guard_group_capacity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.max_capacity < (select count(*) from public.group_members
                         where group_id = new.id and status = 'active') then
    raise exception 'Capacity cannot be below active member count';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_group_capacity on public.groups;
create trigger guard_group_capacity before update of max_capacity on public.groups
for each row execute function private.guard_group_capacity();

create or replace function public.adjust_group_remaining_sessions(p_group_id bigint, p_delta integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  current_group public.groups%rowtype;
  next_remaining integer;
begin
  if p_delta is null or p_delta not in (-1, 1) then raise exception 'Invalid adjustment'; end if;
  select * into current_group from public.groups where id = p_group_id for update;
  if not found then raise exception 'Group not found'; end if;
  if not (private.is_admin() or
          (p_delta = -1 and current_group.teacher_id = (select auth.uid()))) then
    raise exception 'Not authorized';
  end if;
  next_remaining := greatest(0, least(coalesce(current_group.hired_sessions, 0),
    coalesce(current_group.remaining_sessions, 0) + p_delta));
  update public.groups set remaining_sessions = next_remaining where id = p_group_id;
  return next_remaining;
end;
$$;

revoke all on function public.adjust_group_remaining_sessions(bigint, integer) from public, anon;
grant execute on function public.adjust_group_remaining_sessions(bigint, integer) to authenticated;
