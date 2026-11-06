-- Additive operational ledger. No session status, balance, payroll or schedule mutations.
create table public.session_control_settings (
 singleton boolean primary key default true check(singleton),
 starts_on date not null default (now() at time zone 'America/Mexico_City')::date
);
insert into public.session_control_settings(singleton) values(true);
alter table public.session_control_settings enable row level security;
revoke all on public.session_control_settings from public,anon,authenticated;
grant select on public.session_control_settings to authenticated;
create policy session_control_settings_read on public.session_control_settings for select to authenticated
 using((select private.is_coordinator_ops()) or exists(select 1 from public.app_users u where u.id=(select auth.uid()) and u.role='teacher'));

create table public.session_confirmations (
 occurrence_key text primary key,
 teacher_id uuid not null references public.app_users(id),
 source text not null check(source in ('academy','external','missing')),
 label text not null check(length(label) between 1 and 200),
 scheduled_at timestamptz not null,
 duration_minutes integer not null check(duration_minutes between 1 and 480),
 outcome text not null check(outcome in ('held','not_held','difference')),
 reason text not null default '' check(length(reason)<=2000),
 confirmed_at timestamptz not null default clock_timestamp(),
 confirmation_late boolean not null,
 external_report text not null default '' check(length(external_report)<=6000),
 external_report_at timestamptz,
 resolved_at timestamptz,
 resolved_by uuid references public.app_users(id),
 resolution_note text not null default '' check(length(resolution_note)<=2000),
 resolution_context text,
 revision integer not null default 1,
 updated_at timestamptz not null default clock_timestamp()
);
create index session_confirmations_teacher_date on public.session_confirmations(teacher_id,scheduled_at);
alter table public.session_confirmations enable row level security;
revoke all on public.session_confirmations from public,anon,authenticated;
grant select on public.session_confirmations to authenticated;
create policy session_confirmation_read on public.session_confirmations for select to authenticated
 using(teacher_id=(select auth.uid()) or (select private.is_coordinator_ops()));

create table public.session_confirmation_history (
 id bigint generated always as identity primary key,
 occurrence_key text not null,
 actor_id uuid not null,
 recorded_at timestamptz not null default clock_timestamp(),
 before_record jsonb,
 after_record jsonb not null
);
create index session_confirmation_history_key on public.session_confirmation_history(occurrence_key,id);
alter table public.session_confirmation_history enable row level security;
revoke all on public.session_confirmation_history from public,anon,authenticated;
grant select on public.session_confirmation_history to authenticated;
create policy session_confirmation_history_read on public.session_confirmation_history for select to authenticated
 using(exists(select 1 from public.session_confirmations c where c.occurrence_key=session_confirmation_history.occurrence_key));

