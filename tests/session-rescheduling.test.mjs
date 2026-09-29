import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function compile(s,context){context.exports={};vm.runInNewContext(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
test('Returning online refreshes stores without an auth lock; repeated focus coalesces and polling is limited to critical stores',()=>{
 const events={},tasks=[],intervals=[];let auth;let now=100000;const calls=[];
 const document={visibilityState:'visible',addEventListener:(e,fn)=>{events[e]=fn}};
 const navigator={onLine:true};
 const api=compile(source('src/lib/auth-rehydrate.ts'),{console,Date:{now:()=>now},setTimeout:fn=>tasks.push(fn),setInterval:fn=>intervals.push(fn),document,navigator,window:{addEventListener:(e,fn)=>{events[e]=fn}},require:()=>({supabase:{auth:{onAuthStateChange:fn=>{auth=fn}}}})});
 api.registerRehydrate(reason=>calls.push('critical:'+reason),{critical:true});api.registerRehydrate(reason=>calls.push('other:'+reason));
 auth('SIGNED_IN',{user:{id:'one'}});assert.equal(calls.length,0);while(tasks.length)tasks.shift()();assert.deepEqual(calls,['critical:auth','other:auth']);
 calls.length=0;events.focus();events.visibilitychange();while(tasks.length)tasks.shift()();assert.equal(calls.length,2);
 calls.length=0;intervals[0]();while(tasks.length)tasks.shift()();assert.deepEqual(calls,['critical:refresh']);
 calls.length=0;navigator.onLine=false;now+=20000;events.focus();intervals[0]();assert.equal(tasks.length,0);
 navigator.onLine=true;events.online();while(tasks.length)tasks.shift()();assert.equal(calls.length,2);
});
test('Mexico City selection is independent of the device timezone',()=>{
 const api=compile(source('src/lib/academy-time.ts'),{Intl,Date});
 assert.equal(api.academyDateTime('2026-10-07T22:00:00Z'),'2026-10-07T16:00');
 assert.equal(api.academyISO('2026-10-07T16:00'),'2026-10-07T22:00:00.000Z');
});
function functions(file,names){const ast=ts.createSourceFile('store.ts',source(file),ts.ScriptTarget.Latest,true);return ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getFullText(ast)).join('\n');}
test('A session query failure retains cached sessions; a late response from the previous account cannot replace current data',async()=>{
 const tasks=[];const context={console,Map,toast:{warning(){},dismiss(){}},hydrateGeneration:0,refreshQueued:false,hydrated:false,hydratePromise:null,sessionsCache:[{id:9}],hydrateUserIdBridge:async()=>{},notify:()=>{},notifyError:()=>{},mapSessionRow:r=>r,withTimeout:p=>p,supabase:{from:t=>({select:()=>t==='sessions'?new Promise(resolve=>tasks.push(resolve)):Promise.resolve({data:[]})})}};
 const api=compile(functions('src/lib/sessions-store.ts',['hydrate','invalidateAndRehydrate','refreshSessions'])+'\nexport {hydrate};',context);
 const first=api.hydrate();await new Promise(setImmediate);tasks.shift()({error:new Error('offline')});await first;assert.equal(context.sessionsCache[0].id,9);assert.equal(context.hydrated,false);
 const stale=api.hydrate();await new Promise(setImmediate);context.hydrateGeneration++;context.sessionsCache=[{id:20}];tasks.shift()({data:[{id:1}]});await stale;assert.equal(context.sessionsCache[0].id,20);
});
test('Student cancellation reports persistence failure and cannot dispatch an email before saving',async()=>{
 let notify=0;const context={console,Number,sessionsCache:[{id:'1',status:'scheduled'}],notify:()=>{},notifyError:()=>{},notifySessionEvent:()=>{notify++},supabase:{rpc:async()=>({error:new Error('denied')})}};
 const api=compile(functions('src/lib/sessions-store.ts',['studentSetSessionStatus']),context);
 assert.equal(await api.studentSetSessionStatus('1','cancelled'),false);assert.equal(context.sessionsCache[0].status,'scheduled');assert.equal(notify,0);
 context.supabase.rpc=async()=>({error:null});assert.equal(await api.studentSetSessionStatus('1','cancelled'),true);assert.equal(notify,1);
});
test('Admin review writes only review fields and restores the prior session when persistence fails',async()=>{
 let failure=false, savedPatch; const original={id:'7',status:'completed',student_rating:2,review_status:'pending'};
 const context={console,Number,Error,sessionsCache:[original],notify:()=>{},notifyError:()=>{},refreshSessions:async()=>{},
  mapSessionRow:row=>row,setSessionEntry:(id,row)=>{context.sessionsCache=context.sessionsCache.map(s=>s.id===id?row:s)},
  supabase:{from:table=>{assert.equal(table,'sessions');return {update:patch=>{savedPatch=patch;return {eq:()=>({select:()=>({single:async()=>failure?{data:null,error:new Error('denied')}:{data:{...original,...patch},error:null}})})}}}}}
 };
 const api=compile(functions('src/lib/sessions-store.ts',['updateSession']),context);
 assert.equal(await api.updateSession('7',{review_status:'reviewed',review_note:'Followed up'}),true);
 assert.deepEqual(JSON.parse(JSON.stringify(savedPatch)),{review_status:'reviewed',review_note:'Followed up'});
 assert.equal(context.sessionsCache[0].review_status,'reviewed');
 failure=true;
 assert.equal(await api.updateSession('7',{review_status:'discarded',review_note:'Duplicate'}),false);
 assert.equal(context.sessionsCache[0].review_status,'reviewed');
});
test('Email worker rejects malformed or invalid capabilities before processing, and saves partial failure for retry',async()=>{
 let handler,claim=null,processed=0;const calls=[];
 compile(source('supabase/functions/session-email-worker/index.ts'),{console,Response,Deno:{env:{get:()=>''},serve:fn=>{handler=fn}},require:name=>name.includes('handler')?{handleSessionNotification:async()=>{processed++;return Response.json({ok:false,results:{teacher:{ok:false,status:429}}})}}:{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_session_email_job'?claim:null,error:null}}})}});
 const req=body=>({method:'POST',json:async()=>body});
 assert.equal((await handler(req({id:'bad',token:'bad'}))).status,401);assert.equal(calls.length,0);
 const body={id:'00000000-0000-4000-8000-000000000001',token:'00000000-0000-4000-8000-000000000001'.repeat(2)};
 assert.equal((await handler(req(body))).status,401);assert.equal(processed,0);
 claim={eventId:body.id};assert.equal((await handler(req(body))).status,200);assert.equal(processed,1);assert.equal(calls.at(-1).name,'finish_session_email_job');assert.equal(calls.at(-1).args.p_ok,false);
});
