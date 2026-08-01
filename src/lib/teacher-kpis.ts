// ============================================================================
// Teacher KPI model — single source of truth for the Admin > KPIs page and the
// "Bonus Eligible" flag consumed by the Financial tab in Admin > Teachers.
//
// Where real signals exist (student ratings, session statuses + absent cause)
// we compute from them. The punctuality signals (connection / planning /
// report) are not yet captured end-to-end, so they fall back to deterministic
// mock values seeded per-teacher (stable across renders). Everything is on a
// 0–100 scale unless noted.
// ============================================================================
import { type User } from "./mock-data";
import { loadSessions } from "./sessions-store";
import { avgRating } from "./teacher-model";
import { activeStrikeCount } from "./strikes-store";
import {
  bonusStatus,
  isOnboardingMonth,
  monthKeyOf,
  ONBOARDING_COMPOSITE,
  penaltyStateAt,
  type BonusStatus,
} from "./teacher-kpi-history-store";

// Re-export the threshold helpers so existing imports from teacher-kpis keep
// working after the extraction. New code should import them directly from
// ./teacher-kpis-threshold.
export {
  BONUS_THRESHOLD_KEY,
  BONUS_THRESHOLD_DEFAULT,
  getBonusThreshold,
  setBonusThreshold,
} from "./teacher-kpis-threshold";
import { getBonusThreshold } from "./teacher-kpis-threshold";
import { overridesForMonth, type KpiMetric } from "./teacher-kpi-overrides-store";

// ----- Deterministic pseudo-random helpers ----------------------------------
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pctInRange(r: number, min: number, max: number): number {
  return Math.round(min + (max - min) * r);
}

// ----- Rating bands ---------------------------------------------------------
export interface RatingBand {
  label: string;
  fg: string; // text color
  bg: string; // chip background
  dot: string; // accent color (chart line, ring)
}

export function ratingBand(rating: number | null): RatingBand {
  if (rating == null) return { label: "Sin datos", fg: "#64748b", bg: "#f1f5f9", dot: "#94a3b8" };
  if (rating >= 4.5) return { label: "Excelencia", fg: "#065f46", bg: "#d1fae5", dot: "#047857" };
  if (rating >= 4.0) return { label: "Muy bueno", fg: "#15803d", bg: "#dcfce7", dot: "#22c55e" };
  if (rating >= 3.5) return { label: "Bueno", fg: "#4d7c0f", bg: "#ecfccb", dot: "#84cc16" };
  if (rating >= 2.5) return { label: "Regular", fg: "#b45309", bg: "#fef3c7", dot: "#f59e0b" };
  return { label: "Critical", fg: "#dc2626", bg: "#fee2e2", dot: "#ef4444" };
}

// ----- Session-derived KPIs (real signals) ----------------------------------
function teacherSessions(teacherId: string) {
  return loadSessions().filter((s) => s.teacher_id === teacherId);
}

// Denominator used by session-completion calcs. Same rules as before:
// EXCLUDE "no_show" and "absent (student)"; INCLUDE "absent (teacher)".
// Future scheduled sessions are excluded.
function completionDenominator(teacherId: string) {
  const now = Date.now();
  const mine = teacherSessions(teacherId).filter((s) => new Date(s.date_time).getTime() <= now);
  return mine.filter((s) => {
    if (s.status === "no_show") return false;
    if (s.status === "absent" && (s.absent_cause ?? "student") === "student") return false;
    return true;
  });
}

// Legacy raw completion % — still exported for callers that only need
// completed / denom without the report-punctuality weighting.
export function sessionCompletionRate(teacherId: string): number | null {
  const denom = completionDenominator(teacherId);
  if (denom.length === 0) return null;
  const completed = denom.filter((s) => s.status === "completed").length;
  return Math.round((completed / denom.length) * 100);
}

