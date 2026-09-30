-- The admin's short topic category is the single source for the student carousel.
alter table public.clubs add column if not exists topic_tag text;
alter table public.clubs drop constraint if exists clubs_topic_tag_length_check;
alter table public.clubs add constraint clubs_topic_tag_length_check
  check (topic_tag is null or char_length(topic_tag) <= 40);
