// Shared bridge between the string badge codes ("first", "streak-30", …)
// that the frontend uses as `BadgeDef.id`, and the real Supabase
// `badge_defs.id` bigints that DB-backed tables use as foreign keys
// (`equipped_profile_badges`, `equipped_challenge_badges`,
// `badge_override_log`).
//
// Badge codes are only unique per system — the Profile and Challenge
// catalogs are independent and reuse ids ("first", "explorer", "master") —
// so lookups are keyed by the compound `(system, code)` pair. Same caching
// pattern as user-id-bridge.ts.
import { supabase } from "@/integrations/supabase/client";

export type BadgeSystem = "profile" | "challenge";

let codeToIdMap = new Map<string, number>(); // key: `${system}:${code}`
let idToCodeMap = new Map<number, { system: BadgeSystem; code: string }>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function key(system: BadgeSystem, code: string): string {
  return `${system}:${code}`;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase.from("badge_defs").select("id, system, code");
    if (error) {
      console.error("[badge-id-bridge] failed to load badge_defs ids", error);
      hydratePromise = null;
      return;
    }
    const nextCodeToId = new Map<string, number>();
    const nextIdToCode = new Map<number, { system: BadgeSystem; code: string }>();
    for (const row of data ?? []) {
      const system = row.system as BadgeSystem;
      nextCodeToId.set(key(system, row.code), row.id);
      nextIdToCode.set(row.id, { system, code: row.code });
    }
    codeToIdMap = nextCodeToId;
    idToCodeMap = nextIdToCode;
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
}

/** Resolves a (system, code) pair to the real `badge_defs.id` bigint. Returns
 *  `null` if no row matches (e.g. a stale/renamed code). */
export async function badgeCodeToId(system: BadgeSystem, code: string): Promise<number | null> {
  await hydrate();
  return codeToIdMap.get(key(system, code)) ?? null;
}

/** Synchronous best-effort lookup — only reliable after an
 *  `await badgeCodeToId(...)` or `await hydrateBadgeIdBridge()` elsewhere in
 *  the same flow (same caveat as `uuidToLegacySync` in user-id-bridge.ts). */
export function badgeCodeToIdSync(system: BadgeSystem, code: string): number | null {
  return codeToIdMap.get(key(system, code)) ?? null;
}

/** Resolves a real `badge_defs.id` back to its `{ system, code }`. */
export async function badgeIdToCode(
  id: number,
): Promise<{ system: BadgeSystem; code: string } | null> {
  await hydrate();
  return idToCodeMap.get(id) ?? null;
}

export function badgeIdToCodeSync(id: number): { system: BadgeSystem; code: string } | null {
  return idToCodeMap.get(id) ?? null;
}

/** Warms the cache ahead of time. Safe to call redundantly. */
export function hydrateBadgeIdBridge(): Promise<void> {
  return hydrate();
}

/** Forces the next lookup to re-fetch — call after inserting/updating rows in
 *  `badge_defs` (e.g. from the admin badge editor) so newly added/renamed
 *  badges resolve without a full page reload. */
export function invalidateBadgeIdBridge(): void {
  hydrated = false;
}
