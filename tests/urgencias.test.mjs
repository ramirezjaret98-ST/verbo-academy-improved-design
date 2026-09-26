import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const quiet = { error() {}, log() {} };
function loadTs(file, imports = {}, globals = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: name => { if (!(name in imports)) throw new Error(`Unexpected import ${name}`); return imports[name]; }, console: quiet, fetch, AbortSignal, crypto, TextEncoder, Response, Request, setTimeout, ...globals };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const transport = loadTs('../supabase/functions/notify-session-event/email-delivery.ts');
const evidence = loadTs('../src/lib/challenge-evidence.ts', { '@/integrations/supabase/client': { supabase: {} } });

test('Evidence rejects oversized, empty, executable and mismatched files, accepts supported files at the size limit', () => {
  const max = evidence.MAX_CHALLENGE_EVIDENCE_BYTES;
  assert.equal(evidence.validateChallengeEvidence({ name: 'work.pdf', size: max, type: 'application/pdf' }), null);
  assert.ok(evidence.validateChallengeEvidence({ name: 'work.pdf', size: max + 1, type: 'application/pdf' }));
  assert.ok(evidence.validateChallengeEvidence({ name: 'work.pdf', size: 0, type: 'application/pdf' }));
  assert.ok(evidence.validateChallengeEvidence({ name: 'work.svg', size: 50, type: 'image/svg+xml' }));
  assert.ok(evidence.validateChallengeEvidence({ name: 'work.jpg', size: 50, type: 'text/html' }));
  assert.equal(evidence.validateChallengeEvidence({ name: 'work.MOV', size: 50, type: '' }), null);
});

test('An upload uses the signed-in account folder, a private permanent locator, and never overwrites', async () => {
  let upload;
  const module = loadTs('../src/lib/challenge-evidence.ts', { '@/integrations/supabase/client': { supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'student-test' } } } }) },
    storage: { from: bucket => ({ upload: async (path, file, options) => { upload = { bucket, path, options }; return { error: null }; }, getPublicUrl: path => ({ data: { publicUrl: `https://example.invalid/storage/v1/object/public/${bucket}/${path}` } }) }) },
  } } });
  const result = await module.uploadChallengeEvidence({ name: 'work.pdf', size: 50, type: 'application/pdf' });
  assert.equal(result.ok, true);
  assert.equal(upload.bucket, 'challenge-evidence');
  assert.match(upload.path, /^student-test\/[a-f0-9-]+\.pdf$/);
  assert.equal(upload.options.upsert, false);
  assert.match(result.url, /challenge-evidence\/student-test\//);
  assert.ok(!result.url.includes('?token='));
});

test('A rate limit is retried with the same idempotency key; permanent rejection is returned', async () => {
  const calls = [], waits = [];
  const options = { apiKey: 'test-key', from: 'test@example.invalid', to: [' teacher@example.invalid ', 'TEACHER@example.invalid'], subject: 'test', html: '<p>test</p>', idempotencyKey: 'same-event' };
  const result = await transport.sendResendEmail(options, { fetch: async (_url, init) => { calls.push(init); return calls.length === 1 ? new Response('{"name":"rate_limit_exceeded"}', { status: 429 }) : new Response('{"id":"accepted-test"}', { status: 200 }); }, sleep: async ms => { waits.push(ms); } });
  assert.equal(result.ok, true); assert.equal(result.attempts, 2); assert.equal(waits.length, 1);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].body).to, ['teacher@example.invalid']);
  let rejectedCalls = 0;
  const rejected = await transport.sendResendEmail(options, { fetch: async () => { rejectedCalls++; return new Response('{"name":"validation_error"}', { status: 422 }); }, sleep: async () => {} });
  assert.equal(rejected.ok, false); assert.equal(rejectedCalls, 1);
});

test('Evidence signing does not reuse another account authorization after switching accounts', async () => {
  let account = 'teacher-one', requests = 0;
  const resolver = loadTs('../src/lib/storage-signed-url.ts', { '@/integrations/supabase/client': { supabase: {
    auth: { getSession: async () => ({ data: { session: account ? { user: { id: account } } : null } }) },
    storage: { from: () => ({ createSignedUrl: async () => { requests++; return { data: account === 'teacher-one' ? { signedUrl: 'https://example.invalid/signed-for-teacher-one' } : null, error: null }; } }) },
  } } });
  const url = 'https://example.invalid/storage/v1/object/public/challenge-evidence/student-test/work.pdf';
  assert.equal(await resolver.resolveContentUrl(url), 'https://example.invalid/signed-for-teacher-one');
  assert.equal(await resolver.resolveContentUrl(url), 'https://example.invalid/signed-for-teacher-one');
  assert.equal(requests, 1);
  account = 'unrelated-student';
  assert.equal(await resolver.resolveContentUrl(url), url); assert.equal(requests, 2);
  account = null;
  assert.equal(await resolver.resolveContentUrl(url), url); assert.equal(requests, 2);
});

