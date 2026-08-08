// Profile Badges catalog — admin-editable list of the badges shown on the
// student Dashboard (equipped badge next to the name) and inside the
// Profile modal (Equipped Badges + Achievements Gallery).
//
// Same declarative rule engine + persistence pattern as badges-store.ts
// (Challenge Badges), but with entirely separate metrics and rows.
// Do NOT merge this with badges-store.ts — those two systems are intentionally
// independent.
//
// Backed by Supabase (`public.badge_defs`, filtered to `system = 'profile'` —
// that table is shared with Challenge Badges, distinguished by that column).
// Reads are served from an in-memory cache kept in sync via Postgres
// Realtime, so `loadBadges()`/`useBadges()` stay synchronous for existing
// call sites. Writes (`addBadge`/`updateBadge`/`deleteBadge`) talk to
// Supabase directly and are therefore async.

import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { invalidateBadgeIdBridge } from "./badge-id-bridge";
import type { User } from "./mock-data";
import { unitPassed, unitPassedByActivities, levelIsComplete } from "./activities-store";
import { loadCourses } from "./product-courses-store";
import { currentLoginStreak } from "./login-streak-store";

export type BadgeMetric =
  | "tenureMonths"
  | "attendancePercentage"
  | "unitsCompletedCount"
  | "levelsCompletedCount"
  | "loginStreakDays"
  | "level1MissionsCompleted"
  | "level2MissionsCompleted"
  | "level3MissionsCompleted"
  | "level4MissionsCompleted";

export const BADGE_METRIC_META: Record<
  BadgeMetric,
  { label: string; numeric: boolean; hint: string }
> = {
  tenureMonths: {
    label: "Months active",
    numeric: true,
    hint: "Number of full months since the student joined Verbo.",
  },
  attendancePercentage: {
    label: "Attendance percentage",
    numeric: true,
    hint: "The student's overall attendance percentage (0–100).",
  },
  unitsCompletedCount: {
    label: "Units completed",
    numeric: true,
    hint: "Number of Learning Path units the student has completed.",
  },
  levelsCompletedCount: {
    label: "Levels completed",
    numeric: true,
    hint: "Number of contracted levels the student has finished 100%.",
  },
  loginStreakDays: {
    label: "Login streak (days)",
    numeric: true,
    hint: "Consecutive calendar days the student has opened Verbo Academy.",
  },
  level1MissionsCompleted: {
    label: "Level 1 missions completed",
    numeric: true,
    hint: "Number of Mission blocks (of 3) fully completed with real activities in the student's Level 1, regardless of product.",
  },
  level2MissionsCompleted: {
    label: "Level 2 missions completed",
    numeric: true,
    hint: "Number of Mission blocks (of 3) fully completed with real activities in the student's Level 2, regardless of product.",
  },
  level3MissionsCompleted: {
    label: "Level 3 missions completed",
    numeric: true,
    hint: "Number of Mission blocks (of 3) fully completed with real activities in the student's Level 3, regardless of product.",
  },
  level4MissionsCompleted: {
    label: "Level 4 missions completed",
    numeric: true,
    hint: "Number of Mission blocks (of 3) fully completed with real activities in the student's Level 4, regardless of product.",
  },
};

export interface BadgeRule {
  metric: BadgeMetric;
  /** Required for numeric metrics; ignored for boolean metrics. */
  threshold?: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  /** Data URL of the badge image (GIF/PNG/JPG/WebP). Empty = not yet configured. */
  image: string;
  rule: BadgeRule;
}

export interface BadgeContext {
  tenureMonths: number;
  attendancePercentage: number;
  unitsCompletedCount: number;
  levelsCompletedCount: number;
  loginStreakDays: number;
  level1MissionsCompleted: number;
  level2MissionsCompleted: number;
  level3MissionsCompleted: number;
  level4MissionsCompleted: number;
}

export function isBadgeEarned(badge: BadgeDef, ctx: BadgeContext): boolean {
  const { metric, threshold } = badge.rule;
  const value = ctx[metric] as number;
  const t = typeof threshold === "number" ? threshold : 1;
  return value >= t;
}

/* ---------------- Context builder ---------------- */

function monthsBetween(fromISO: string | undefined, now: Date): number {
  if (!fromISO) return 0;
  const from = new Date(fromISO);
  if (Number.isNaN(+from)) return 0;
  const years = now.getFullYear() - from.getFullYear();
  const months = now.getMonth() - from.getMonth();
  const dayAdj = now.getDate() >= from.getDate() ? 0 : -1;
  return Math.max(0, years * 12 + months + dayAdj);
}

/**
 * Compute the numeric metrics for a real student user. Falls back to 0 for
 * every value that does not apply (e.g. VIP students without a Learning Path,
 * or a product not present in the ProductCourse catalog).
 */
