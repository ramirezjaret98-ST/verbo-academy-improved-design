// Tracks which badges a student has already had their "unlock celebration"
// modal shown for automatically, so BadgeUnlockModal's full animation plays
// exactly once per badge.
//
// Backed by Supabase (`public.badge_unlock_seen`, append-only — SELECT/INSERT
// only per RLS, mirroring the original "never un-mark" semantics). Note that
// `badge_storage_id` is a freeform string (challenge-badge code, "lightning",
// a season id, a "profile-" prefixed code, ...), NOT a `badge_defs` key —
// several values have no catalog row at all, which is why the column is free
// text. Reads are served from an in-memory cache (student legacy id -> Set of
// storage ids) kept fresh via Postgres Realtime, so all public functions stay
// synchronous for existing call sites. `markBadgeUnlockSeen()` decides its
// return value against the current cache, updates it optimistically, then
// inserts in the background.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import { legacyToUuid, uuidToLegacySync, hydrateUserIdBridge } from "./user-id-bridge";

export const BADGE_UNLOCK_SEEN_EVENT = "verbo:badge-unlock-seen-updated";

/** student legacy id -> badgeStorageIds already celebrated. */
let cache = new Map<string, Set<string>>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BADGE_UNLOCK_SEEN_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("badge_unlock_seen")
      .select("student_id, badge_storage_id");
    if (error) {
      console.error("[badge-unlock-seen-store] failed to load badge_unlock_seen", error);
      hydratePromise = null;
      return;
    }
    const next = new Map<string, Set<string>>();
    for (const row of data ?? []) {
      const studentLegacyId = uuidToLegacySync(row.student_id);
      const set = next.get(studentLegacyId) ?? new Set<string>();
      set.add(row.badge_storage_id);
      next.set(studentLegacyId, set);
    }
    cache = next;
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate();
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("badge-unlock-seen-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_unlock_seen" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

export function loadBadgeUnlockSeen(studentId: string): string[] {
  if (!studentId) return [];
  return Array.from(cache.get(studentId) ?? []);
}

export function hasSeenBadgeUnlock(studentId: string, badgeStorageId: string): boolean {
  return cache.get(studentId)?.has(badgeStorageId) ?? false;
}

/** Marks the badge as seen. Returns true when this call was the first time. */
export function markBadgeUnlockSeen(studentId: string, badgeStorageId: string): boolean {
  if (typeof window === "undefined" || !studentId || !badgeStorageId) return false;
  const seen = cache.get(studentId) ?? new Set<string>();
  if (seen.has(badgeStorageId)) return false;
  // Optimistic: update the cache + notify immediately, persist in background.
  seen.add(badgeStorageId);
  cache.set(studentId, seen);
  notify();
  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) return; // no real account on file — nothing to persist to
    // Plain insert (NOT upsert): a duplicate-key conflict here is an expected
    // benign race (two tabs/devices marking the same badge before Realtime
    // syncs them), and the append-only RLS has no UPDATE policy anyway. We
    // just swallow unique violations (23505) and log anything else.
    const { error } = await supabase
      .from("badge_unlock_seen")
      .insert({ student_id: studentUuid, badge_storage_id: badgeStorageId });
    if (error && error.code !== "23505") {
      console.error("[badge-unlock-seen-store] failed to persist badge unlock seen", error);
    }
  })();
  return true;
}
