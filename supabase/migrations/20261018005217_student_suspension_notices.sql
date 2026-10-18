-- Notice evidence survives account deletion; no automatic termination or deletion.
create table public.student_suspensions (
  id uuid primary key default gen_random_uuid(), student_id uuid not null,
  created_at timestamptz not null default now(), ended_at timestamptz,
  first_shown_at timestamptz, deadline_at timestamptz, acknowledged_at timestamptz,
  copy jsonb not null,
  check ((first_shown_at is null) = (deadline_at is null))
);
create unique index student_suspensions_one_active on public.student_suspensions(student_id) where ended_at is null;
create index student_suspensions_student on public.student_suspensions(student_id,created_at desc);
create table public.student_suspension_events (
  id bigint generated always as identity primary key,
  suspension_id uuid not null references public.student_suspensions(id),
  kind text not null check(kind in ('suspended','shown','warning_opened','acknowledged','closed','contact_opened','returned_to_login','reactivated')),
  created_at timestamptz not null default clock_timestamp()
);
create unique index student_suspension_single_receipt on public.student_suspension_events(suspension_id,kind) where kind in ('shown','acknowledged');
create index student_suspension_events_episode on public.student_suspension_events(suspension_id,id);
alter table public.student_suspensions enable row level security;
alter table public.student_suspension_events enable row level security;
revoke all on public.student_suspensions,public.student_suspension_events from public,anon,authenticated;
grant select on public.student_suspensions,public.student_suspension_events to authenticated;
grant all on public.student_suspensions,public.student_suspension_events to service_role;
create policy suspension_read on public.student_suspensions for select to authenticated using(student_id=(select auth.uid()) or private.is_admin());
create policy suspension_event_read on public.student_suspension_events for select to authenticated using(exists(select 1 from public.student_suspensions s where s.id=suspension_id and (s.student_id=(select auth.uid()) or private.is_admin())));

create table private.suspension_notice_access (
  token_hash text primary key, suspension_id uuid not null references public.student_suspensions(id),
  expires_at timestamptz not null default now()+interval '30 minutes', warning_opened_at timestamptz
);
create table private.suspension_email_jobs (
  id uuid primary key default gen_random_uuid(), suspension_id uuid not null references public.student_suspensions(id),
  kind text not null check(kind in ('suspended','acknowledged')), recipient text not null,
  token text not null default gen_random_uuid()::text||gen_random_uuid()::text,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(),
  lease_until timestamptz, accepted_at timestamptz, provider_id text, last_error text,
  unique(suspension_id,kind)
);
revoke all on private.suspension_notice_access,private.suspension_email_jobs from public,anon,authenticated;

create function private.suspension_copy() returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('version','2026-10-17.v1',
 'title','Tu acceso a Academy está suspendido',
 'body','Tu cuenta tiene una suspensión activa. Comunícate con el equipo de Verbo para revisar tu situación y conocer los pasos para reactivar tu acceso.',
 'warningTitle','Aviso de posible baja definitiva',
 'warning','Dispones de 7 días naturales desde la primera vez que se te muestra este aviso para comunicarte con el equipo de Verbo y atender la causa de tu suspensión. Si al vencer el plazo tu situación sigue sin atenderse, tu cuenta podrá darse de baja, previa revisión de Administración y conforme a las condiciones de tu contrato. La baja podrá implicar la eliminación de tu progreso y material en Academy y la pérdida de acceso a nuestros clubes, así como de promociones, beneficios exclusivos y descuentos vinculados a la continuidad de tu servicio. Contacta al equipo de Verbo antes de la fecha límite para revisar tu caso.',
 'receipt','Al pulsar Entendido se registrará que recibiste este aviso.');
$$;
revoke all on function private.suspension_copy() from public,anon,authenticated;

create function private.student_has_suspension(p_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users u where u.id=p_student and u.role='student' and
 (u.status='suspended' or exists(select 1 from public.group_members m where m.student_id=u.id and m.status<>'active')));
$$;
revoke all on function private.student_has_suspension(uuid) from public,anon,authenticated;

