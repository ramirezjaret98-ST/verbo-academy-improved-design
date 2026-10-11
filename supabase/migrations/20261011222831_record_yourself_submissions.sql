-- A recorded exercise is evidence of practice, not a pronunciation grade.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-yourself', 'record-yourself', false, 10485760,
  array['audio/webm', 'audio/mp4', 'audio/ogg'])
on conflict (id) do nothing;

create table public.record_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.app_users(id),
  activity_id bigint not null references public.activities(id),
  audio_path text not null unique,
  reflection text not null check (char_length(btrim(reflection)) between 10 and 1000),
  duration_seconds integer not null check (duration_seconds between 2 and 90),
  created_at timestamptz not null default now(),
  constraint record_submissions_path_owner check (split_part(audio_path, '/', 1) = student_id::text)
);
create index record_submissions_student_created on public.record_submissions (student_id, created_at desc);
create index record_submissions_activity_student on public.record_submissions (activity_id, student_id, created_at desc);
alter table public.record_submissions enable row level security;
grant select, insert on public.record_submissions to authenticated;

create policy record_submissions_student_insert on public.record_submissions
for insert to authenticated with check (student_id = (select auth.uid()) and private.is_student());
create policy record_submissions_scoped_select on public.record_submissions
for select to authenticated using (
  student_id = (select auth.uid()) or private.is_admin() or private.teaches_student(student_id)
);

create or replace function private.validate_record_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.student_id <> auth.uid() then
    raise exception 'Recording owner mismatch';
  end if;
  if not exists (select 1 from public.activities a where a.id = new.activity_id and a.type::text = 'record') then
    raise exception 'Activity is not a recording exercise';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'record-yourself' and o.name = new.audio_path
      and o.owner_id = auth.uid()::text
  ) then
    raise exception 'Recording file is missing';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_record_submission() from public, anon, authenticated;
create trigger validate_record_submission before insert on public.record_submissions
for each row execute function private.validate_record_submission();

create or replace function private.mark_record_practice_complete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_scores (student_id, activity_id, best, attempts, attempted, last_at)
  values (new.student_id, new.activity_id, 0, 1, true, now())
  on conflict (student_id, activity_id) do update
    set best = 0,
        attempts = public.activity_scores.attempts + 1,
        attempted = true,
        last_at = excluded.last_at;
  return new;
end;
$$;
revoke all on function private.mark_record_practice_complete() from public, anon, authenticated;
create trigger mark_record_practice_complete after insert on public.record_submissions
for each row execute function private.mark_record_practice_complete();

create or replace function private.can_read_recording(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare student_folder text := (storage.foldername(object_name))[1];
begin
  if auth.uid() is null or student_folder is null
    or student_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return student_folder = auth.uid()::text or private.is_admin()
    or private.teaches_student(student_folder::uuid);
end;
$$;
revoke all on function private.can_read_recording(text) from public, anon;
grant execute on function private.can_read_recording(text) to authenticated;

create policy record_yourself_student_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'record-yourself' and private.is_student()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
);
create policy record_yourself_scoped_read on storage.objects
for select to authenticated using (
  bucket_id = 'record-yourself' and private.can_read_recording(name)
);
create policy record_yourself_remove_unsubmitted on storage.objects
for delete to authenticated using (
  bucket_id = 'record-yourself'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.record_submissions r where r.audio_path = name)
);
