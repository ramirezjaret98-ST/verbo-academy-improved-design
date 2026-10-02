-- Temporary, service-only bridge for transferring the oversized legacy PDF
-- in bounded chunks. Removed after the Storage object has been verified.
create function public.club_legacy_media_chunk(
  p_club_id bigint,
  p_start integer,
  p_length integer
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if p_club_id <> 1 or p_start < 1 or p_length < 1 or p_length > 8388608
     or (p_start - 1) % 4 <> 0 or p_length % 4 <> 0 then
    raise exception 'Invalid media chunk';
  end if;
  select substring(split_part(material, ',', 2) from p_start for p_length)
    into result
  from private.club_media_legacy_backup
  where club_id = p_club_id and material like 'data:application/pdf;base64,%';
  return result;
end;
$$;

revoke all on function public.club_legacy_media_chunk(bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.club_legacy_media_chunk(bigint, integer, integer) to service_role;
