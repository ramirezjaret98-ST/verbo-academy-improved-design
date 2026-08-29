// Shared bridge between the legacy short ids ("u1".."u8") that most of the
// frontend still uses as `User.id` (see `mock-data.ts`/`auth.tsx`), and the
// real Supabase `app_users.id` UUIDs that DB-backed tables use as foreign
// keys (`app_users.legacy_id` is the column that links the two).
//
// Any store migrating a `student_id`/`teacher_id`/`admin_id` uuid column
// should use this instead of inventing its own lookup, so every store stays
// consistent and the mapping is only fetched/cached once.
//
// 2026-08-08 fix: this used to fetch the mapping via a plain
// `supabase.from("app_users").select("id, legacy_id")`. That's fine for an
// admin session (the `app_users_select` RLS policy lets admin read every
// row), but for a TEACHER or STUDENT session that same policy only returns
// the CALLER's own row (`id = auth.uid() OR is_admin()`) — so the bridge
// silently ended up with a map containing only the signed-in user's own
// mapping. Any lookup for someone ELSE's id (e.g. a teacher resolving a
// student's UUID, or vice versa) then fell through to the raw-UUID
// fallback in `uuidToLegacySync`/returned `null` from `legacyToUuid`,
// breaking cross-user id resolution for every non-admin session — the
// actual root cause behind a real bug where a teacher's own roster (and
// anything else keyed by another user's legacy id) came up empty even
// though the underlying data/RLS/assignment were all correct. Fixed by
// reading through the new `legacy_id_lookup()` RPC instead — a
// `SECURITY DEFINER` function (same "peek" pattern as
// `user_avatar_for_peek()`/`teacher_profile_for_peek()`) that returns
// `id`/`legacy_id` for every user with no row filter and no other columns.
// `legacy_id` is just an internal join key (no more sensitive than a UUID
// on its own — already broadcast this way for avatars via
// `user_avatar_for_peek()`), but that RPC also returns `avatar_url`, and in
// this project some of those are multi-megabyte base64 data URLs — calling
// it just to read two small columns would pull that entire payload on every
// bridge hydrate. `legacy_id_lookup()` returns only the two columns this
// file actually needs.
import { supabase } from "@/integrations/supabase/client";

let legacyToUuidMap = new Map<string, string>();
let uuidToLegacyMap = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase.rpc("legacy_id_lookup");
    if (error) {
      console.error("[user-id-bridge] failed to load app_users ids", error);
      hydratePromise = null;
      return;
    }
    const nextLegacy = new Map<string, string>();
    const nextUuid = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.legacy_id) {
        nextLegacy.set(row.legacy_id, row.id);
        nextUuid.set(row.id, row.legacy_id);
      }
    }
    legacyToUuidMap = nextLegacy;
    uuidToLegacyMap = nextUuid;
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
}

/** Resolves a legacy id ("u2") to the real `app_users.id` UUID. Returns
 *  `null` if no `app_users` row carries that `legacy_id`. */
export async function legacyToUuid(legacyId: string): Promise<string | null> {
  await hydrate();
  return legacyToUuidMap.get(legacyId) ?? null;
}

/** Resolves a real `app_users.id` UUID back to the legacy id, for display
 *  and for matching against `mock-data.ts`'s `USERS` and every store still
 *  keyed by the legacy id. Falls back to returning the UUID itself if no
 *  legacy id is on file (e.g. a future real user with no demo counterpart). */
export async function uuidToLegacy(uuid: string): Promise<string> {
  await hydrate();
  return uuidToLegacyMap.get(uuid) ?? uuid;
}

/** Synchronous best-effort lookup from the current in-memory cache, for
 *  mappers that can't await (e.g. row -> domain-object conversion inside a
 *  `.map()`). Only reliable once the cache is warm — call this after an
 *  `await legacyToUuid(...)`/`await uuidToLegacy(...)` (or
 *  `await hydrateUserIdBridge()`) elsewhere in the same flow. */
export function uuidToLegacySync(uuid: string): string {
  return uuidToLegacyMap.get(uuid) ?? uuid;
}

/** Warms the cache ahead of time. Safe to call redundantly. */
export function hydrateUserIdBridge(): Promise<void> {
  return hydrate();
}

/** Every legacy id currently backed by a real `app_users` row, straight from
 *  `legacy_id_lookup()` — the ONE source in this file that isn't limited by
 *  `app_users_select` RLS (no row filter, any caller role). Used to tell a
 *  real, deleted account apart from a mock/demo or not-yet-synced local one
 *  when pruning stale entries (see `hydrateStudents()` in students-store.ts).
 *  Only reliable once the cache is warm — call after `await
 *  hydrateUserIdBridge()` in the same flow, same rule as `uuidToLegacySync`. */
export function getKnownLegacyIds(): Set<string> {
  return new Set(legacyToUuidMap.keys());
}

/** Forces the next `legacyToUuid`/`uuidToLegacy`/`hydrateUserIdBridge` call to
 *  re-fetch from Supabase instead of serving the stale in-memory cache — call
 *  this right after creating a brand-new real account (e.g. via the
 *  `admin-create-user` Edge Function) so the newly-linked `legacy_id` is
 *  resolvable immediately instead of only after a full page reload. */
export function invalidateUserIdBridge(): void {
  hydrated = false;
}
