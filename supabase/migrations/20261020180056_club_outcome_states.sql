-- Kept separate because PostgreSQL must commit enum values before using them.
alter type public.time_status add value if not exists 'expired';
alter type public.time_status add value if not exists 'absent';
