import test from 'node:test';
import assert from 'node:assert/strict';
import {controlFlags} from '../src/lib/session-control.ts';
const end=Date.parse('2026-11-06T16:00:00Z');
const row={occurrence_key:'s:1',teacher_id:'teacher',teacher_name:'Teacher',source:'academy',label:'Class',scheduled_at:'2026-11-06T15:00:00Z',duration_minutes:60,session_id:1,session_status:'scheduled',report_at:null,stale:false,resolution_current:false,confirmation:null};
const confirmed={...row,confirmation:{outcome:'held',confirmed_at:'2026-11-06T16:01:00Z',confirmation_late:false,revision:1}};
test('unfinished classes cannot enter the confirmation queue; the boundary is session end',()=>{
 assert.equal(controlFlags(row,end-1).needsConfirmation,false);
 assert.equal(controlFlags(row,end).needsConfirmation,true);
});
test('a submitted report does not replace teacher confirmation',()=>{
 const f=controlFlags({...row,report_at:'2026-11-06T16:02:00Z',session_status:'completed'},end+1000);
 assert.equal(f.needsConfirmation,true);assert.equal(f.complete,false);
});
test('teacher confirmation does not replace a report; overdue starts after 24h',()=>{
 assert.equal(controlFlags(confirmed,end+86_400_000).reportOverdue,false);
 assert.equal(controlFlags(confirmed,end+86_400_001).reportOverdue,true);
});
test('a late report clears pending work while retaining the lateness signal',()=>{
 const f=controlFlags({...confirmed,report_at:'2026-11-07T16:00:01Z',session_status:'completed'},end+172_800_000);
 assert.equal(f.reportLate,true);assert.equal(f.needsReport,false);assert.equal(f.complete,true);
});
test('negative attendance conflicting with held confirmation requires operations review',()=>{
 for(const session_status of ['absent','cancelled','pending_reschedule','no_show'])assert.equal(controlFlags({...confirmed,session_status},end+1000).discrepancy,true);
});
test('an approved resolution closes only discrepancy work, leaving missing reports pending',()=>{
 const f=controlFlags({...confirmed,resolution_current:true,session_status:'absent'},end+1000);
 assert.equal(f.discrepancy,false);assert.equal(f.needsReport,true);assert.equal(f.complete,false);
});
test('external and Academy reports cannot satisfy each other',()=>{
 const f=controlFlags({...confirmed,source:'external',report_at:'2026-11-06T16:01:00Z'},end+1000);
 assert.equal(f.needsReport,true);
 const g=controlFlags({...confirmed,confirmation:{...confirmed.confirmation,external_report_at:'2026-11-06T16:01:00Z'}},end+1000);
 assert.equal(g.needsReport,true);
});
test('schedule changes invalidate confirmation and suppress obsolete external report entry',()=>{
 const f=controlFlags({...confirmed,source:'external',stale:true},end+1000);
 assert.equal(f.needsConfirmation,true);assert.equal(f.discrepancy,true);assert.equal(f.needsReport,false);
});
test('a missing-session declaration needs review even if a held outcome is supplied',()=>{
 assert.equal(controlFlags({...confirmed,source:'missing'},end+1000).discrepancy,true);
});
