import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleSessionNotification } from "../notify-session-event/handler.ts";

Deno.serve(async req => {
  if (req.method!=="POST") return new Response("Method not allowed",{status:405});
  let body: {id?:string;token?:string};
  try { body=await req.json(); } catch { return new Response("Invalid body",{status:400}); }
  if (!/^[0-9a-f-]{36}$/i.test(body.id ?? "") || !/^[0-9a-f-]{72}$/i.test(body.token ?? "")) return new Response("Unauthorized",{status:401});
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const {data:job,error}=await admin.rpc("claim_session_email_job",{p_id:body.id,p_token:body.token});
  if (error || !job) return new Response("Unauthorized or already processed",{status:401});
  let ok=false; let errorCode="worker_error";
  try {
    const response=await handleSessionNotification(req,job);
    const result=await response.json();
    ok=response.ok && result.ok===true;
    errorCode=ok ? "" : JSON.stringify(Object.fromEntries(Object.entries(result.results ?? {}).map(([key,value]:[string,any])=>[key,{ok:value.ok,code:value.code,status:value.status}])));
  } catch { errorCode="delivery_exception"; }
  const {error:finishError}=await admin.rpc("finish_session_email_job",{p_id:body.id,p_ok:ok,p_error:errorCode || null});
  if (finishError) return new Response("Job result not saved",{status:503});
  return Response.json({ok});
});
