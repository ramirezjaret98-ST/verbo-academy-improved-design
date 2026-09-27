-- Existing students retain their previous welcome status; only future student
-- registrations offer a deferred first welcome email.
alter table public.app_users
  add column welcome_pending boolean not null default false,
  add column welcome_sent_at timestamptz;

create function private.mark_student_welcome_pending() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.welcome_pending := new.role = 'student';
  return new;
end $$;

create trigger app_users_mark_welcome_pending before insert on public.app_users
for each row execute function private.mark_student_welcome_pending();

revoke all on function private.mark_student_welcome_pending() from public,anon,authenticated;