create function private.audit_session_confirmation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.session_confirmation_history(occurrence_key,actor_id,before_record,after_record)
 values(new.occurrence_key,auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
revoke all on function private.audit_session_confirmation() from public,anon,authenticated;
create trigger session_confirmation_audit after insert or update on public.session_confirmations
 for each row execute function private.audit_session_confirmation();

-- Source projection is internal only. Stable external identity uses the original date,
-- while effective date/time follows the existing exception model.
create function private.session_control_candidates() returns table(
 occurrence_key text, teacher_id uuid, source text, label text, scheduled_at timestamptz,
 duration_minutes integer, session_id bigint, session_status text, report_at timestamptz
) language sql stable security definer set search_path='' as $$
 select 's:'||s.id,s.teacher_id,'academy',coalesce(u.name,g.name,'Academy session'),
 s.date_time,s.duration_minutes,s.id,s.status::text,s.report_submitted_at
 from public.sessions s
 left join public.app_users u on u.id=s.student_id
 left join public.groups g on g.id=s.group_id
 where not coalesce(s.is_sales_demo,false) and s.schedule_hold is null
 and s.status::text<>'converted_to_spotlight' and s.teacher_id is not null
 and (s.date_time at time zone 'America/Mexico_City')::date >=(select starts_on from public.session_control_settings)
 and s.date_time < (date_trunc('day',now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City') + interval '2 days'
 union all
 select 'e:'||b.id||':'||d.day::date,b.teacher_id,'external',b.label,
 ((coalesce(o.replacement_date,d.day::date)::timestamp + make_interval(mins=>coalesce(o.start_min,b.start_min))) at time zone 'America/Mexico_City'),
 coalesce(o.end_min,b.end_min)-coalesce(o.start_min,b.start_min),null,'scheduled',null
 from public.teacher_external_blocks b
 cross join lateral generate_series(greatest(b.start_date,(select starts_on from public.session_control_settings))::timestamp,
 least(b.end_date,(now() at time zone 'America/Mexico_City')::date+1)::timestamp,interval '1 day') d(day)
 left join public.teacher_external_overrides o on o.block_id=b.id and o.on_date=d.day::date
 where extract(dow from d.day)=b.weekday and not coalesce(o.cancelled,false)
$$;
revoke all on function private.session_control_candidates() from public,anon,authenticated;

create function private.session_control_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ops boolean:=coalesce(private.is_coordinator_ops(),false); result jsonb;
begin
 if actor is null or not exists(select 1 from public.app_users where id=actor and (role='teacher' or ops)) then
  raise exception 'Session control is restricted to teachers and operations.' using errcode='42501';
 end if;
 with candidates as (select * from private.session_control_candidates()),
 rows as (
 select coalesce(p.occurrence_key,c.occurrence_key) occurrence_key,coalesce(p.teacher_id,c.teacher_id) teacher_id,
 coalesce(p.source,c.source) source,coalesce(p.label,c.label) label,
 coalesce(p.scheduled_at,c.scheduled_at) scheduled_at,coalesce(p.duration_minutes,c.duration_minutes) duration_minutes,
 p.session_id,p.session_status,p.report_at, to_jsonb(c) confirmation,
 (c.resolved_at is not null and c.resolution_context=md5(coalesce(to_jsonb(p)::text,'missing'))) resolution_current,
 (c.occurrence_key is not null and c.source<>'missing' and (p.occurrence_key is null or
  p.scheduled_at is distinct from c.scheduled_at or p.teacher_id is distinct from c.teacher_id or p.duration_minutes is distinct from c.duration_minutes)) stale
 from candidates p full join public.session_confirmations c using(occurrence_key)
 where ops or coalesce(p.teacher_id,c.teacher_id)=actor
 )
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('teacher_name',u.name) order by r.scheduled_at),'[]'::jsonb) into result
 from rows r join public.app_users u on u.id=r.teacher_id;
 return jsonb_build_object('starts_on',(select starts_on from public.session_control_settings),'server_now',now(),'rows',result);
end $$;
revoke all on function private.session_control_list() from public,anon;
grant execute on function private.session_control_list() to authenticated;
create function public.session_control_list() returns jsonb language sql security invoker set search_path=''
 as $$select private.session_control_list()$$;
revoke all on function public.session_control_list() from public,anon;
grant execute on function public.session_control_list() to authenticated;

create function private.session_control_save(p_key text,p_action text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ops boolean:=coalesce(private.is_coordinator_ops(),false);
 candidate record; current_record public.session_confirmations; note text:=btrim(coalesce(p_payload->>'reason',''));
 chosen text:=p_payload->>'outcome'; missing_key text; current_revision integer;
begin
 if actor is null or not exists(select 1 from public.app_users where id=actor and (role='teacher' or ops)) then
  raise exception 'Session control is restricted to teachers and operations.' using errcode='42501';
 end if;
 if p_action='missing' then
  if length(note)<3 or length(btrim(coalesce(p_payload->>'label','')))<2 then raise exception 'Enter a label and explain the missing session.'; end if;
  if (p_payload->>'scheduled_at')::timestamptz + make_interval(mins=>(p_payload->>'duration_minutes')::int)>now() then raise exception 'Only finished sessions can be declared.'; end if;
  if ((p_payload->>'scheduled_at')::timestamptz at time zone 'America/Mexico_City')::date<(select starts_on from public.session_control_settings) then raise exception 'This date predates session control activation.'; end if;
  -- Client-generated request key makes retries idempotent.
  missing_key:='m:'||(p_payload->>'request_id')::uuid;
  insert into public.session_confirmations(occurrence_key,teacher_id,source,label,scheduled_at,duration_minutes,outcome,reason,confirmation_late)
  values(missing_key,actor,'missing',btrim(p_payload->>'label'),(p_payload->>'scheduled_at')::timestamptz,
   (p_payload->>'duration_minutes')::int,'difference',note,
   (now() at time zone 'America/Mexico_City')::date>((p_payload->>'scheduled_at')::timestamptz at time zone 'America/Mexico_City')::date)
  on conflict(occurrence_key) do nothing;
  return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('session-control:'||p_key,0));
 select * into current_record from public.session_confirmations where occurrence_key=p_key for update;
 current_revision:=coalesce(current_record.revision,0);
 if current_revision<>coalesce((p_payload->>'revision')::int,0) then raise exception 'This record changed. Refresh before saving.'; end if;
 if p_action='confirm' then
  select * into candidate from private.session_control_candidates() where occurrence_key=p_key;
  if not found then raise exception 'This session is no longer in the active schedule. Ask operations to review it.'; end if;
  if candidate.teacher_id<>actor then raise exception 'Only the assigned teacher can confirm this session.' using errcode='42501'; end if;
  if candidate.scheduled_at is distinct from (p_payload->>'scheduled_at')::timestamptz or candidate.duration_minutes is distinct from (p_payload->>'duration_minutes')::int then raise exception 'The schedule changed. Refresh before confirming.'; end if;
  if candidate.scheduled_at+make_interval(mins=>candidate.duration_minutes)>now() then raise exception 'Confirm after the session has finished.'; end if;
  if chosen is null or chosen not in ('held','not_held','difference') then raise exception 'Choose one outcome.'; end if;
  if (chosen<>'held' or current_revision>0) and length(note)<3 then raise exception 'A reason is required for differences and corrections.'; end if;
  insert into public.session_confirmations(occurrence_key,teacher_id,source,label,scheduled_at,duration_minutes,outcome,reason,confirmation_late)
  values(p_key,actor,candidate.source,candidate.label,candidate.scheduled_at,candidate.duration_minutes,chosen,note,
    (now() at time zone 'America/Mexico_City')::date>((candidate.scheduled_at+make_interval(mins=>candidate.duration_minutes)) at time zone 'America/Mexico_City')::date)
  on conflict(occurrence_key) do update set teacher_id=excluded.teacher_id,label=excluded.label,
    scheduled_at=excluded.scheduled_at,duration_minutes=excluded.duration_minutes,outcome=excluded.outcome,reason=excluded.reason,
    confirmed_at=case when current_record.scheduled_at=excluded.scheduled_at and current_record.teacher_id=excluded.teacher_id and current_record.duration_minutes=excluded.duration_minutes then current_record.confirmed_at else clock_timestamp() end,
    confirmation_late=case when current_record.scheduled_at=excluded.scheduled_at and current_record.teacher_id=excluded.teacher_id and current_record.duration_minutes=excluded.duration_minutes then current_record.confirmation_late else excluded.confirmation_late end,
    external_report='',external_report_at=null,resolved_at=null,resolved_by=null,resolution_note='',resolution_context=null,
    revision=current_revision+1,updated_at=clock_timestamp();
 elsif p_action='report' then
  if current_record.teacher_id is distinct from actor or current_record.source='academy' or current_record.outcome<>'held' then raise exception 'Confirm an external session as held before writing its report.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_payload->>'report','')))<10 then raise exception 'Write at least 10 characters in the report.'; end if;
  if not exists(select 1 from private.session_control_candidates() x where x.occurrence_key=p_key and
    x.teacher_id=actor and x.scheduled_at=current_record.scheduled_at and x.duration_minutes=current_record.duration_minutes) then raise exception 'The schedule changed. Confirm again before reporting.'; end if;
  update public.session_confirmations set external_report=btrim(p_payload->>'report'),external_report_at=coalesce(external_report_at,clock_timestamp()),
    revision=revision+1,updated_at=clock_timestamp() where occurrence_key=p_key;
 elsif p_action='resolve' then
  if not ops or current_record.occurrence_key is null then raise exception 'Only operations can resolve discrepancies.' using errcode='42501'; end if;
  if length(note)<3 then raise exception 'Explain the resolution.'; end if;
  update public.session_confirmations set resolved_at=clock_timestamp(),resolved_by=actor,resolution_note=note,
    resolution_context=md5(coalesce((select to_jsonb(x)::text from private.session_control_candidates() x where x.occurrence_key=p_key),'missing')),
    revision=revision+1,updated_at=clock_timestamp() where occurrence_key=p_key;
 else raise exception 'Unknown session control action.';
 end if;
end $$;
revoke all on function private.session_control_save(text,text,jsonb) from public,anon;
grant execute on function private.session_control_save(text,text,jsonb) to authenticated;
create function public.session_control_save(p_key text,p_action text,p_payload jsonb) returns void
language sql security invoker set search_path='' as $$select private.session_control_save(p_key,p_action,p_payload)$$;
revoke all on function public.session_control_save(text,text,jsonb) from public,anon;
grant execute on function public.session_control_save(text,text,jsonb) to authenticated;