// Fused "Session completion rate" — merges the old "Report punctuality" signal.
// Per session in the denominator: 1.0 credit if completed AND report on-time,
// 0.7 if completed but report late, 0 if not completed. We don't yet have
// per-session report timestamps, so we use the teacher-level report_punctuality
// as the on-time share proxy (default 100 when missing).
function sessionCompletionCredit(
  teacherId: string,
  reportPunctuality: number,
  fallback: number,
): number {
  const denom = completionDenominator(teacherId);
  if (denom.length === 0) return fallback;
  const completedRatio = denom.filter((s) => s.status === "completed").length / denom.length;
  const onTimeShare = Math.max(0, Math.min(1, reportPunctuality / 100));
  const creditPerCompleted = onTimeShare * 1.0 + (1 - onTimeShare) * 0.7;
  return Math.round(completedRatio * creditPerCompleted * 100);
}

// % of the teacher's sessions marked "Absent" with cause "Teacher".
export function teacherCausedAbsenceRate(teacherId: string): number {
  const mine = teacherSessions(teacherId);
  if (mine.length === 0) return 0;
  const teacherAbsent = mine.filter(
    (s) => s.status === "absent" && s.absent_cause === "teacher",
  ).length;
  return Math.round((teacherAbsent / mine.length) * 100);
}

// ----- Composite KPI bundle -------------------------------------------------
export interface TeacherKpis {
  rating: number | null;
  ratingNormalized: number; // rating/5*100 (0 when no rating)
  connectionPunctuality: number;
  planningPunctuality: number;
  /** Fused signal: completion weighted by on-time-report share. */
  completionRate: number;
  teacherAbsenceRate: number;
  cancellationScore: number;   // 0..100 — (3 - active strikes) / 3 * 100
  activeStrikes: number;       // raw count, last 6 months, unjustified
  /** Sequential Reschedule/Substitute penalty state for THIS month. */
  penaltyState: number;
  /** Informational metric = 100 - penaltyState (100 during Onboarding). */
  responsiveness: number;
  /** 5-factor avg BEFORE penalty (informational). */
  baseComposite: number;
  /** Final composite: baseComposite − penaltyState, floored at 0.
   *  During the Onboarding month it is locked at 90. */
  composite: number;
  onboarding: boolean;
  bonusEligible: boolean;
  bonusStatus: BonusStatus;
}

