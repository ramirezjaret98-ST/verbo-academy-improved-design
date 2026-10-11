-- Teacher reports about students need an auditable Admin outcome.
alter table public.student_reports
  add column status text not null default 'pending',
  add column resolution_note text,
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.app_users(id),
  add constraint student_reports_status_check check (status in ('pending','resolved','dismissed')),
  add constraint student_reports_resolution_check check (
    (status = 'pending' and resolution_note is null and resolved_at is null and resolved_by is null)
    or (status in ('resolved','dismissed') and nullif(btrim(resolution_note), '') is not null
      and resolved_at is not null and resolved_by is not null)
  );

drop policy if exists student_reports_insert on public.student_reports;
create policy student_reports_insert on public.student_reports for insert to authenticated
  with check (
    coalesce(private.is_super_admin(), false)
    or coalesce(private.is_coordinator_ops(), false)
    or (teacher_id = (select auth.uid()) and private.teaches_student(student_id)
      and status = 'pending' and resolution_note is null
      and resolved_at is null and resolved_by is null)
  );

create or replace function public.close_student_report(
  p_report_id bigint, p_status text, p_resolution_note text
) returns public.student_reports
language plpgsql security definer set search_path = '' as $$
declare v_report public.student_reports%rowtype;
begin
  if auth.uid() is null or not (
    coalesce(private.is_super_admin(), false)
    or coalesce(private.is_coordinator_ops(), false)
  ) then
    raise exception 'Operations admin required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_resolution_note, '')), '') is null then
    raise exception 'A follow-up note is required';
  end if;
  update public.student_reports set
    status = p_status,
    resolution_note = pg_catalog.btrim(p_resolution_note),
    resolved_at = pg_catalog.now(),
    resolved_by = auth.uid()
  where id = p_report_id
  returning * into v_report;
  if not found then raise exception 'Report not found'; end if;
  return v_report;
end;
$$;
revoke all on function public.close_student_report(bigint,text,text) from public, anon;
grant execute on function public.close_student_report(bigint,text,text) to authenticated;
