// Profile Badges catalog — admin-editable list of the badges shown on the
// student Dashboard (equipped badge next to the name) and inside the
// Profile modal (Equipped Badges + Achievements Gallery).
//
// Same declarative rule engine + persistence pattern as badges-store.ts
// (Challenge Badges), but with entirely separate storage keys and metrics.
// Do NOT merge this with badges-store.ts — those two systems are intentionally
// independent.

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
          if (block.length === 10 && block.every((u) => unitPassedByActivities(user.id, u.id))) done++;
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

/* ---------------- Seed ---------------- */

const METALS = ["Bronze", "Silver", "Gold", "Onyx"] as const;

const MEDAL_SEED: BadgeDef[] = METALS.flatMap((metal, i) => {
  const n = i + 1;
  const metric = `level${n}MissionsCompleted` as BadgeMetric;
  return [
    { id: `l${n}-m1`, name: `${metal} — Mission 1`, description: `Completed Mission 1 of Level ${n}.`, image: "", rule: { metric, threshold: 1 } },
    { id: `l${n}-m2`, name: `${metal} — Mission 2`, description: `Completed Mission 2 of Level ${n}.`, image: "", rule: { metric, threshold: 2 } },
    { id: `l${n}-m3`, name: `${metal} — Mission 3`, description: `Completed Mission 3 of Level ${n}.`, image: "", rule: { metric, threshold: 3 } },
    { id: `l${n}-complete`, name: `${metal} — Level Complete`, description: `Completed all 3 Missions of Level ${n}.`, image: "", rule: { metric, threshold: 3 } },
  ];
});

const BADGES_SEED: BadgeDef[] = [
  { id: "member",     name: "Verbo Member",       description: "Active for 3+ months.",                image: "", rule: { metric: "tenureMonths",          threshold: 3 } },
  { id: "veteran",    name: "Verbo Veteran",      description: "Active for 12+ months.",               image: "", rule: { metric: "tenureMonths",          threshold: 12 } },
  { id: "attendance", name: "Perfect Attendance", description: "95% attendance or higher.",            image: "", rule: { metric: "attendancePercentage",  threshold: 95 } },
  { id: "first",      name: "First Steps",        description: "Completed your first 10 units.",       image: "", rule: { metric: "unitsCompletedCount",   threshold: 10 } },
  { id: "explorer",   name: "Explorer",           description: "Completed 50 units.",                  image: "", rule: { metric: "unitsCompletedCount",   threshold: 50 } },
  { id: "master",     name: "Unit Master",        description: "Completed 150 units.",                 image: "", rule: { metric: "unitsCompletedCount",   threshold: 150 } },
  { id: "conqueror",  name: "Level Conqueror",    description: "Completed 100% of a level.",           image: "", rule: { metric: "levelsCompletedCount",  threshold: 1 } },
  { id: "legend",     name: "Level Legend",       description: "Completed 100% of 3 different levels.", image: "", rule: { metric: "levelsCompletedCount",  threshold: 3 } },
  { id: "streak-3",   name: "3-Day Flame",        description: "3 days in a row logging into Verbo Academy.",   image: "", rule: { metric: "loginStreakDays", threshold: 3 } },
  { id: "streak-10",  name: "10-Day Flame",       description: "10 days in a row logging into Verbo Academy.",  image: "", rule: { metric: "loginStreakDays", threshold: 10 } },
  { id: "streak-30",  name: "30-Day Flame",       description: "30 days in a row logging into Verbo Academy.",  image: "", rule: { metric: "loginStreakDays", threshold: 30 } },
  { id: "streak-60",  name: "60-Day Flame",       description: "60 days in a row logging into Verbo Academy.",  image: "", rule: { metric: "loginStreakDays", threshold: 60 } },
  { id: "streak-100", name: "100-Day Flame",      description: "100 days in a row logging into Verbo Academy.", image: "", rule: { metric: "loginStreakDays", threshold: 100 } },
  ...MEDAL_SEED,
];

/* ---------------- Persistence ---------------- */

export const BADGES_KEY = "verbo:profile-badges";
export const BADGES_EVENT = "verbo:profile-badges-updated";

function isValidBadge(b: unknown): b is BadgeDef {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.description === "string" &&
    typeof r.image === "string" &&
    !!r.rule &&
    typeof (r.rule as Record<string, unknown>).metric === "string"
  );
}

export function loadBadges(): BadgeDef[] {
  if (typeof window === "undefined") return BADGES_SEED.slice();
  try {
    const raw = localStorage.getItem(BADGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isValidBadge)) {
        return parsed as BadgeDef[];
      }
    }
  } catch { /* noop */ }
  return BADGES_SEED.slice();
}

export function persistBadges(list: BadgeDef[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BADGES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(BADGES_EVENT));
  } catch { /* noop */ }
}

export function subscribeBadges(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === BADGES_KEY) cb(); };
  window.addEventListener(BADGES_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(BADGES_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function newBadgeId(existing: BadgeDef[]): string {
  const taken = new Set(existing.map((b) => b.id));
  let i = existing.length + 1;
  while (taken.has(`pbadge-${i}`)) i++;
  return `pbadge-${i}`;
}
