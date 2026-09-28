-- Password values are configured separately in Vault; never commit them.
create table private.student_temporary_passwords (
  password_year smallint primary key,
  secret_id uuid not null references vault.secrets(id) on delete restrict
);
alter table private.student_temporary_passwords enable row level security;
revoke all on private.student_temporary_passwords from public, anon, authenticated;

alter table public.app_users add column welcome_password_year smallint;

create function public.student_temporary_password(p_year integer)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  temporary_password text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Server access only';
  end if;
  select s.decrypted_secret into temporary_password
    from private.student_temporary_passwords c
    join vault.decrypted_secrets s on s.id = c.secret_id
   where c.password_year = p_year;
  if temporary_password is null then raise exception 'Temporary password is not configured for this year'; end if;
  return temporary_password;
end;
$$;
revoke all on function public.student_temporary_password(integer) from public, anon, authenticated;
grant execute on function public.student_temporary_password(integer) to service_role;
