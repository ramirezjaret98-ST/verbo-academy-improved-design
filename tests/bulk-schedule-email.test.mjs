import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
const read = p => fs.readFileSync(new URL('../supabase/functions/notify-session-event/' + p, import.meta.url), 'utf8');
function compile(source, overrides = {}) {
  const context = { exports: {}, Response, AbortSignal, fetch, crypto: webcrypto, TextEncoder, setTimeout: fn => fn(), Date, Map, Set, ...overrides };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const transport = compile(read('email-delivery.ts'));
function namedFunction(source, name) {
  const ast = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return ts.isVariableDeclaration(found) ? 'export const ' + found.getText(ast) + ';' : found.getFullText(ast);
}
test('The real bulk form saves one request in CDMX and excludes past or inactive sessions; failures keep it open', async () => {
  const route = fs.readFileSync(new URL('../src/routes/admin.sessions.tsx', import.meta.url), 'utf8');
  const clock = compile(fs.readFileSync(new URL('../src/lib/academy-time.ts', import.meta.url), 'utf8'), { Intl });
  const calls = []; let saves = true;
  const api = compile(namedFunction(route, 'applyBulk'), {
    ...clock, studentId: 'one',
    sessions: [
      { id: '1', student_id: 'one', teacher_id: 'teacher', status: 'scheduled', date_time: '2099-10-02T21:30:00Z' },
      { id: '2', student_id: 'one', teacher_id: 'teacher', status: 'ready', date_time: '2099-10-09T21:30:00Z' },
      { id: '3', student_id: 'one', status: 'scheduled', date_time: '2000-01-01T15:00:00Z' },
      { id: '4', student_id: 'one', status: 'cancelled', date_time: '2099-10-02T21:30:00Z' },
      { id: '5', student_id: 'other', status: 'scheduled', date_time: '2099-10-02T21:30:00Z' },
    ],
    updateSessionsBulk: async rows => { calls.push({ type: 'save', rows }); return saves; },
    setStudentVideoLink: () => calls.push({ type: 'link' }), setBulkOpen: () => calls.push({ type: 'close' }), notifySuccess: () => calls.push({ type: 'success' }),
  });
  const opts = { time: '15:30', teacherId: 'teacher', teamsLink: 'fixture', days: [], sourceDays: [], permanent: true };
  assert.equal(await api.applyBulk(opts), true); assert.equal(calls.filter(x => x.type === 'save').length, 1);
  assert.equal(calls[0].rows.length, 2); assert.equal(calls[0].rows[0].patch.date_time, '2099-10-02T21:30:00.000Z');
  calls.length = 0; saves = false; assert.equal(await api.applyBulk(opts), false);
  assert.deepEqual(calls.map(x => x.type), ['save']);
});
test('The real bulk store bridges IDs and refreshes once, without per-row updates or emails', async () => {
  const source = fs.readFileSync(new URL('../src/lib/sessions-store.ts', import.meta.url), 'utf8');
  let requests = 0, refreshes = 0, errors = 0, fail = false;
  const api = compile(namedFunction(source, 'updateSessionsBulk'), {
    legacyToUuid: async () => '00000000-0000-4000-8000-000000000001',
    refreshSessions: async () => { refreshes++; }, notifyError: () => { errors++; },
    supabase: { rpc: async (name, args) => { requests++; assert.equal(name, 'admin_update_sessions'); assert.equal(args.p_updates.length, 46); return { error: fail ? { message: 'Conflict' } : null }; } },
  });
  const updates = Array.from({ length: 46 }, (_, i) => ({ session: { id: String(i + 1), teacher_id: 'legacy', date_time: '2099-10-02T21:30:00Z', status: 'scheduled' }, patch: {} }));
  assert.equal(await api.updateSessionsBulk(updates), true); assert.equal(requests, 1); assert.equal(refreshes, 1);
  fail = true; assert.equal(await api.updateSessionsBulk(updates), false); assert.equal(refreshes, 1); assert.equal(errors, 1);
});
test('Quota exhaustion makes one request; rate limiting still retries', async () => {
  let attempts = 0;
  const options = { apiKey: 'fixture', from: 'academy@example.invalid', to: ['one@example.invalid'], subject: 'Fixture', html: 'Fixture', idempotencyKey: 'fixture' };
  const runtime = code => ({ sleep: async () => {}, fetch: async () => { attempts++; return Response.json({ name: code }, { status: 429 }); } });
  assert.equal((await transport.sendResendEmail(options, runtime('daily_quota_exceeded'))).attempts, 1);
  assert.equal(attempts, 1); attempts = 0;
  await transport.sendResendEmail(options, runtime('rate_limit_exceeded')); assert.equal(attempts, 3);
});
test('Accepted recipients are not sent again on a later quota retry; content is frozen', async () => {
  const ledger = new Map(); let sends = 0;
  const admin = { rpc: async (name, args) => {
    const key = args.p_delivery_key;
    if (name === 'prepare_session_email_delivery') {
      if (!ledger.has(key)) ledger.set(key, { message: args.p_message, sent: false });
      return { data: ledger.get(key) };
    }
    ledger.get(key).sent = true; return { error: null };
  } };
  const api = compile(read('job-delivery.ts'), { require: () => transport });
  const options = { apiKey: 'fixture', from: 'academy@example.invalid', to: ['one@example.invalid'], subject: 'Original', html: 'Original', idempotencyKey: 'one' };
  const runtime = { sleep: async () => {}, fetch: async (_, req) => { sends++; assert.equal(JSON.parse(req.body).subject, 'Original'); return Response.json({ id: 'accepted' }); } };
  assert.equal((await api.sendJobEmail(options, admin, 'job', runtime)).ok, true);
  assert.equal((await api.sendJobEmail({ ...options, subject: 'Changed' }, admin, 'job', runtime)).attempts, 0);
  assert.equal(sends, 1);
});
test('46 admin changes produce one summary per person with student privacy', async () => {
  const users = [{ id: 'one', name: 'One', email: 'one@example.invalid' }, { id: 'two', name: 'Two', email: 'two@example.invalid' }, { id: 'teacher', name: 'Teacher', email: 'teacher@example.invalid' }];
  const changes = Array.from({ length: 46 }, (_, i) => ({ eventId: String(i), session: { id: i, student_id: i < 14 ? 'one' : 'two', teacher_id: 'teacher', date_time: '2027-01-02T15:00:00Z' }, extra: { previousDateTime: '2027-01-01T15:00:00Z' } }));
  const sent = [];
  const admin = { from: table => ({ select: () => ({ in: async () => ({ data: users }), eq: () => ({ maybeSingle: async () => ({ data: { admin_emails: ['admin@example.invalid', 'ADMIN@example.invalid'] } }) }) }) }) };
  const api = compile(read('schedule-summary.ts'), {
    Deno: { env: { get: () => 'fixture' } },
    require: name => name.includes('supabase-js') ? { createClient: () => admin } : name.includes('job-delivery') ? { sendJobEmail: async options => { sent.push(options); return { ok: true, attempts: 1 }; } } : name.includes('handler') ? { fmtDate: x => x, renderEmail: x => JSON.stringify(x) } : transport,
  });
  const response = await api.handleAdminScheduleSummary({ eventId: 'job', changes });
  assert.equal((await response.json()).ok, true); assert.equal(sent.length, 4);
  const forEmail = email => JSON.parse(sent.find(x => x.to[0] === email).html);
  assert.equal(forEmail('one@example.invalid').rows.length, 14);
  assert.equal(forEmail('two@example.invalid').rows.length, 32);
  assert.equal(forEmail('teacher@example.invalid').rows.length, 46);
  assert.equal(forEmail('admin@example.invalid').rows.length, 46);
  assert.ok(sent.every(x => x.to.length === 1));
  const recipients = api.summaryRecipients(changes, users, ['one@example.invalid']);
  assert.equal(recipients.size, 3); assert.equal(recipients.get('one@example.invalid').changes.length, 46);
});
test('Summary stops at quota exhaustion without contacting remaining recipients', async () => {
  let calls = 0;
  const api = compile(read('schedule-summary.ts'), {
    Deno: { env: { get: () => 'fixture' } },
    require: name => name.includes('supabase-js') ? { createClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: [{ id: 'student', name: 'Student', email: 'student@example.invalid' }, { id: 'teacher', name: 'Teacher', email: 'teacher@example.invalid' }] }), eq: () => ({ maybeSingle: async () => ({ data: { admin_emails: ['admin@example.invalid'] } }) }) }) }) }) } : name.includes('job-delivery') ? { sendJobEmail: async () => { calls++; return { ok: false, code: 'daily_quota_exceeded', attempts: 1 }; } } : name.includes('handler') ? { fmtDate: x => x, renderEmail: x => JSON.stringify(x) } : transport,
  });
  const response = await api.handleAdminScheduleSummary({ eventId: 'job', changes: [{ eventId: 'event', session: { id: 1, student_id: 'student', teacher_id: 'teacher', date_time: '2027-01-02T15:00:00Z' }, extra: { previousDateTime: '2027-01-01T15:00:00Z' } }] });
  assert.equal((await response.json()).ok, false); assert.equal(calls, 1);
});
