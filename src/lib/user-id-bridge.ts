// Shared bridge between the legacy short ids ("u1".."u8") that most of the
// frontend still uses as `User.id` (see `mock-data.ts`/`auth.tsx`), and the
// real Supabase `app_users.id` UUIDs that DB-backed tables use as foreign
// keys (`app_users.legacy_id` is the column that links the two).
//
// Any store migrating a `student_id`/`teacher_id`/`admin_id` uuid column
// should use this instead of inventing its own lookup, so every store stays
// consistent and the mapping is only fetched/cached once.
import { supabase } from "@/integrations/supabase/client";

let legacyToUuidMap = new Map<string, string>();
let uuidToLegacyMap = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase.from("app_users").select("id, legacy_id");
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

/** Forces the next `legacyToUuid`/`uuidToLegacy`/`hydrateUserIdBridge` call to
 *  re-fetch from Supabase instead of serving the stale in-memory cache — call
 *  this right after creating a brand-new real account (e.g. via the
 *  `admin-create-user` Edge Function) so the newly-linked `legacy_id` is
 *  resolvable immediately instead of only after a full page reload. */
export function invalidateUserIdBridge(): void {
  hydrated = false;
}