function handlerFixture({ rejectTeacher = false, teacherEmail = 'teacher@example.invalid', adminEmail = 'admin@example.invalid', caller = 'student-test' } = {}) {
  const sends = [];
  let handler;
  const rows = { 'student-test': { name: 'Test student', email: 'student@example.invalid', role: 'student' }, 'teacher-test': { name: 'Test teacher', email: teacherEmail, role: 'teacher' } };
  const service = { from: table => {
    let id;
    const query = { select() { return query; }, eq(_column, value) { id = value; return query; }, async maybeSingle() {
      if (table === 'sessions') return { data: { id: 1, teacher_id: 'teacher-test', student_id: 'student-test', date_time: '2026-10-01T15:00:00Z', updated_at: '2026-09-26T15:00:00Z', status: 'pending_reschedule' } };
      if (table === 'notification_settings') return { data: { admin_emails: [adminEmail] } };
      if (table === 'app_users') return { data: rows[id] ?? { role: 'student' } };
      throw new Error(`Unexpected table ${table}`);
    } }; return query;
  } };
  loadTs('../supabase/functions/notify-session-event/index.ts', {
    'jsr:@supabase/supabase-js@2': { createClient: (_url, key) => key === 'service-test' ? service : { auth: { getUser: async () => ({ data: { user: { id: caller } } }) } } },
    './email-delivery.ts': { ...transport, sendResendEmail: async opts => { sends.push(opts); return rejectTeacher && opts.to[0] === teacherEmail ? { ok: false, status: 422, code: 'validation_error', attempts: 1 } : { ok: true, id: 'test-accepted', attempts: 1 }; } },
  }, { Deno: { env: { get: key => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service-test' : 'test-value' }, serve: fn => { handler = fn; } }, setTimeout: fn => { fn(); } });
  return { sends, invoke: kind => handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: 'Bearer fake-test', 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 1, kind }) })) };
}

for (const kind of ['cancelled', 'absent', 'pending_reschedule']) test(`${kind}: teacher, administration and student are notified separately`, async () => {
  const fixture = handlerFixture(); const response = await fixture.invoke(kind); const body = await response.json();
  assert.equal(body.ok, true); assert.equal(fixture.sends.length, 3);
  assert.deepEqual(fixture.sends.map(send => send.to[0]), ['teacher@example.invalid', 'admin@example.invalid', 'student@example.invalid']);
  assert.match(fixture.sends[0].html, /\/teacher\/calendar/); assert.match(fixture.sends[1].html, /\/admin\/calendar/);
});
test('Teacher rejection does not suppress the admin or student email and is not reported as success', async () => {
  const fixture = handlerFixture({ rejectTeacher: true }); const body = await (await fixture.invoke('pending_reschedule')).json();
  assert.equal(fixture.sends.length, 3); assert.equal(body.ok, false); assert.equal(body.accepted, 2); assert.equal(body.results.internal_0.status, 422);
});
test('Shared teacher/admin address is notified once', async () => {
  const fixture = handlerFixture({ adminEmail: ' teacher@example.invalid ' }); const body = await (await fixture.invoke('cancelled')).json();
  assert.equal(body.ok, true); assert.equal(fixture.sends.length, 2);
});
test('An unrelated student cannot trigger another session email', async () => {
  const fixture = handlerFixture({ caller: 'other-student' }); const response = await fixture.invoke('cancelled');
  assert.equal(response.status, 403); assert.equal(fixture.sends.length, 0);
});

// Exercise the real exported store functions without bootstrapping app caches or contacting Supabase.
function submissionFixture({ throws = false, missingRow = false, returned = false } = {}) {
  const source = fs.readFileSync(new URL('../src/lib/students-store.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('store.ts', source, ts.ScriptTarget.Latest, true);
  const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['submitChallenge', 'resubmitChallenge'].includes(node.name?.text)).map(node => node.getFullText(ast)).join('\n');
  const cache = new Map([['student-test', returned ? [{ challenge_id: 'challenge-test', status: 'needs_resubmission', link: 'old', submitted_at: 'old-date', history: [] }] : []]]);
  let streakChanges = 0;
  const query = { insert() { return query; }, update() { return query; }, eq() { return query; }, select() { return query; }, async single() { if (throws) throw new Error('Offline'); return { data: missingRow ? null : { id: 1 }, error: null }; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
  const context = { exports: {}, console: quiet, USERS: [{ id: 'student-test', current_streak: 2 }], submissionsCache: cache, submissionDbId: new Map([['student-test:challenge-test', 1]]), completeCooldownRemaining: () => null, legacyToUuid: async () => 'student-test', resolveChallengeDbId: async () => 'challenge-test', supabase: { from: () => query }, persistStudentPatch: () => { streakChanges++; } };
  vm.runInNewContext(ts.transpileModule(selected, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { functions: context.exports, cache, streakChanges: () => streakChanges };
}

test('A thrown submission write restores the cache and does not advance a streak; a retry succeeds', async () => {
  const failed = submissionFixture({ throws: true });
  assert.equal(await failed.functions.submitChallenge('student-test', 'challenge-test', 'normal', 'https://example.invalid'), false);
  assert.equal(failed.cache.get('student-test').length, 0); assert.equal(failed.streakChanges(), 0);
  const success = submissionFixture();
  assert.equal(await success.functions.submitChallenge('student-test', 'challenge-test', 'normal', 'https://example.invalid'), true);
  assert.equal(success.cache.get('student-test').length, 1); assert.equal(success.streakChanges(), 1);
});

test('A resubmission must affect a row; a missing row or network failure restores the returned delivery', async () => {
  for (const failure of [{ missingRow: true }, { throws: true }]) {
    const fixture = submissionFixture({ ...failure, returned: true });
    assert.equal(await fixture.functions.resubmitChallenge('student-test', 'challenge-test', 'https://example.invalid'), false);
    assert.equal(fixture.cache.get('student-test')[0].status, 'needs_resubmission');
    assert.equal(fixture.cache.get('student-test')[0].link, 'old');
  }
});
