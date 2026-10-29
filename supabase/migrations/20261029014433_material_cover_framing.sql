-- Preserve every existing cover's centered fill; edits keep the original image.
alter table public.materials
  add column cover_fit text not null default 'cover'
    constraint materials_cover_fit_check check (cover_fit in ('cover', 'contain')),
  add column cover_scale double precision not null default 1
    constraint materials_cover_scale_check check (cover_scale between 0.5 and 3),
  add column cover_position_x double precision not null default 50
    constraint materials_cover_position_x_check check (cover_position_x between 0 and 100),
  add column cover_position_y double precision not null default 50
    constraint materials_cover_position_y_check check (cover_position_y between 0 and 100);

-- Existing table privileges and admin write policies apply to these columns.
