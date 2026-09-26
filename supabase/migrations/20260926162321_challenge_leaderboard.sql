-- A limited, authenticated leaderboard projection. Does not expose email,
-- commercial fields, submissions, evidence URLs or teacher feedback.
create or replace function public.challenge_leaderboard()
returns table (
  student_id uuid, legacy_id text, display_name text, avatar_seed text,
  use_real_avatar boolean, completed_count bigint,
  current_streak bigint, longest_streak bigint, last_delivery_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_users caller where caller.id = auth.uid()
      and caller.role in ('student', 'teacher', 'admin')
  ) then
    raise insufficient_privilege using message = 'An Academy account is required';
  end if;
  return query
  with deliveries as (
    -- A resubmission replaces the evidence, not the first participation date.
    select cs.id, cs.student_id, cs.status, cs.challenge_format,
      coalesce(min(h.submitted_at), cs.submitted_at) as delivered_at
    from public.challenge_submissions cs
    left join public.challenge_submission_history h on h.submission_id = cs.id
    group by cs.id, cs.student_id, cs.status, cs.challenge_format, cs.submitted_at
  ), approved as (
    select d.student_id, count(*) as completed
    from deliveries d where d.status = 'approved' group by d.student_id
  ), ordered_deliveries as (
    -- Preserve the existing normal/Mystery streak and fourteen-day interval.
    -- Lightning and Season retain independent completion/cooldown rules.
    select d.student_id, d.id, d.delivered_at,
      lag(d.delivered_at) over (partition by d.student_id order by d.delivered_at, d.id) as previous_at
    from deliveries d
    where d.status in ('pending_review', 'needs_resubmission', 'approved')
      and d.challenge_format in ('normal', 'mystery_box')
  ), grouped_deliveries as (
    select d.student_id, d.id, d.delivered_at,
      sum(case when d.previous_at is null or d.delivered_at - d.previous_at > interval '14 days'
        then 1 else 0 end) over (partition by d.student_id order by d.delivered_at, d.id) as streak_group
    from ordered_deliveries d
  ), streaks as (
    select d.student_id, d.streak_group, count(*) as length, max(d.delivered_at) as last_at
    from grouped_deliveries d group by d.student_id, d.streak_group
  ), student_stats as (
    select s.student_id, max(s.length) as longest, max(s.last_at) as last_at,
      (array_agg(s.length order by s.last_at desc))[1] as latest_length
    from streaks s group by s.student_id
  )
  select u.id, u.legacy_id,
    case when i.mode = 'nickname' and length(btrim(coalesce(i.nickname, ''))) > 0
      then btrim(i.nickname) else u.name end,
    case when i.mode = 'nickname' and length(btrim(coalesce(i.nickname, ''))) > 0
      then btrim(i.nickname) else u.name end,
    not (coalesce(i.mode, 'real') = 'nickname' and length(btrim(coalesce(i.nickname, ''))) > 0),
    coalesce(a.completed, 0),
    case when u.id = auth.uid() then
      case when s.last_at >= now() - interval '14 days' then coalesce(s.latest_length, 0) else 0 end
      else null end,
    case when u.id = auth.uid() then coalesce(s.longest, 0) else null end,
    case when u.id = auth.uid() then s.last_at else null end
  from public.app_users u
  left join public.leaderboard_identities i on i.student_id = u.id
  left join approved a on a.student_id = u.id
  left join student_stats s on s.student_id = u.id
  where u.role = 'student'
  order by coalesce(a.completed, 0) desc, u.name, u.id;
end;
$$;
revoke all on function public.challenge_leaderboard() from public, anon;
grant execute on function public.challenge_leaderboard() to authenticated;

-- Only the teacher/admin review path may produce approved submissions.
-- Students' real upload/resubmission paths already write these pending fields.
alter policy challenge_submissions_student_insert on public.challenge_submissions
with check (
  private.is_student() and student_id = (select auth.uid())
  and status = 'pending_review' and reviewed_at is null
  and reviewed_by is null and teacher_feedback is null
);
alter policy challenge_submissions_update on public.challenge_submissions
with check (
  private.is_admin() or private.teaches_student(student_id)
  or (private.is_student() and student_id = (select auth.uid())
    and status = 'pending_review' and reviewed_at is null
    and reviewed_by is null and teacher_feedback is null)
);
