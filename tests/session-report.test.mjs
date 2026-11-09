import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/lib/session-report-content.ts',import.meta.url),'utf8');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {reportContentError,cleanReportContent}=context.exports;
const entries=Array.from({length:6},(_,i)=>({id:String(i),type:'New word',term:'Term '+i,explanation:'Meaning '+i}));
const report=()=>({version:3,todayWin:'Explained a problem clearly.',nextMove:'',entries:structuredClone(entries),skipped:{}});

test('The original table accepts six entries of any category with no next-session instructions',()=>{
  assert.equal(reportContentError(report()),undefined);
  assert.equal(reportContentError({...report(),nextMove:'Prepare an example.'}),undefined);
});
test("Today's Win is required; the original six-to-ten entry limits remain",()=>{
  assert.match(reportContentError({...report(),todayWin:'  '}),/Win/);
  assert.match(reportContentError({...report(),entries:entries.slice(0,5)}),/6 and 10/);
  assert.match(reportContentError({...report(),entries:Array.from({length:11},()=>entries[0])}),/6 and 10/);
});
test('Unfinished entries and oversized next-session instructions cannot be silently dropped',()=>{
  assert.match(reportContentError({...report(),entries:[...entries,{id:'partial',type:'Tip',term:'Started',explanation:''}]}),/Complete both/);
  assert.match(reportContentError({...report(),nextMove:'x'.repeat(2001)}),/2,000/);
});
test('Absence ignores learning assessments and cleans all student-learning fields',()=>{
  assert.equal(reportContentError(report(),true),undefined);
  const result=cleanReportContent(report(),true);
  assert.equal(result.version,3);assert.equal(result.todayWin,'');assert.equal(result.nextMove,'');assert.equal(result.entries.length,0);
});
test('Historical v2 validation remains compatible with required next move and category review',()=>{
  const historical={...report(),version:2,nextMove:'Prepare an update.',skipped:{Mistake:'No mistakes observed.',Pronunciation:'Written work.',Tip:'Not covered.'}};
  assert.equal(reportContentError(historical),undefined);
  assert.match(reportContentError({...historical,nextMove:''}),/Your Next Move/);
  assert.match(reportContentError({...historical,skipped:{}}),/explain why/);
});
