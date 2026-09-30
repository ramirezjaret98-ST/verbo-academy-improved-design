-- Project default function privileges include anon, so revoke it explicitly.
revoke execute on function public.submit_club_report(bigint, text, jsonb) from anon;
revoke execute on function public.club_booking_before_delete_cutoff() from anon, authenticated;
