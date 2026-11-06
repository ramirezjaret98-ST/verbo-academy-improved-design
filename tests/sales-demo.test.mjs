import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
function named(source,name){const ast=ts.createSourceFile('fixture.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast).replace(/^export /,'');}
function compile(source,context={}){const scope={exports:{},Date,Intl,Map,Set,Response,Request,console,...context};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope;}
test('Sales demo markers survive the real session mapper and are excluded from aggregate metrics',()=>{
 const api=compile(read('src/lib/sales-demo.ts')+'\n'+named(read('src/lib/sessions-store.ts'),'mapSessionRow')+'\nexports.map=mapSessionRow;', {uuidToLegacySync:x=>x});
 const real=api.exports.map({id:1,student_id:'real',teacher_id:'teacher'},[],[]);
 const demo=api.exports.map({id:2,student_id:'demo',teacher_id:'teacher',is_sales_demo:true},[],[]);
 assert.equal(api.exports.countsInRealMetrics(real),true);assert.equal(api.exports.countsInRealMetrics(demo),false);
});
test('Demo level access is broad while ordinary students keep their purchased-level progression',()=>{
 const context={levelIsComplete:()=>false,passedUnitCount:()=>0,userById:id=>({is_sales_demo:id==='demo'})};
 const api=compile(named(read('src/routes/student.courses.tsx'),'computeLevelStates')+'\nexports.states=computeLevelStates;',context);
 const levels=['One','Two','Three'].map(name=>({name,units:[{}]}));
 assert.deepEqual(Array.from(api.exports.states(levels,['One','Two'],[],'demo'),x=>x.kind),['current','current','locked_not_contracted']);
 assert.deepEqual(Array.from(api.exports.states(levels,['One','Two'],[],'real'),x=>x.kind),['current','locked_progress','locked_not_contracted']);
});
test('Demo-only availability leaves the real teacher schedule empty and respects collisions, weekdays and the designated teacher',()=>{
 let sessions=[];
 const api=compile(named(read('src/lib/availability-store.ts'),'isTeacherAvailableAt')+'\nexports.available=isTeacherAvailableAt;',{
   userById:id=>id==='demo'?{is_sales_demo:true,sales_demo_teacher_id:'teacher-uuid'}:undefined,
   uuidToLegacySync:id=>id==='teacher-uuid'?'teacher':id,isExternallyBlockedAt:()=>false,
   DAY_KEYS:['mon','tue','wed','thu','fri','sat'],getAvailability:()=>({weekly:{}}),loadSessions:()=>sessions,
 });
 const monday='2099-01-05T16:00:00Z'; // Monday 10:00 CDMX.
 assert.equal(api.exports.available('teacher',monday,60,undefined,'demo'),true);
 assert.equal(api.exports.available('teacher',monday,60),false);
 assert.equal(api.exports.available('other',monday,60,undefined,'demo'),false);
 assert.equal(api.exports.available('teacher','2099-01-04T16:00:00Z',60,undefined,'demo'),false);
 sessions=[{id:'taken',teacher_id:'teacher',date_time:monday,duration_minutes:60,status:'scheduled'}];
 assert.equal(api.exports.available('teacher',monday,60,undefined,'demo'),false);
});
test('The real email handler authenticates demo callers and suppresses transport for demo sessions',async()=>{
 for(const caller of ['demo','outsider']){
   let sent=0;let reads=0;
   const admin={from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>{reads++;return {data:table==='sessions'?{id:1,student_id:'demo',teacher_id:'teacher',is_sales_demo:true}:{role:'student'}};}})})})};
   const callerClient={auth:{getUser:async()=>({data:{user:{id:caller}},error:null})}};
   let clients=0;
   const api=compile(read('supabase/functions/notify-session-event/handler.ts'),{
     Deno:{env:{get:()=> 'fixture'}},fetch:async()=>{sent++;throw Error('Email transport must not run');},
     require:name=>name.includes('supabase-js')?{createClient:()=>++clients===1?callerClient:admin}:{sendWithRetry:async()=>{sent++;},sendJobEmail:async()=>{sent++;}},
   });
   const response=await api.exports.handleSessionNotification(new Request('https://academy.invalid/notify',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({sessionId:1,kind:'report_ready'})}));
   assert.equal(response.status,caller==='demo'?200:403);
   if(caller==='demo')assert.equal((await response.json()).skipped,'sales_demo');
   assert.equal(sent,0);assert.equal(reads,2);
 }
});
