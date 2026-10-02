-- Reassign already prepared 1:1 lesson plans without changing bookings, credits,
-- attendance, or the original planning timestamp. The preview and write use
-- the same server-side snapshot so a stale confirmation cannot overwrite work.
create table private.lesson_plan_resequence_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
alter table private.lesson_plan_resequence_events enable row level security;
revoke all on private.lesson_plan_resequence_events from public, anon, authenticated;

create function private.lesson_plan_resequence_snapshot(p_student_id uuid, p_first timestamptz, p_last timestamptz)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', s.id, 'date_time', s.date_time, 'status', s.status,
    'teacher_id', s.teacher_id, 'group_id', s.group_id,
    'workshop_cohort_id', s.workshop_cohort_id, 'origin', s.origin,
    'report_submitted_at', s.report_submitted_at,
    'report_locked', s.report_locked,
    'student_connected_at', s.student_connected_at,
    'teacher_connected_at', s.teacher_connected_at,
    'plan', to_jsonb(lp)
  ) order by s.date_time, s.id), '[]'::jsonb)
  from public.sessions s
  join public.lesson_plans lp on lp.session_id = s.id
  where s.student_id = p_student_id and s.date_time between p_first and p_last;
$$;

create function public.resequence_lesson_plans(
  p_source_session_id bigint,
  p_target_session_id bigint,
  p_expected_snapshot text default null,
  p_apply boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  source_session public.sessions;
  target_session public.sessions;
  state jsonb;
  after_state jsonb;
  revision text;
  first_time timestamptz;
  last_time timestamptz;
  item jsonb;
  plan jsonb;
  ids bigint[] := '{}';
  plans jsonb[] := '{}';
  source_pos integer;
  target_pos integer;
  from_pos integer;
  n integer;
  i integer;
  moves jsonb := '[]'::jsonb;
  event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into source_session from public.sessions where id = p_source_session_id;
  if not found or source_session.teacher_id is distinct from auth.uid()
     or source_session.student_id is null then
    raise exception 'This teacher cannot reorder this session';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lesson-plans:' || source_session.student_id::text, 0));
  select * into source_session from public.sessions where id = p_source_session_id for update;
  select * into target_session from public.sessions where id = p_target_session_id for update;
  if target_session.id is null or source_session.student_id is null
     or source_session.teacher_id is distinct from auth.uid()
     or target_session.student_id is distinct from source_session.student_id
     or target_session.teacher_id is distinct from source_session.teacher_id then
    raise exception 'Choose sessions for the same student and teacher';
  end if;
  first_time := least(source_session.date_time, target_session.date_time);
  last_time := greatest(source_session.date_time, target_session.date_time);
  if p_source_session_id = p_target_session_id
     or source_session.date_time = target_session.date_time or first_time <= now()
     or last_time > now() + interval '30 days' then
    raise exception 'Choose distinct future sessions within 30 days';
  end if;

  -- Lock the complete planned interval. Other student plans and all blank
  -- calendar slots are left untouched. A planned, incompatible slot blocks
  -- the operation rather than silently skipping a unit in the sequence.
  perform 1 from public.sessions s join public.lesson_plans lp on lp.session_id = s.id
    where s.student_id = source_session.student_id
      and s.date_time between first_time and last_time
    order by s.id for update of s, lp;
  state := private.lesson_plan_resequence_snapshot(source_session.student_id, first_time, last_time);
  n := jsonb_array_length(state);
  if n < 2 or n > 20 then raise exception 'Choose between 2 and 20 planned sessions'; end if;
  for i in 1..n loop
    item := state -> (i - 1);
    ids := array_append(ids, (item ->> 'session_id')::bigint);
    plans := array_append(plans, item -> 'plan');
    if (item ->> 'session_id')::bigint = p_source_session_id then source_pos := i; end if;
    if (item ->> 'session_id')::bigint = p_target_session_id then target_pos := i; end if;
    if (item ->> 'teacher_id')::uuid is distinct from auth.uid()
       or item ->> 'group_id' is not null
       or item ->> 'workshop_cohort_id' is not null
       or coalesce(item ->> 'origin', 'course') not in ('course')
       or item ->> 'status' not in ('scheduled', 'ready', 'rescheduled', 'rearranged', 'delayed')
       or item ->> 'report_submitted_at' is not null
       or coalesce((item ->> 'report_locked')::boolean, false)
       or item ->> 'student_connected_at' is not null
       or item ->> 'teacher_connected_at' is not null then
      raise exception 'A session in this sequence can no longer be reordered';
    end if;
  end loop;
  if source_pos is null or target_pos is null then
    raise exception 'Both sessions must already have lesson plans';
  end if;
  revision := md5(state::text);
  for i in 1..n loop
    if source_pos > target_pos then
      from_pos := case when i = target_pos then source_pos else i - 1 end;
    else
      from_pos := case when i = target_pos then source_pos else i + 1 end;
    end if;
    plan := plans[from_pos];
    moves := moves || jsonb_build_array(jsonb_build_object(
      'session_id', ids[i], 'date_time', state -> (i - 1) ->> 'date_time',
      'from_session_id', ids[from_pos],
      'before_title', plans[i] ->> 'title', 'before_unit_id', plans[i] ->> 'unit_id',
      'after_title', plan ->> 'title', 'after_unit_id', plan ->> 'unit_id'
    ));
  end loop;
  if not p_apply then
    return jsonb_build_object('snapshot', revision, 'moves', moves);
  end if;
  if p_expected_snapshot is null or p_expected_snapshot <> revision then
    raise exception 'The plans or dates changed. Review the preview again';
  end if;
  for i in 1..n loop
    if source_pos > target_pos then
      from_pos := case when i = target_pos then source_pos else i - 1 end;
    else
      from_pos := case when i = target_pos then source_pos else i + 1 end;
    end if;
    plan := plans[from_pos];
    update public.lesson_plans set
      title = plan ->> 'title', type = (plan ->> 'type')::public.lesson_session_type,
      level_id = plan ->> 'level_id', unit_id = plan ->> 'unit_id',
      custom_unit_id = (plan ->> 'custom_unit_id')::bigint,
      focus_subskills = array(select jsonb_array_elements_text(plan -> 'focus_subskills')),
      comments = plan ->> 'comments', planning_status = plan ->> 'planning_status',
      saved_at = (plan ->> 'saved_at')::timestamptz
    where session_id = ids[i];
  end loop;
  after_state := private.lesson_plan_resequence_snapshot(source_session.student_id, first_time, last_time);
  insert into private.lesson_plan_resequence_events(actor_id, student_id, teacher_id, before_state, after_state)
    values(auth.uid(), source_session.student_id, source_session.teacher_id, state, after_state)
    returning id into event_id;
  return jsonb_build_object('snapshot', md5(after_state::text), 'moves', moves, 'event_id', event_id);
end $$;

create function public.undo_lesson_plan_resequence(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  event private.lesson_plan_resequence_events;
  first_time timestamptz;
  last_time timestamptz;
  item jsonb;
  plan jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into event from private.lesson_plan_resequence_events where id = p_event_id;
  if not found or event.actor_id is distinct from auth.uid() or event.undone_at is not null then
    raise exception 'This reordering cannot be undone';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lesson-plans:' || event.student_id::text, 0));
  select * into event from private.lesson_plan_resequence_events where id = p_event_id for update;
  select min((x ->> 'date_time')::timestamptz), max((x ->> 'date_time')::timestamptz)
    into first_time, last_time from jsonb_array_elements(event.after_state) x;
  perform 1 from public.sessions s join public.lesson_plans lp on lp.session_id = s.id
    where s.student_id = event.student_id and s.date_time between first_time and last_time
    order by s.id for update of s, lp;
  if event.undone_at is not null or first_time <= now()
     or private.lesson_plan_resequence_snapshot(event.student_id, first_time, last_time) <> event.after_state then
    raise exception 'A session or plan changed. Review the current sequence before undoing';
  end if;
  for item in select value from jsonb_array_elements(event.before_state) loop
    plan := item -> 'plan';
    update public.lesson_plans set
      title = plan ->> 'title', type = (plan ->> 'type')::public.lesson_session_type,
      level_id = plan ->> 'level_id', unit_id = plan ->> 'unit_id',
      custom_unit_id = (plan ->> 'custom_unit_id')::bigint,
      focus_subskills = array(select jsonb_array_elements_text(plan -> 'focus_subskills')),
      comments = plan ->> 'comments', planning_status = plan ->> 'planning_status',
      saved_at = (plan ->> 'saved_at')::timestamptz
    where session_id = (item ->> 'session_id')::bigint;
  end loop;
  update private.lesson_plan_resequence_events set undone_at = now() where id = p_event_id;
  return jsonb_build_object('undone', true);
end $$;

revoke all on function private.lesson_plan_resequence_snapshot(uuid,timestamptz,timestamptz),
  public.resequence_lesson_plans(bigint,bigint,text,boolean),
  public.undo_lesson_plan_resequence(uuid) from public, anon, authenticated;
grant execute on function public.resequence_lesson_plans(bigint,bigint,text,boolean),
  public.undo_lesson_plan_resequence(uuid) to authenticated;
