-- Only the account-creation service sets the credential year.
create function private.guard_student_password_year()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.welcome_password_year is not null)
     or (tg_op = 'UPDATE' and new.welcome_password_year is distinct from old.welcome_password_year) then
    if coalesce(auth.role(), '') <> 'service_role'
       and current_user not in ('postgres', 'supabase_admin') then
      raise exception 'Registration credential year is server-controlled';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_student_password_year() from public, anon, authenticated;
create trigger guard_student_password_year
before insert or update on public.app_users
for each row execute function private.guard_student_password_year();

