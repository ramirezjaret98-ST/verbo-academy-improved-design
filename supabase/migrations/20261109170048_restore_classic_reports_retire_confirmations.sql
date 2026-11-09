-- Restore the original report table with Today's Win and optional next-session instructions.
-- Existing reports, v1/v2 clients, attendance/pay rules and PDF objects are preserved.
create function private.submit_one_on_one_session_report_v3(
  p_session_id bigint,p_attendance text,p_absent_cause text,p_sub_status public.attendance_sub_status,
  p_subskills jsonb,p_performance jsonb,p_report_comments text,p_notes text,p_exclude_pay boolean,p_report_content jsonb
) returns public.sessions language plpgsql security definer set search_path = '' as $$
declare saved public.sessions; e jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if jsonb_typeof(p_report_content) is distinct from 'object' or p_report_content->>'version' is distinct from '3'
    or jsonb_typeof(p_report_content->'entries') is distinct from 'array'
    or jsonb_typeof(p_report_content->'skipped') is distinct from 'object'
    or jsonb_typeof(p_report_content->'todayWin') is distinct from 'string'
    or jsonb_typeof(p_report_content->'nextMove') is distinct from 'string'
    or octet_length(p_report_content::text)>80000 then raise exception 'Invalid report content'; end if;
  if exists(select 1 from jsonb_object_keys(p_report_content) k where k not in ('version','todayWin','nextMove','entries','skipped')) then raise exception 'Unknown report fields'; end if;
  if p_attendance <> 'absent' then
    if length(btrim(p_report_content->>'todayWin')) not between 1 and 2000
      or length(p_report_content->>'nextMove')>2000 then raise exception 'Today''s Win is required; next-session instructions are optional (max 2000 characters)'; end if;
    if jsonb_array_length(p_report_content->'entries') not between 6 and 10 then raise exception 'Add between 6 and 10 learning entries'; end if;
    for e in select value from jsonb_array_elements(p_report_content->'entries') loop
      if jsonb_typeof(e) is distinct from 'object'
        or coalesce(e->>'type','') not in ('New word','Mistake','Pronunciation','Tip','Other')
        or jsonb_typeof(e->'id') is distinct from 'string' or length(e->>'id') not between 1 and 100
        or jsonb_typeof(e->'term') is distinct from 'string' or length(btrim(e->>'term')) not between 1 and 2000
        or jsonb_typeof(e->'explanation') is distinct from 'string' or length(btrim(e->>'explanation')) not between 1 and 2000
        or (e ? 'example' and (jsonb_typeof(e->'example') is distinct from 'string' or e->>'example'<>''))
        or exists(select 1 from jsonb_object_keys(e) k where k not in ('id','type','term','explanation','example'))
      then raise exception 'Invalid learning entry'; end if;
    end loop;
    if (select count(distinct value->>'id') from jsonb_array_elements(p_report_content->'entries')) <> jsonb_array_length(p_report_content->'entries') then raise exception 'Duplicate learning entries'; end if;
    if p_report_content->'skipped'<>'{}'::jsonb then raise exception 'Category review is no longer required'; end if;
  elsif p_report_content->>'todayWin' <> '' or p_report_content->>'nextMove' <> ''
    or jsonb_array_length(p_report_content->'entries')<>0 or p_report_content->'skipped'<>'{}'::jsonb then raise exception 'Absence reports must not contain learning assessments'; end if;
  -- The existing locked/authenticated transaction remains the authority for
  -- attendance, scores, teacher pay, credits, coverage and duplicate prevention.
  saved := public.submit_one_on_one_session_report(p_session_id,p_attendance,p_absent_cause,p_sub_status,p_subskills,p_performance,p_report_comments,p_notes,p_exclude_pay);
  update public.sessions set report_content=p_report_content where id=saved.id returning * into saved;
  return saved;
end $$;
revoke all on function private.submit_one_on_one_session_report_v3(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) from public,anon;
grant execute on function private.submit_one_on_one_session_report_v3(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) to authenticated;

create function public.submit_one_on_one_session_report_v3(
  p_session_id bigint,p_attendance text,p_absent_cause text,p_sub_status public.attendance_sub_status,
  p_subskills jsonb,p_performance jsonb,p_report_comments text,p_notes text,p_exclude_pay boolean,p_report_content jsonb
) returns public.sessions language sql security invoker set search_path = '' as $$
  select private.submit_one_on_one_session_report_v3(p_session_id,p_attendance,p_absent_cause,p_sub_status,p_subskills,p_performance,p_report_comments,p_notes,p_exclude_pay,p_report_content);
$$;
revoke all on function public.submit_one_on_one_session_report_v3(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) from public,anon;
grant execute on function public.submit_one_on_one_session_report_v3(bigint,text,text,public.attendance_sub_status,jsonb,jsonb,text,text,boolean,jsonb) to authenticated;

-- Retire double confirmation, including clients with an old tab open.
-- Preserve the ledger/history as an archive; no historical data is deleted.
revoke all on function public.session_control_list() from public,anon,authenticated;
revoke all on function private.session_control_list() from public,anon,authenticated;
revoke all on function public.session_control_save(text,text,jsonb) from public,anon,authenticated;
revoke all on function private.session_control_save(text,text,jsonb) from public,anon,authenticated;
