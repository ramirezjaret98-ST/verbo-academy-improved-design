-- Keep internal negotiation notes and the approving admin out of app_users,
-- which a student may read through the authenticated profile API.
drop trigger if exists audit_club_package_change on public.app_users;
create or replace function public.audit_club_package_change()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if row(new.club_package_id, new.club_package_months, new.club_package_started_on,
      new.club_package_expires_on, new.club_insight_base, new.club_book_base,
      new.club_insight_bonus, new.club_book_bonus)
    is distinct from
    row(old.club_package_id, old.club_package_months, old.club_package_started_on,
      old.club_package_expires_on, old.club_insight_base, old.club_book_base,
      old.club_insight_bonus, old.club_book_bonus) then
    insert into public.club_package_audit
      (student_id, changed_by, reason, previous_package, new_package)
    values (new.id, new.club_package_changed_by, new.club_package_change_reason,
      jsonb_build_object('id', old.club_package_id, 'months', old.club_package_months,
        'start', old.club_package_started_on, 'expires', old.club_package_expires_on,
        'insights', old.club_insight_base, 'books', old.club_book_base,
        'insight_bonus', old.club_insight_bonus, 'book_bonus', old.club_book_bonus),
      jsonb_build_object('id', new.club_package_id, 'months', new.club_package_months,
        'start', new.club_package_started_on, 'expires', new.club_package_expires_on,
        'insights', new.club_insight_base, 'books', new.club_book_base,
        'insight_bonus', new.club_insight_bonus, 'book_bonus', new.club_book_bonus));
  end if;
  new.club_package_changed_by := null;
  new.club_package_change_reason := null;
  return new;
end;
$function$;
revoke all on function public.audit_club_package_change() from public, anon, authenticated;
create trigger audit_club_package_change before update on public.app_users
  for each row execute function public.audit_club_package_change();
