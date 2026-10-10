-- U34: confirmed Admin follow-up for reports visible to their reporter.
alter table public.content_issue_reports
  add column if not exists resolution_note text,
  add column if not exists resolved_by uuid references public.app_users(id);
alter table public.conduct_reports
  add column if not exists resolution_note text,
  add column if not exists reviewed_by uuid references public.app_users(id);
alter table public.financial_issues
  add column if not exists status text not null default 'pending',
  add column if not exists resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.app_users(id);
alter table public.financial_issues
  add constraint financial_issues_status_check check (status in ('pending','resolved','dismissed'));

create policy financial_issues_update_fin on public.financial_issues
  for update to authenticated using (private.is_coordinator_fin())
  with check (private.is_coordinator_fin());

-- A reporter cannot self-mark an INSERT as reviewed or fabricate an Admin reply.
create or replace function private.guard_report_insert_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_admin() then return new; end if;
  if tg_table_name = 'content_issue_reports' then
    new.status := 'pending'; new.resolved_at := null;
    new.resolution_note := null; new.resolved_by := null;
  elsif tg_table_name = 'conduct_reports' then
    new.status := 'pending'; new.reviewed_at := null;
    new.resolution_note := null; new.reviewed_by := null;
  elsif tg_table_name = 'financial_issues' then
    new.status := 'pending'; new.resolved_at := null;
    new.resolution_note := null; new.resolved_by := null;
  end if;
  return new;
end;
$$;
create trigger guard_content_issue_insert before insert on public.content_issue_reports
  for each row execute function private.guard_report_insert_status();
create trigger guard_conduct_issue_insert before insert on public.conduct_reports
  for each row execute function private.guard_report_insert_status();
create trigger guard_financial_issue_insert before insert on public.financial_issues
  for each row execute function private.guard_report_insert_status();

create or replace function private.stamp_report_resolution()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if new.status::text <> 'pending' and nullif(pg_catalog.btrim(coalesce(new.resolution_note, '')), '') is null then
    raise exception 'A resolution note is required';
  end if;
  if tg_table_name = 'content_issue_reports' then
    new.resolved_at := case when new.status::text = 'pending' then null else pg_catalog.now() end;
    new.resolved_by := case when new.status::text = 'pending' then null else auth.uid() end;
  elsif tg_table_name = 'conduct_reports' then
    new.reviewed_at := case when new.status::text = 'pending' then null else pg_catalog.now() end;
    new.reviewed_by := case when new.status::text = 'pending' then null else auth.uid() end;
  elsif tg_table_name = 'financial_issues' then
    new.resolved_at := case when new.status::text = 'pending' then null else pg_catalog.now() end;
    new.resolved_by := case when new.status::text = 'pending' then null else auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger stamp_content_issue_resolution before update on public.content_issue_reports
  for each row execute function private.stamp_report_resolution();
create trigger stamp_conduct_issue_resolution before update on public.conduct_reports
  for each row execute function private.stamp_report_resolution();
create trigger stamp_financial_issue_resolution before update on public.financial_issues
  for each row execute function private.stamp_report_resolution();
