CREATE OR REPLACE FUNCTION private.reschedule_slot_free(s sessions, t uuid, dt timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.app_users a where a.id=t and a.role='teacher' and a.teacher_status='active'
   and ((select u.product from public.app_users u where u.id=s.student_id) is null
     or (select u.product from public.app_users u where u.id=s.student_id)=any(a.qualified_products)))
 and ((s.is_sales_demo and t=(select u.sales_demo_teacher_id from public.app_users u where u.id=s.student_id and u.is_sales_demo)
   and extract(dow from dt at time zone 'America/Mexico_City') between 1 and 6
   and (dt at time zone 'America/Mexico_City')::time>=time '09:00'
   and (dt at time zone 'America/Mexico_City')::time+make_interval(mins=>s.duration_minutes)<=time '21:00')
 or (not s.is_sales_demo and exists(select 1 from public.teacher_availability a where a.teacher_id=t and a.confirmed_at is not null)
 and exists(select 1 from public.teacher_availability_blocks b where b.teacher_id=t
   and b.day::text=(array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from dt at time zone 'America/Mexico_City')::integer+1]
   and b.start_min<=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')
   and b.end_min>=extract(hour from dt at time zone 'America/Mexico_City')*60+extract(minute from dt at time zone 'America/Mexico_City')+s.duration_minutes)
 ))
 and not private.teacher_external_blocked(t, dt, s.duration_minutes)
 and not exists(select 1 from public.sessions x where x.id<>s.id and x.schedule_hold is null
   and (x.teacher_id=t or x.student_id=s.student_id)
   and x.status in ('scheduled','ready','rescheduled','rearranged','delayed','pending_reschedule')
   and x.date_time<dt+make_interval(mins=>s.duration_minutes)
   and x.date_time+make_interval(mins=>x.duration_minutes)>dt)
$function$
;