create function private.sync_student_suspension(p_student uuid,p_email boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_created boolean:=false;
begin
 -- Serialize status and group changes for the same student.
 perform pg_advisory_xact_lock(hashtextextended(p_student::text,41));
 if private.student_has_suspension(p_student) then
   insert into public.student_suspensions(student_id,copy) values(p_student,private.suspension_copy())
   on conflict(student_id) where ended_at is null do nothing returning id into v_id;
   v_created:=v_id is not null;
   if v_id is null then select id into v_id from public.student_suspensions where student_id=p_student and ended_at is null; end if;
   if v_created then
     insert into public.student_suspension_events(suspension_id,kind) values(v_id,'suspended');
     if p_email then
       insert into private.suspension_email_jobs(suspension_id,kind,recipient)
       select v_id,'suspended',email from public.app_users where id=p_student;
     end if;
   end if;
 else
   update public.student_suspensions set ended_at=clock_timestamp() where student_id=p_student and ended_at is null returning id into v_id;
   if v_id is not null then
     insert into public.student_suspension_events(suspension_id,kind) values(v_id,'reactivated');
     update private.suspension_email_jobs set status='cancelled' where suspension_id=v_id and kind='suspended' and status='pending';
   end if;
 end if;
 return v_id;
end;
$$;
revoke all on function private.sync_student_suspension(uuid,boolean) from public,anon,authenticated;
create function private.track_student_suspension() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='app_users' then
   perform private.sync_student_suspension(new.id);
 else
   if tg_op='DELETE' then perform private.sync_student_suspension(old.student_id); return old; end if;
   perform private.sync_student_suspension(new.student_id);
 end if;
 return new;
end;
$$;
revoke all on function private.track_student_suspension() from public,anon,authenticated;
create trigger track_student_suspension after insert or update of status on public.app_users for each row execute function private.track_student_suspension();
create trigger track_group_suspension after insert or update of status or delete on public.group_members for each row execute function private.track_student_suspension();

create function private.close_deleted_student_suspension() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.student_suspensions set ended_at=coalesce(ended_at,clock_timestamp()) where student_id=old.id;
 update private.suspension_email_jobs set status='cancelled' where suspension_id in(select id from public.student_suspensions where student_id=old.id) and status='pending';
 return old;
end;
$$;
revoke all on function private.close_deleted_student_suspension() from public,anon,authenticated;
create trigger close_deleted_student_suspension before delete on public.app_users for each row execute function private.close_deleted_student_suspension();

-- Existing suspensions acquire evidence on first login, without retrospective emails.
create function public.issue_suspension_notice_access(p_student uuid,p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_token_hash !~ '^[a-f0-9]{64}$' or not private.student_has_suspension(p_student) then raise exception 'No active suspension'; end if;
 v_id:=private.sync_student_suspension(p_student,false);
 delete from private.suspension_notice_access where expires_at<now();
 insert into private.suspension_notice_access(token_hash,suspension_id) values(p_token_hash,v_id);
 return jsonb_build_object('notice',(select to_jsonb(s) from public.student_suspensions s where id=v_id));
end;
$$;
revoke all on function public.issue_suspension_notice_access(uuid,text) from public,anon,authenticated;
grant execute on function public.issue_suspension_notice_access(uuid,text) to service_role;

create function private.suspension_history(p_student uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.student_suspension_events e where e.suspension_id=s.id),'[]'::jsonb),
 'emails',coalesce((select jsonb_agg(jsonb_build_object('kind',j.kind,'status',j.status,'accepted_at',j.accepted_at,'last_error',j.last_error)) from private.suspension_email_jobs j where j.suspension_id=s.id),'[]'::jsonb)) order by s.created_at desc),'[]'::jsonb)
 from public.student_suspensions s where s.student_id=p_student;
$$;
revoke all on function private.suspension_history(uuid) from public,anon,authenticated;
create function public.student_suspension_history(p_student uuid default auth.uid()) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or (auth.uid()<>p_student and not private.is_admin()) then raise exception 'Forbidden' using errcode='42501'; end if;
 return private.suspension_history(p_student);
end;
$$;
revoke all on function public.student_suspension_history(uuid) from public,anon;
grant execute on function public.student_suspension_history(uuid) to authenticated;

