-- Internal admin identity is authoritative in app_users. A disabled admin
-- loses the role used by RLS, including with an existing Auth token.
alter table public.app_users
  add column if not exists admin_disabled boolean not null default false;

create or replace function private."current_role"() returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select case when role = 'admin' and admin_disabled then null::public.user_role else role end
  from public.app_users where id = (select auth.uid())
$$;

create or replace function private.current_admin_type() returns public.admin_type
language sql stable security definer set search_path = ''
as $$
  select case when admin_disabled then null::public.admin_type else admin_type end
  from public.app_users where id = (select auth.uid())
$$;

-- app_users_update_self previously allowed arbitrary columns. Without this
-- guard any signed-in profile could change its own role/admin_type directly.
create or replace function private.guard_app_user_role_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    raise exception 'Account role cannot be changed through a profile update' using errcode = '42501';
  end if;
  if new.admin_type is distinct from old.admin_type
     or new.admin_disabled is distinct from old.admin_disabled then
    if not coalesce(private.is_super_admin(), false) then
      raise exception 'Only Super Admin may manage internal access' using errcode = '42501';
    end if;
    if old.role <> 'admin' or new.role <> 'admin' or new.admin_type is null then
      raise exception 'Internal access fields require an admin account' using errcode = '22023';
    end if;
    if old.id = auth.uid() and
       (new.admin_disabled or new.admin_type is distinct from old.admin_type) then
      raise exception 'Super Admin cannot remove their own access' using errcode = '42501';
    end if;
    if old.admin_type = 'super_admin' and not old.admin_disabled and
       (new.admin_type <> 'super_admin' or new.admin_disabled) then
      perform pg_catalog.pg_advisory_xact_lock(20260930, 14);
      if (select count(*) from public.app_users
          where role = 'admin' and admin_type = 'super_admin' and not admin_disabled) <= 1 then
        raise exception 'At least one active Super Admin is required' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_app_user_role_update on public.app_users;
create trigger guard_app_user_role_update
before update on public.app_users
for each row execute function private.guard_app_user_role_update();
