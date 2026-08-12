// Per-student "equipped" CHALLENGE badges — the up-to-three Challenge Badges
// (src/lib/badges-store.ts) the student chose to showcase. Same pattern as
// equipped-profile-badges-store.ts, but with its own table: both catalogs
// reuse codes ("first", "explorer", "master"), so the two stores must never
// share storage.
//
// Backed by Supabase (`public.equipped_challenge_badges`). Reads are served
// from an in-memory cache (student legacy id -> ordered badge codes) kept in
// sync via Postgres Realtime, so `loadEquippedChallengeBadgeIds()` stays
// synchronous for existing call sites. `setEquippedChallengeBadgeIds()`
// updates the cache optimistically and does a full delete-then-insert replace
// for that student in the background (self-or-admin per RLS).
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import { legacyToUuid, uuidToLegacySync, hydrateUserIdBridge } from "./user-id-bridge";
import { badgeCodeToId } from "./badge-id-bridge";

const EVT = "verbo:equipped-challenge-badges-updated";

export const EQUIPPED_MAX = 3;

/** student legacy id -> equipped badge codes, in equip order (max 3). */
let cache = new Map<string, string[]>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("equipped_challenge_badges")
      .select("student_id, position, badge_defs(code)")
      .order("position");
    if (error) {
      console.error("[equipped-challenge-badges-store] failed to load equipped badges", error);
      hydratePromise = null;
      return;
    }
    const next = new Map<string, string[]>();
    for (const row of data ?? []) {
      const code = row.badge_defs?.code;
      if (!code) continue; // badge deleted concurrently
      const studentLegacyId = uuidToLegacySync(row.student_id);
      const list = next.get(studentLegacyId) ?? [];
      list.push(code); // rows arrive ordered by position
      next.set(studentLegacyId, list);
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
    .channel("equipped-challenge-badges-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "equipped_challenge_badges" },
      () => {
        hydrated = false;
        hydratePromise = null;
        void hydrate();
      },
    )
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

export function loadEquippedChallengeBadgeIds(studentId: string): string[] {
  const arr = cache.get(studentId);
  return Array.isArray(arr) ? arr.slice(0, EQUIPPED_MAX) : [];
}

export function setEquippedChallengeBadgeIds(studentId: string, ids: string[]): void {
  const clean = Array.from(new Set(ids.filter((s) => typeof s === "string"))).slice(
    0,
    EQUIPPED_MAX,
  );
  // Optimistic: update the cache + notify immediately, persist in background.
  cache.set(studentId, clean);
  notify();
  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) return; // no real account yet — nothing to persist to
    const rows: { student_id: string; badge_id: number; position: number }[] = [];
    for (let i = 0; i < clean.length; i++) {
      const badgeDbId = await badgeCodeToId("challenge", clean[i]);
      if (badgeDbId == null) {
        console.error("[equipped-challenge-badges-store] unknown badge code, skipping", clean[i]);
        continue;
      }
      rows.push({ student_id: studentUuid, badge_id: badgeDbId, position: i + 1 });
    }
    const { error: deleteError } = await supabase
      .from("equipped_challenge_badges")
      .delete()
      .eq("student_id", studentUuid);
    if (deleteError) {
      console.error(
        "[equipped-challenge-badges-store] failed to clear equipped badges",
        deleteError,
      );
      return;
    }
    if (rows.length === 0) return;
    const { error: insertError } = await supabase.from("equipped_challenge_badges").insert(rows);
    if (insertError) {
      console.error(
        "[equipped-challenge-badges-store] failed to save equipped badges",
        insertError,
      );
    }
  })();
}

export function subscribeEquippedChallengeBadges(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}
