-- Keep the original inline media for a controlled rollback while moving the
-- active club record to Storage. This private table is never exposed by the API.
create table if not exists private.club_media_legacy_backup (
  club_id bigint primary key,
  cover_image text,
  material text,
  backed_up_at timestamptz not null default now()
);

alter table private.club_media_legacy_backup enable row level security;
revoke all on private.club_media_legacy_backup from public, anon, authenticated;

insert into private.club_media_legacy_backup (club_id, cover_image, material)
select id, cover_image, material
from public.clubs
where cover_image like 'data:%' or material like 'data:%'
on conflict (club_id) do nothing;

-- The existing PDF is 8.15 MiB, just above the previous 8 MiB bucket limit.
-- New admin uploads remain capped at 8 MiB in the client.
update storage.buckets
set file_size_limit = 10 * 1024 * 1024
where id = 'materials' and (file_size_limit is null or file_size_limit < 10 * 1024 * 1024);
