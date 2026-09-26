import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(source, context) {
  context.exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
function storeFunctions(names) {
  const source = fs.readFileSync(new URL('../src/lib/students-store.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('store.ts', source, ts.ScriptTarget.Latest, true);
  return ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getFullText(ast)).join('\n');
}
test('An authenticated student absent from the legacy roster can choose once; a missing account cannot report success', () => {
  const USERS = [], context = { USERS, readProfileOverrides: () => ({}), persistStudentPatch: (id, patch) => Object.assign(USERS.find(u => u.id === id), patch) };
  const api = compile(storeFunctions(['registerChallengeStudent', 'chooseChallenge', 'hasChosenChallenge']), context);
  assert.equal(api.chooseChallenge('real', 'caption'), false);
  api.registerChallengeStudent({ id: 'real', role: 'student', name: 'Real account' });
  api.registerChallengeStudent({ id: 'real', role: 'student', name: 'Real account' });
  assert.equal(USERS.length, 1);
  assert.equal(api.chooseChallenge('real', 'caption'), true);
  assert.equal(api.hasChosenChallenge('real', 'caption'), true);
  assert.equal(api.chooseChallenge('real', 'caption'), false);
});
test('The id bridge accepts known UUID-only accounts and retains them during roster pruning', async () => {
  const source = fs.readFileSync(new URL('../src/lib/user-id-bridge.ts', import.meta.url), 'utf8');
  const api = compile(source, { console, require: () => ({ supabase: { rpc: async () => ({ data: [{ id: 'uuid-one', legacy_id: 'old-one' }, { id: 'uuid-only', legacy_id: null }], error: null }) } }) });
  assert.equal(await api.legacyToUuid('old-one'), 'uuid-one');
  assert.equal(await api.legacyToUuid('uuid-only'), 'uuid-only');
  assert.equal(await api.legacyToUuid('unknown'), null);
  assert.ok(api.getKnownUserIds().has('uuid-only'));
});
test('Leaderboard only exposes remote rows and clears them on error or logout', async () => {
  let snapshot, session = true, failed = false, calls = 0;
  const api = compile(fs.readFileSync(new URL('../src/lib/challenge-leaderboard-store.ts', import.meta.url), 'utf8'), {
    console, require: name => name === 'react' ? { useSyncExternalStore: (_subscribe, get) => { snapshot = get(); return snapshot; } } : name.includes('auth-rehydrate') ? {} : { supabase: {
      auth: { getSession: async () => ({ data: { session: session ? { user: { id: 'real' } } : null } }) },
      rpc: async () => { calls++; return failed ? { error: {} } : { data: [{ student_id: 'real', legacy_id: null, display_name: 'Real student', avatar_seed: 'Real student', use_real_avatar: true, completed_count: 2, current_streak: 3, longest_streak: 4, last_delivery_at: null }], error: null }; },
    } },
  });
  await api.refreshChallengeLeaderboard(); api.useChallengeLeaderboard();
  assert.equal(snapshot.rows.length, 1); assert.equal(snapshot.rows[0].userId, 'real');
  assert.equal(snapshot.rows[0].completed, 2); assert.equal(snapshot.rows[0].currentStreak, 3);
  failed = true; await api.refreshChallengeLeaderboard(); api.useChallengeLeaderboard();
  assert.equal(snapshot.status, 'error'); assert.equal(snapshot.rows.length, 0);
  session = false; await api.refreshChallengeLeaderboard(); api.useChallengeLeaderboard();
  assert.equal(snapshot.rows.length, 0); assert.equal(calls, 2);
});
