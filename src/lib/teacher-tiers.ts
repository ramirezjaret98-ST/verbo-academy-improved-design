// ============================================================================
// Teacher tiers — single source of truth for automatic hourly rate progression.
//
// The tier clock anchors to trackingStartKey() (first full calendar month
// after hire), matching the KPI/bonus tracking window. Every 365 active days
// (calendar days minus days paused by "frozen" status) the teacher advances
// one tier, capped at Signature.
//
// The manual `hourly_rate` override on the User always wins over the tier's
// default rate — see effectiveHourlyRate().
// ============================================================================
import { USERS, type User } from "./mock-data";
import { trackingStartKey } from "./teacher-kpi-history-store";
import { teacherStatus } from "./teacher-model";

export interface TeacherTier {
  id: 1 | 2 | 3 | 4;
  name: "Rising" | "Established" | "Distinguished" | "Signature";
  /** MXN per hour. */
  rate: number;
}

export const TEACHER_TIERS: TeacherTier[] = [
  { id: 1, name: "Rising",        rate: 120 },
  { id: 2, name: "Established",   rate: 130 },
  { id: 3, name: "Distinguished", rate: 140 },
  { id: 4, name: "Signature",     rate: 150 },
];

const MS_PER_DAY = 86_400_000;
const DAYS_PER_TIER = 365;

/** First day of the "YYYY-MM" month. */
function firstOfMonthKey(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

/** Anchor date for the tier clock: max(trackingStart, tier_reset_at). */
export function tierClockStart(t: User): Date {
  const trackStart = firstOfMonthKey(trackingStartKey(t));
  const reset = t.tier_reset_at ? new Date(t.tier_reset_at) : null;
  if (reset && !isNaN(reset.getTime()) && reset.getTime() > trackStart.getTime()) {
    return reset;
  }
  return trackStart;
}

/** Total days the tier clock has been paused (past freezes + current freeze). */
export function pausedDays(t: User): number {
  const past = t.tier_frozen_days ?? 0;
  if (teacherStatus(t) === "frozen" && t.tier_frozen_since) {
    const since = new Date(t.tier_frozen_since);
    if (!isNaN(since.getTime())) {
      const ongoing = Math.max(0, Math.floor((Date.now() - since.getTime()) / MS_PER_DAY));
      return past + ongoing;
    }
  }
  return past;
}

/** Calendar days since the anchor minus paused days, never negative. */
export function activeTenureDays(t: User): number {
  const start = tierClockStart(t);
  const calendarDays = Math.floor((Date.now() - start.getTime()) / MS_PER_DAY);
  return Math.max(0, calendarDays - pausedDays(t));
}

/** Current tier object for the teacher. Capped at Signature (id 4). */
export function teacherTier(t: User): TeacherTier {
  const idx = Math.min(TEACHER_TIERS.length - 1, Math.max(0, Math.floor(activeTenureDays(t) / DAYS_PER_TIER)));
  return TEACHER_TIERS[idx];
}

/**
 * Effective hourly rate: manual override wins if set, otherwise the tier's
 * default rate. Replaces the old `t.hourly_rate ?? DEFAULT_HOURLY_RATE`
 * fallback everywhere the app displays or computes teacher pay.
 */
export function effectiveHourlyRate(t: User): number {
  return typeof t.hourly_rate === "number" ? t.hourly_rate : teacherTier(t).rate;
}

export function appendTeacherAdjustment(teacherId: string, amount: number, reason: string) {
  const teacher = USERS.find((u) => u.id === teacherId);
  if (!teacher) return;
  const adj = { id: "adj" + Date.now(), date: new Date().toISOString(), amount, reason };
  teacher.adjustments = [...(teacher.adjustments ?? []), adj];
  try {
    const raw = localStorage.getItem("verbo:teacher-profile-overrides");
    const overrides: Record<string, Partial<User>> = raw ? JSON.parse(raw) : {};
    const rest = { ...teacher };
    delete (rest as Partial<User>).id;
    delete (rest as Partial<User>).role;
    overrides[teacher.id] = rest;
    localStorage.setItem("verbo:teacher-profile-overrides", JSON.stringify(overrides));
  } catch { /* noop */ }
}
