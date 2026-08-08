// Manual badge overrides — an append-only event log (same pattern as the unit
// access override log in activities-store.ts). Admins can grant a badge that a
// student hasn't earned by rule, or return it to automatic evaluation.
// The most recent event for a (studentId, badgeId, system) triple wins.
//
// Backed by Supabase (`public.badge_override_log`). Reads are served from an
// in-memory cache of the LATEST action per (student, badge, system) triple,
// kept in sync via Postgres Realtime, so `getBadgeOverride()` /
// `isBadgeManuallyGranted()` stay synchronous for the render-time call sites.
// RLS scopes what each caller can see (own rows for students, their students'
// rows for teachers, everything for admins), so a plain hydrate-once +
// Realtime pattern is enough here. `setBadgeOverride()` writes optimistically
// to the cache and inserts the row in the background (admin-only per RLS).
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid, uuidToLegacySync, hydrateUserIdBridge } from "./user-id-bridge";
import { badgeCodeToId } from "./badge-id-bridge";

export type BadgeSystem = "profile" | "challenge";
export type BadgeOverrideAction = "granted" | "revoked";

export const BADGE_OVERRIDE_EVENT = "verbo:badge-override-updated";

function overrideKey(studentId: string, badgeId: string, system: BadgeSystem): string {
  return `${studentId}:${badgeId}:${system}`;
}

/** Latest action per (studentLegacyId, badgeCode, system) triple. */
let cache = new Map<string, BadgeOverrideAction>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BADGE_OVERRIDE_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("badge_override_log")
      .select("student_id, action, at, badge_defs(code, system)")
      .order("at", { ascending: true });
    if (error) {
      console.error("[badge-override-store] failed to load badge_override_log", error);
      hydratePromise = null;
      return;
    }
    const next = new Map<string, BadgeOverrideAction>();
    for (const row of data ?? []) {
      const def = row.badge_defs;
      if (!def) continue; // badge deleted concurrently
      const studentLegacyId = uuidToLegacySync(row.student_id);
      // Rows are ordered ascending by `at`, so the last write per key is the
      // latest action — no reverse iteration needed.
      next.set(
        overrideKey(studentLegacyId, def.code, def.system as BadgeSystem),
        row.action as BadgeOverrideAction,
      );
    }
    cache = next;
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("badge-override-log-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_override_log" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly — `isBadgeManuallyGranted()` is called
  // synchronously inside render logic, so the cache needs to be warm as
  // early as possible.
  void hydrate();
  ensureRealtime();
}

export function setBadgeOverride(
  studentId: string,
  badgeId: string,
  system: BadgeSystem,
  action: BadgeOverrideAction,
  actorId: string,
): void {
  // Optimistic: update the cache + notify immediately, persist in background.
  cache.set(overrideKey(studentId, badgeId, system), action);
  notify();
  void (async () => {
    const [studentUuid, actorUuid, badgeDbId] = await Promise.all([
      legacyToUuid(studentId),
      legacyToUuid(actorId),
      badgeCodeToId(system, badgeId),
    ]);
    if (!studentUuid || !actorUuid || badgeDbId == null) {
      console.error("[badge-override-store] cannot persist override — unresolved ids", {
        studentId,
        badgeId,
        system,
        actorId,
        studentUuid,
        actorUuid,
        badgeDbId,
      });
      return;
    }
    const { error } = await supabase.from("badge_override_log").insert({
      student_id: studentUuid,
      badge_id: badgeDbId,
      system,
      action,
      actor_id: actorUuid,
      actor_role: "admin",
    });
    if (error) {
      console.error("[badge-override-store] failed to persist badge override", error);
    }
  })();
}

export function getBadgeOverride(
  studentId: string,
  badgeId: string,
  system: BadgeSystem,
): BadgeOverrideAction | null {
  return cache.get(overrideKey(studentId, badgeId, system)) ?? null;
}

export function isBadgeManuallyGranted(
  studentId: string,
  badgeId: string,
  system: BadgeSystem,
): boolean {
  return getBadgeOverride(studentId, badgeId, system) === "granted";
}

export function subscribeBadgeOverrides(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}
