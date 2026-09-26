// Durable, RLS-scoped changes, including permanent moves that keep "Scheduled".
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "./auth-rehydrate";
import { hydrateUserIdBridge, uuidToLegacySync } from "./user-id-bridge";
export const SCHEDULE_EVENTS="verbo:session-schedule-events";
export interface ScheduleEvent {id:string;session_id:number;student_id:string|null;teacher_id:string;previous_teacher_id:string|null;kind:string;date_time:string;previous_date_time:string;created_at:string;}
let events:ScheduleEvent[]=[];
let generation=0;
let pending:Promise<void>|null=null;
let queued=false;
function notify(){if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(SCHEDULE_EVENTS));}
async function refresh(){
  if(pending){queued=true;return;}
  const version=generation;
  pending=(async()=>{
    await hydrateUserIdBridge();
    const {data,error}=await supabase.from("session_schedule_events" as never).select("*").order("created_at",{ascending:false}).limit(100);
    if(version!==generation)return;
    if(error)throw error;
    events=((data ?? []) as unknown as ScheduleEvent[]).map(e=>({...e,student_id:e.student_id ? uuidToLegacySync(e.student_id) : null,teacher_id:uuidToLegacySync(e.teacher_id),previous_teacher_id:e.previous_teacher_id ? uuidToLegacySync(e.previous_teacher_id) : null}));
    notify();
  })().catch(()=>console.error("[schedule-events] refresh unavailable")).finally(()=>{pending=null;if(queued){queued=false;void refresh();}});
  return pending;
}
export function loadScheduleEvents(){return events;}
if(typeof window!=="undefined"){
  registerRehydrate(reason=>{generation++;if(reason==="auth"){events=[];notify();}void refresh();},{critical:true});
  void refresh();
  supabase.channel("session-schedule-events").on("postgres_changes",{event:"INSERT",schema:"public",table:"session_schedule_events"},()=>{void refresh();}).subscribe(status=>{if(status==="SUBSCRIBED")void refresh();});
}
