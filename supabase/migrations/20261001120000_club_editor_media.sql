-- Club presentation metadata and narrow Storage write access for club covers.
alter table public.clubs
  add column if not exists subtitle text,
  add column if not exists instructions text,
  add column if not exists title_font text not null default 'sans',
  add column if not exists cover_position_x smallint not null default 50,
  add column if not exists cover_position_y smallint not null default 50,
  add column if not exists cover_scale numeric(3, 2) not null default 1;

alter table public.clubs
  add constraint clubs_title_font_check check (title_font in ('sans', 'serif', 'display')),
  add constraint clubs_cover_position_check check (cover_position_x between 0 and 100 and cover_position_y between 0 and 100),
  add constraint clubs_cover_scale_check check (cover_scale between 1 and 2);

create policy public_assets_club_covers_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'public-assets' and (storage.foldername(name))[1] = 'club-covers'
    and (private.is_super_admin() or private.is_coordinator_ops()));

-- Club PDF files use the existing private `materials` bucket. Its admin INSERT
-- and authenticated SELECT policies already cover these objects.

-- Reservations only use INSERT and DELETE. An UPDATE could move a student's
-- booking to another club without running the existing seat-count triggers.
drop policy if exists club_bookings_write_update on public.club_bookings;

create or replace function public.club_booking_type_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.club_type is distinct from (select c.type from public.clubs c where c.id = new.club_id) then
    raise exception 'Booking type does not match this club.';
  end if;
  return new;
end;
$$;
revoke all on function public.club_booking_type_guard() from public, anon, authenticated;
create trigger club_booking_type_guard_trg before insert or update on public.club_bookings
  for each row execute function public.club_booking_type_guard();