create function public.suspension_notice_action(p_token_hash text,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_access private.suspension_notice_access; v_notice public.student_suspensions;
begin
 select * into v_access from private.suspension_notice_access where token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'Notice access expired'; end if;
 select * into v_notice from public.student_suspensions where id=v_access.suspension_id for update;
 if p_action='history' then return private.suspension_history(v_notice.student_id); end if;
 if v_notice.ended_at is not null or not private.student_has_suspension(v_notice.student_id) then raise exception 'Suspension no longer active'; end if;
 if p_action='shown' then
   if v_notice.first_shown_at is null then
     update public.student_suspensions set first_shown_at=clock_timestamp(),deadline_at=clock_timestamp()+interval '7 days' where id=v_notice.id returning * into v_notice;
     insert into public.student_suspension_events(suspension_id,kind) values(v_notice.id,'shown');
   end if;
 elsif p_action='warning_opened' then
   if v_notice.first_shown_at is null then raise exception 'Show notice first'; end if;
   -- Each opening has its own server-enforced five-second delay.
   update private.suspension_notice_access set warning_opened_at=clock_timestamp() where token_hash=p_token_hash;
   insert into public.student_suspension_events(suspension_id,kind) values(v_notice.id,p_action);
 elsif p_action in ('acknowledged','closed') then
   if v_access.warning_opened_at is null or clock_timestamp()<v_access.warning_opened_at+interval '5 seconds' then raise exception 'Wait five seconds'; end if;
   if p_action='acknowledged' then
     if v_notice.acknowledged_at is null then
       update public.student_suspensions set acknowledged_at=clock_timestamp() where id=v_notice.id returning * into v_notice;
       insert into public.student_suspension_events(suspension_id,kind) values(v_notice.id,'acknowledged');
       insert into private.suspension_email_jobs(suspension_id,kind,recipient)
       select v_notice.id,'acknowledged',email from public.app_users where id=v_notice.student_id on conflict do nothing;
     end if;
   else
     insert into public.student_suspension_events(suspension_id,kind) values(v_notice.id,'closed');
   end if;
 elsif p_action in ('contact_opened','returned_to_login') then
   insert into public.student_suspension_events(suspension_id,kind) values(v_notice.id,p_action);
 else raise exception 'Invalid notice action';
 end if;
 return jsonb_build_object('notice',to_jsonb(v_notice));
end;
$$;
revoke all on function public.suspension_notice_action(text,text) from public,anon,authenticated;
grant execute on function public.suspension_notice_action(text,text) to service_role;

create function public.claim_suspension_email(p_id uuid,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job private.suspension_email_jobs;
begin
 update private.suspension_email_jobs set status='sending',lease_until=now()+interval '2 minutes',attempts=attempts+1
 where id=p_id and token=p_token and attempts<12 and next_attempt_at<=now() and (status='pending' or (status='sending' and lease_until<now())) returning * into v_job;
 if not found then return null; end if;
 return to_jsonb(v_job)||jsonb_build_object('notice',(select to_jsonb(s) from public.student_suspensions s where id=v_job.suspension_id));
end;
$$;
revoke all on function public.claim_suspension_email(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_suspension_email(uuid,text) to service_role;
create function public.finish_suspension_email(p_id uuid,p_token text,p_ok boolean,p_provider text,p_error text) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.suspension_email_jobs set status=case when p_ok then 'sent' when attempts>=12 then 'failed' else 'pending' end,
 accepted_at=case when p_ok then now() else accepted_at end,provider_id=p_provider,last_error=left(p_error,160),lease_until=null,
 next_attempt_at=now()+case when p_error='quota_exceeded' then interval '1 day' else interval '15 minutes' end
 where id=p_id and token=p_token and status='sending';
end;
$$;
revoke all on function public.finish_suspension_email(uuid,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.finish_suspension_email(uuid,text,boolean,text,text) to service_role;
create function private.dispatch_suspension_emails() returns void language plpgsql security definer set search_path='' as $$
declare j record;
begin
 update private.suspension_email_jobs set status='failed',last_error=coalesce(last_error,'retry_limit') where status='sending' and lease_until<now() and attempts>=12;
 for j in select id,token from private.suspension_email_jobs where next_attempt_at<=now() and attempts<12 and (status='pending' or (status='sending' and lease_until<now())) order by next_attempt_at limit 10 loop
   perform net.http_post(url:='https://tudkeownvrohnijulsvk.supabase.co/functions/v1/suspension-notices',
     headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('action','deliver','id',j.id,'token',j.token),timeout_milliseconds:=10000);
 end loop;
end;
$$;
revoke all on function private.dispatch_suspension_emails() from public,anon,authenticated;
select cron.schedule('academy-suspension-notices','* * * * *','select private.dispatch_suspension_emails()');
