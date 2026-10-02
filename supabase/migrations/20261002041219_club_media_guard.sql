-- The admin uploader now stores files in Storage and persists only URLs/paths.
-- Reject legacy data URLs so a future manual write cannot recreate a multi-MB
-- clubs row and broadcast the payload through Realtime.
alter table public.clubs
  add constraint clubs_cover_image_no_inline check (cover_image is null or cover_image !~* '^data:') not valid,
  add constraint clubs_material_no_inline check (material is null or material !~* '^data:') not valid;

alter table public.clubs validate constraint clubs_cover_image_no_inline;
alter table public.clubs validate constraint clubs_material_no_inline;

-- The private backup remains for rollback; the temporary transfer RPC does not.
drop function public.club_legacy_media_chunk(bigint, integer, integer);