export function buildProfileBadgeContext(user: User): BadgeContext {
  const tenureMonths = monthsBetween(user.member_since, new Date());
  const attendancePercentage = Math.max(0, Math.min(100, user.attendance_percentage ?? 0));
  const loginStreakDays = currentLoginStreak(user.id) ?? 0;

  let unitsCompletedCount = 0;
  let levelsCompletedCount = 0;
  /** Missions completed per level index (0 = Level 1 … 3 = Level 4). */
  const missions = [0, 0, 0, 0];

  const product = user.product;
  if (product && product !== "vip") {
    const catalog = loadCourses();
    const course = catalog.find((c) => c.product === product);
    if (course) {
      for (const level of course.levels) {
        for (const u of level.units) {
          if (unitPassed(user.id, u.id)) unitsCompletedCount++;
        }
      }
      const contracted = new Set(user.contracted_levels ?? []);
      for (const level of course.levels) {
        if (contracted.size > 0 && !contracted.has(level.name)) continue;
        if (levelIsComplete(level, user.id)) levelsCompletedCount++;
      }
      // Mission blocks: units [0-9], [10-19], [20-29] — same split as UnitsView.
      course.levels.slice(0, 4).forEach((level, li) => {
        if (contracted.size > 0 && !contracted.has(level.name)) return;
        let done = 0;
        for (let m = 0; m < 3; m++) {
          const block = level.units.slice(m * 10, m * 10 + 10);
          if (block.length === 10 && block.every((u) => unitPassedByActivities(user.id, u.id)))
            done++;
        }
        missions[li] = done;
      });
    }
  }

  return {
    tenureMonths,
    attendancePercentage,
    unitsCompletedCount,
    levelsCompletedCount,
    loginStreakDays,
    level1MissionsCompleted: missions[0],
    level2MissionsCompleted: missions[1],
    level3MissionsCompleted: missions[2],
    level4MissionsCompleted: missions[3],
  };
}

/* ---------------- Supabase-backed store ---------------- */

export const PROFILE_BADGES_EVENT = "verbo:profile-badges-updated";
/** Back-compat alias — some consumers (e.g. notifications-store.ts) import
 *  the old unprefixed name. */
export const BADGES_EVENT = PROFILE_BADGES_EVENT;

type BadgeRow = Database["public"]["Tables"]["badge_defs"]["Row"];

function fromRow(row: BadgeRow): BadgeDef {
  const metric = row.metric as BadgeMetric;
  return {
    id: row.code,
    name: row.name,
    description: row.description ?? "",
    image: row.image_url ?? "",
    rule: { metric, threshold: row.threshold != null ? Number(row.threshold) : undefined },
  };
}

let cache: BadgeDef[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_BADGES_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase
      .from("badge_defs")
      .select("*")
      .eq("system", "profile")
      .order("id");
    if (error) {
      console.error("[profile-badges-store] failed to load profile badges", error);
      hydratePromise = null;
      return;
    }
    cache = (data ?? []).map(fromRow);
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
    .channel("badge-defs-profile-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "badge_defs" }, () => {
      hydrated = false;
      hydratePromise = null;
      invalidateBadgeIdBridge();
      void hydrate();
    })
    .subscribe();
}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly so plain (non-hook) readers like
  // `loadBadges()` have data available as soon as possible, without
  // requiring a component to mount `useBadges()` first.
  void hydrate();
  ensureRealtime();
}

/** Synchronous snapshot of the current in-memory cache. May be empty
 * (or stale) until the initial Supabase fetch resolves. */
export function loadBadges(): BadgeDef[] {
  return cache;
}

function getSnapshot(): BadgeDef[] {
  return cache;
}

export async function addBadge(badge: BadgeDef): Promise<BadgeDef> {
  const { data, error } = await supabase
    .from("badge_defs")
    .insert({
      system: "profile",
      code: badge.id,
      name: badge.name,
      description: badge.description,
      image_url: badge.image,
      metric: badge.rule.metric,
      threshold: badge.rule.threshold ?? null,
    })
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error("Failed to add badge");
  }
  const created = fromRow(data);
  cache = [...cache, created];
  invalidateBadgeIdBridge();
  notify();
  return created;
}

export async function updateBadge(badge: BadgeDef): Promise<BadgeDef> {
  const { data, error } = await supabase
    .from("badge_defs")
    .update({
      name: badge.name,
      description: badge.description,
      image_url: badge.image,
      metric: badge.rule.metric,
      threshold: badge.rule.threshold ?? null,
    })
    .eq("system", "profile")
    .eq("code", badge.id)
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error("Failed to update badge");
  }
  const updated = fromRow(data);
  cache = cache.map((b) => (b.id === updated.id ? updated : b));
  notify();
  return updated;
}

export async function deleteBadge(id: string): Promise<void> {
  const { error } = await supabase
    .from("badge_defs")
    .delete()
    .eq("system", "profile")
    .eq("code", id);
  if (error) {
    throw error;
  }
  cache = cache.filter((b) => b.id !== id);
  invalidateBadgeIdBridge();
  notify();
}

export function subscribeBadges(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

export function useBadges(): BadgeDef[] {
  return useSyncExternalStore(subscribeBadges, getSnapshot, () => []);
}

/** Pure helper: pick a fresh `pbadge-N` id that isn't already taken. Used by
 *  the admin modal to preview/assign an id for a brand-new badge before it's
 *  saved — the actual insert uses this as `code`. */
export function newBadgeId(existing: BadgeDef[]): string {
  const taken = new Set(existing.map((b) => b.id));
  let i = existing.length + 1;
  while (taken.has(`pbadge-${i}`)) i++;
  return `pbadge-${i}`;
}
