-- Additive rollout: existing reports/PDF objects and the v1 RPC remain untouched.
alter table public.sessions add column report_content jsonb;
alter table public.sessions add constraint sessions_report_content_size
  check (report_content is null or (jsonb_typeof(report_content)='object' and octet_length(report_content::text)<=80000));

create function private.guard_session_report_content() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP='INSERT' then
    if new.report_content is not null then raise exception 'Report content must be submitted with its report' using errcode='42501'; end if;
  elsif new.report_content is distinct from old.report_content then
    if old.report_content is not null or current_user <> 'postgres'
      or new.report_submitted_at is null or not new.report_locked then
      raise exception 'Report content is immutable and must be submitted with its report' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_session_report_content() from public,anon,authenticated;
create trigger sessions_report_content_guard before insert or update of report_content on public.sessions
for each row execute function private.guard_session_report_content();

create function private.submit_one_on_one_session_report_v2(
  p_session_id bigint,p_attendance text,p_absent_cause text,p_sub_status public.attendance_sub_status,
  p_subskills jsonb,p_performance jsonb,p_report_comments text,p_notes text,p_exclude_pay boolean,p_report_content jsonb
) returns public.sessions language plpgsql security definer set search_path = '' as $$
declare saved public.sessions; e jsonb; category text; has_entries boolean; reason text;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if jsonb_typeof(p_report_content) is distinct from 'object' or p_report_content->>'version' is distinct from '2'
    or jsonb_typeof(p_report_content->'entries') is distinct from 'array'
    or jsonb_typeof(p_report_content->'skipped') is distinct from 'object'
    or jsonb_typeof(p_report_content->'todayWin') is distinct from 'string'
    or jsonb_typeof(p_report_content->'nextMove') is distinct from 'string'
    or octet_length(p_report_content::text)>80000 then raise exception 'Invalid report content'; end if;
  if exists(select 1 from jsonb_object_keys(p_report_content) k where k not in ('version','todayWin','nextMove','entries','skipped')) then raise exception 'Unknown report fields'; end if;
  if p_attendance <> 'absent' then
    if length(btrim(p_report_content->>'todayWin')) not between 1 and 2000
      or length(btrim(p_report_content->>'nextMove')) not between 1 and 2000 then raise exception 'Today''s Win and Your Next Move are required (max 2000 characters)'; end if;
    if jsonb_array_length(p_report_content->'entries') not between 1 and 10 then raise exception 'Add between 1 and 10 learning entries'; end if;
    for e in select value from jsonb_array_elements(p_report_content->'entries') loop
      if jsonb_typeof(e) is distinct from 'object'
        or coalesce(e->>'type','') not in ('New word','Mistake','Pronunciation','Tip','Other')
        or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 100
        or jsonb_typeof(e->'term') is distinct from 'string' or length(btrim(e->>'term')) not between 1 and 2000
        or jsonb_typeof(e->'explanation') is distinct from 'string' or length(btrim(e->>'explanation')) not between 1 and 2000
        or (e ? 'example' and (jsonb_typeof(e->'example') is distinct from 'string' or length(e->>'example')>2000))
        or exists(select 1 from jsonb_object_keys(e) k where k not in ('id','type','term','explanation','example'))
      then raise exception 'Invalid learning entry'; end if;
    end loop;
    if (select count(distinct value->>'id') from jsonb_array_elements(p_report_content->'entries')) <> jsonb_array_length(p_report_content->'entries') then raise exception 'Duplicate learning entries'; end if;
    if exists(select 1 from jsonb_object_keys(p_report_content->'skipped') k where k not in ('New word','Mistake','Pronunciation','Tip')) then raise exception 'Invalid category review'; end if;
    foreach category in array array['New word','Mistake','Pronunciation','Tip'] loop
      has_entries := exists(select 1 from jsonb_array_elements(p_report_content->'entries') x where x->>'type'=category);
      reason := btrim(p_report_content->'skipped'->>category);
      if not has_entries and (jsonb_typeof(p_report_content->'skipped'->category) is distinct from 'string' or coalesce(length(reason),0) not between 1 and 500) then raise exception 'Review category: %',category; end if;
      if has_entries and p_report_content->'skipped' ? category then raise exception 'Category cannot be populated and omitted: %',category; end if;
    end loop;
  elsif p_report_content->>'todayWin' <> '' or p_report_content->>'nextMove' <> ''
    or jsonb_array_length(p_report_content->'entries')<>0 or p_report_content->'skipped'<>'{}'::jsonb then raise exception 'Absence reports must not contain learning assessments'; end if;
  -- The existing locked/authenticated transaction remains the authority for
  -- attendance, scores, teacher pay, credits, coverage and duplicate prevention.
  saved := public.submit_one_on_one_session_report(p_session_id,p_attendance,p_absent_cause,p_sub_status,p_subskills,p_performance,p_report_comments,p_notes,p_exclude_pay);
  update public.sessions set report_content=p_report_content where id=saved.id returning * into saved;
  return saved;
end $$;
revoke all on function private.submit_one_on_one_session_report_v2(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) from public,anon;
grant execute on function private.submit_one_on_one_session_report_v2(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) to authenticated;

create function public.submit_one_on_one_session_report_v2(
  p_session_id bigint,p_attendance text,p_absent_cause text,p_sub_status public.attendance_sub_status,
  p_subskills jsonb,p_performance jsonb,p_report_comments text,p_notes text,p_exclude_pay boolean,p_report_content jsonb
) returns public.sessions language sql security invoker set search_path = '' as $$
  select private.submit_one_on_one_session_report_v2(p_session_id,p_attendance,p_absent_cause,p_sub_status,p_subskills,p_performance,p_report_comments,p_notes,p_exclude_pay,p_report_content);
$$;
revoke all on function public.submit_one_on_one_session_report_v2(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) from public,anon;
grant execute on function public.submit_one_on_one_session_report_v2(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) to authenticated;
