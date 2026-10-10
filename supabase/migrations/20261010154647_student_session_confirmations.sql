-- U34: durable first-login prompt and student-owned session actions.
alter table public.app_users add column if not exists profile_prompt_seen_at timestamptz;

-- Existing students who have already signed in passed their first login.
update public.app_users u
set profile_prompt_seen_at = pg_catalog.now()
from auth.users a
where a.id = u.id and u.role = 'student' and a.last_sign_in_at is not null
  and u.profile_prompt_seen_at is null;

create or replace function public.claim_student_profile_prompt()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_claimed boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform pg_catalog.set_config('app.bypass_app_users_guard', 'on', true);
  update public.app_users
     set profile_prompt_seen_at = pg_catalog.now()
   where id = auth.uid() and role = 'student' and profile_prompt_seen_at is null
   returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;
revoke all on function public.claim_student_profile_prompt() from public, anon;
grant execute on function public.claim_student_profile_prompt() to authenticated;

create or replace function public.student_rate_session(
  p_session_id bigint, p_rating integer, p_comment text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_session public.sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_rating not between 1 and 5 then raise exception 'Rating must be from 1 to 5'; end if;
  if p_rating <= 3 and nullif(pg_catalog.btrim(coalesce(p_comment, '')), '') is null then
    raise exception 'A comment is required for ratings of 3 or below';
  end if;
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.student_id is distinct from auth.uid()
     or v_session.group_id is not null or v_session.workshop_cohort_id is not null
     or v_session.workshop_template_id is not null then
    raise exception 'Session unavailable for rating' using errcode = '42501';
  end if;
  if v_session.student_rating is not null then raise exception 'Session already rated'; end if;
  if not (v_session.status = 'completed' or
    (v_session.status in ('scheduled','ready','rescheduled')
     and pg_catalog.now() between
       v_session.date_time + v_session.duration_minutes * interval '1 minute' - interval '10 minutes'
       and v_session.date_time + v_session.duration_minutes * interval '1 minute')) then
    raise exception 'Rating window is closed';
  end if;
  update public.sessions set student_rating = p_rating,
    student_comment = nullif(pg_catalog.btrim(coalesce(p_comment, '')), ''),
    review_status = case when p_rating <= 3 then 'pending' else review_status end
  where id = p_session_id;
end;
$$;
revoke all on function public.student_rate_session(bigint, integer, text) from public, anon;
grant execute on function public.student_rate_session(bigint, integer, text) to authenticated;

create or replace function public.student_group_session_action(
  p_session_id bigint, p_status public.ext_session_status,
  p_proposed_datetime timestamptz default null, p_last_report_summary text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare v_session public.sessions%rowtype; v_student public.app_users%rowtype;
  v_total integer; v_matching integer; v_notice integer; v_pct numeric;
  v_quota integer; v_used integer; v_top public.ext_session_status;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_status not in ('absent','cancelled','pending_reschedule') then raise exception 'Invalid group action'; end if;
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.group_id is null or v_session.status not in ('scheduled','ready','rescheduled') then
    raise exception 'Group session unavailable';
  end if;
  if not exists (select 1 from public.group_members where group_id = v_session.group_id
      and student_id = auth.uid() and status = 'active') then
    raise exception 'Not a current group member' using errcode = '42501';
  end if;
  select * into v_student from public.app_users where id = auth.uid();
  if not found then raise exception 'Student not found'; end if;
  v_notice := case when v_student.reschedule_custom_hours is not null
                    and v_student.reschedule_custom_pct is not null
    then v_student.reschedule_custom_hours
    else coalesce((pg_catalog.regexp_match(coalesce(v_student.reschedule_policy,''), '([0-9]+)\s*h', 'i'))[1]::integer, 24) end;
  v_pct := case when v_student.reschedule_custom_hours is not null
                 and v_student.reschedule_custom_pct is not null
    then v_student.reschedule_custom_pct
    else coalesce((pg_catalog.regexp_match(coalesce(v_student.reschedule_policy,''), '([0-9]+)\s*%'))[1]::numeric, 25) end;
  v_quota := greatest(1, pg_catalog.floor(coalesce(v_student.sessions_per_week, 2) * 4 * v_pct / 100)::integer);
  select pg_catalog.count(*) into v_used from public.student_requests
   where student_id = auth.uid() and kind = 'reschedule' and status <> 'cancelled'
     and pg_catalog.date_trunc('month', requested_at at time zone 'America/Mexico_City')
       = pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'America/Mexico_City');
  if p_status in ('cancelled','pending_reschedule') then
    if v_session.date_time < pg_catalog.now() + v_notice * interval '1 hour'
      or v_used >= v_quota or coalesce(v_session.student_reschedule_used, false) then
      raise exception 'Cancellation or reschedule window is closed';
    end if;
  elsif pg_catalog.now() > v_session.date_time + v_session.duration_minutes * interval '1 minute' then
    raise exception 'Session has ended';
  end if;
  if p_status = 'pending_reschedule' then
    if p_proposed_datetime is null or p_proposed_datetime <= pg_catalog.now() then
      raise exception 'Choose a future reschedule time';
    end if;
    if exists (select 1 from public.student_requests where origin_session_id = p_session_id
        and student_id = auth.uid() and kind = 'reschedule' and status = 'open') then
      raise exception 'A reschedule request already exists for this session';
    end if;
    insert into public.student_requests
      (kind, student_id, assigned_teacher_id, origin_session_id, proposed_datetime,
       duration_minutes, last_report_summary, status)
    values ('reschedule', auth.uid(), v_session.teacher_id, p_session_id,
      p_proposed_datetime, v_session.duration_minutes, p_last_report_summary, 'open');
  end if;
  insert into public.session_member_statuses (session_id, student_id, status)
  values (p_session_id, auth.uid(), p_status)
  on conflict (session_id, student_id) do update set status = excluded.status;
  select pg_catalog.count(*), pg_catalog.count(*) filter (where sms.status = p_status)
    into v_total, v_matching
    from public.group_members gm
    left join public.session_member_statuses sms
      on sms.session_id = p_session_id and sms.student_id = gm.student_id
   where gm.group_id = v_session.group_id and gm.status = 'active';
  if v_total > 0 and v_total = v_matching and p_status in ('cancelled','pending_reschedule') then
    v_top := p_status;
    update public.sessions set status = v_top where id = p_session_id;
    return case when v_top = 'cancelled' then 'unanimous_cancel' else 'unanimous_reschedule' end;
  end if;
  return 'none';
end;
$$;
revoke all on function public.student_group_session_action(bigint, public.ext_session_status, timestamptz, text) from public, anon;
grant execute on function public.student_group_session_action(bigint, public.ext_session_status, timestamptz, text) to authenticated;