export function computeTeacherKpis(t: User, threshold = getBonusThreshold()): TeacherKpis {
  const rng = mulberry32(hashSeed(t.id));
  const rating = avgRating(t);
  const ratingNormalizedRaw = rating != null ? Math.round((rating / 5) * 100) : 0;

  // Higher-rated teachers skew slightly more punctual — keeps mock coherent.
  const bias = rating != null ? (rating - 4) * 6 : 0;
  const clamp = (n: number) => Math.max(40, Math.min(100, n));

  const connectionPunctualityRaw = clamp(pctInRange(rng(), 72, 99) + bias);
  const planningPunctualityRaw =
    typeof t.plan_punctuality === "number" ? t.plan_punctuality : clamp(pctInRange(rng(), 70, 98) + bias);
  const reportPunctualityProxy =
    typeof t.report_punctuality === "number" ? t.report_punctuality : clamp(pctInRange(rng(), 68, 97) + bias);

  const completionFallback = clamp(pctInRange(rng(), 75, 99) + bias);
  const completionRateRaw = sessionCompletionCredit(t.id, reportPunctualityProxy, completionFallback);
  const teacherAbsenceRate = teacherCausedAbsenceRate(t.id);
  const strikes = activeStrikeCount(t.id);
  const cancellationScoreRaw = Math.max(0, Math.round(((3 - Math.min(3, strikes)) / 3) * 100));

  // ---- Manual overrides for the CURRENT month --------------------------
  // Any admin-approved retroactive correction on a sub-metric replaces the
  // raw value BEFORE the composite is averaged. A composite override is
  // applied at the very end (below).
  const nowKey = monthKeyOf(new Date());
  const monthOverrides = overridesForMonth(t.id, nowKey);
  const pick = (metric: KpiMetric, raw: number): number => {
    const o = monthOverrides[metric];
    return o ? o.new_value : raw;
  };

  // During the Onboarding month, each individual bar is frozen at the same
  // baseline as the composite (ONBOARDING_COMPOSITE = 90) so a brand-new
  // teacher isn't unfairly penalised by noisy raw signals. Manual admin
  // overrides still win via pick() — same priority order as the composite.
  const onboarding = isOnboardingMonth(t, nowKey);
  const onbBase = (raw: number) => (onboarding ? ONBOARDING_COMPOSITE : raw);

  const connectionPunctuality = pick("connectionPunctuality", onbBase(connectionPunctualityRaw));
  const planningPunctuality = pick("planningPunctuality", onbBase(planningPunctualityRaw));
  const completionRate = pick("completionRate", onbBase(completionRateRaw));
  const ratingNormalized = pick("ratingNormalized", onbBase(ratingNormalizedRaw));
  const cancellationScore = pick("cancellationScore", onbBase(cancellationScoreRaw));

  // Base composite = avg of the 5 real signals (no more Report punctuality row).
  const baseComposite = Math.round(
    (connectionPunctuality + planningPunctuality + completionRate + ratingNormalized + cancellationScore) / 5,
  );

  // Onboarding month → composite locked at 90, penalty is 0.
  const penaltyStateComputed = onboarding ? 0 : penaltyStateAt(t, nowKey);
  const responsivenessRaw = Math.max(0, 100 - penaltyStateComputed);
  const responsiveness = pick("responsiveness", responsivenessRaw);
  const penaltyState = onboarding ? 0 : Math.max(0, 100 - responsiveness);

  const compositeComputed = onboarding
    ? ONBOARDING_COMPOSITE
    : Math.max(0, baseComposite - penaltyState);
  const composite = pick("composite", compositeComputed);

  // Bonus eligibility is a 6-month streak on the FINAL composite (with penalty
  // already applied and onboarding baseline honoured by the history store).
  let status = bonusStatus(t, composite, threshold);
  // Super-admin may manually override the streak count (0–6) for the current
  // month, e.g. to unblock a bonus after an unfair signal is corrected.
  const streakOverride = monthOverrides.bonusStreak;
  if (streakOverride) {
    const s = Math.max(0, Math.min(6, Math.round(streakOverride.new_value)));
    status = s >= 6
      ? { kind: "eligible", streak: 6, threshold }
      : { kind: "streak", streak: s, needed: 6, threshold };
  }

  return {
    rating,
    ratingNormalized,
    connectionPunctuality,
    planningPunctuality,
    completionRate,
    teacherAbsenceRate,
    cancellationScore,
    activeStrikes: strikes,
    penaltyState,
    responsiveness,
    baseComposite,
    composite,
    onboarding,
    bonusEligible: status.kind === "eligible",
    bonusStatus: status,
  };
}


export function isBonusEligible(t: User, threshold = getBonusThreshold()): boolean {
  return computeTeacherKpis(t, threshold).bonusEligible;
}



// ----- Monthly rating history (mock, last 6 months) -------------------------
export interface RatingPoint {
  month: string;
  rating: number;
}

export function ratingHistory(t: User, months = 6): RatingPoint[] {
  const rng = mulberry32(hashSeed(t.id + ":history"));
  const target = avgRating(t) ?? 4.2;
  const now = new Date();
  const out: RatingPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    // Earlier months drift below target; latest month lands on the real avg.
    const drift = i === 0 ? 0 : (rng() - 0.5) * 0.9 - i * 0.06;
    const value = Math.max(1, Math.min(5, target + drift));
    out.push({
      month: d.toLocaleDateString("en-US", { month: "short" }),
      rating: Math.round(value * 10) / 10,
    });
  }
  return out;
}
