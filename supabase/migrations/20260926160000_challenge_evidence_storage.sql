-- Additive migration. Does not change Auth, app_users, existing buckets or session RPCs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('challenge-evidence', 'challenge-evidence', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

create or replace function private.can_read_challenge_evidence(object_name text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  student_folder text := (storage.foldername(object_name))[1];
begin
  if auth.uid() is null then return false; end if;
  if student_folder is null or student_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return student_folder = auth.uid()::text
    or private.is_admin()
    or private.teaches_student(student_folder::uuid);
end;
$$;
revoke all on function private.can_read_challenge_evidence(text) from public, anon;
grant execute on function private.can_read_challenge_evidence(text) to authenticated;

create policy challenge_evidence_student_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'challenge-evidence'
  and private.is_student()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
);
create policy challenge_evidence_scoped_select on storage.objects
for select to authenticated using (
  bucket_id = 'challenge-evidence' and private.can_read_challenge_evidence(name)
);
-- No UPDATE/DELETE permission: submitted evidence and previous attempts remain immutable.
