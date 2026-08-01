// ============================================================================
// Teacher KPI monthly history — single source of truth for the "6-month bonus
// streak", the sequential Reschedule/Substitute penalty state, and the
// onboarding baseline for freshly-hired teachers.
//
// There is NO real per-month persistence of the composite score yet, so past
// months are generated with deterministic mock values seeded by teacher.id +
// month key (stable across renders). The CURRENT (in-progress) month always
// uses the real base composite / refusal count fed in by the caller.
// ============================================================================
import { type User } from "./mock-data";
import { loadSessions } from "./sessions-store";
import { latestOverride } from "./teacher-kpi-overrides-store";
import { getBonusThreshold } from "./teacher-kpis-threshold";

// ----- Real monthly snapshot persistence -----------------------------------
// Stores the last known REAL baseComposite / refusals per teacher+month, so
// that once the "current month" rolls over, historical months keep their real
// values instead of falling back to the deterministic mock.
const REAL_SNAPSHOT_KEY = "verbo.teacher-kpi.real-monthly-snapshots.v1";
interface RealMonthlySnapshot {
  baseComposite?: number;
  refusals?: number;
}
type RealSnapshotMap = Record<string, Record<string, RealMonthlySnapshot>>; // teacherId -> monthKey -> snapshot

function loadRealSnapshots(): RealSnapshotMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REAL_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as RealSnapshotMap) : {};
  } catch {
    return {};
  }
}
function persistRealSnapshots(map: RealSnapshotMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REAL_SNAPSHOT_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / access errors */
  }
}
function getRealSnapshot(teacherId: string, monthKey: string): RealMonthlySnapshot | undefined {
  return loadRealSnapshots()[teacherId]?.[monthKey];
}
function saveRealSnapshot(teacherId: string, monthKey: string, patch: RealMonthlySnapshot): void {
  const map = loadRealSnapshots();
  const forTeacher = map[teacherId] ?? {};
  const prev = forTeacher[monthKey] ?? {};
  const next: RealMonthlySnapshot = { ...prev, ...patch };
  if (next.baseComposite === prev.baseComposite && next.refusals === prev.refusals) return;
  forTeacher[monthKey] = next;
  map[teacherId] = forTeacher;
  persistRealSnapshots(map);
}

// ----- Month-key helpers ----------------------------------------------------
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function addMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyOf(d);
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

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

// Mock BASE composite (5-factor avg, before the responsiveness penalty) for a
// past month. Stable per teacher+month. Range 65–99.
export function mockCompositeFor(teacherId: string, monthKey: string): number {
  const rng = mulberry32(hashSeed(`${teacherId}:composite:${monthKey}`));
  return Math.round(65 + rng() * 34);
}

// Mock monthly refusal count (Reschedule / Substitute negatives) — stable per
// teacher+month, mostly 0–2 with occasional bad months at 3+.
function mockRefusalsFor(teacherId: string, monthKey: string): number {
  const rng = mulberry32(hashSeed(`${teacherId}:refusals:${monthKey}`));
  const r = rng();
  if (r < 0.70) return 0;
  if (r < 0.88) return 1;
  if (r < 0.96) return 2;
  if (r < 0.99) return 3;
  return 4;
}

// Real refusals in a given calendar month, derived from sessions where the
// teacher was flagged `needs_substitute` (i.e. couldn't/wouldn't cover). Only
// used for the current & future months; past months use the mock generator so
// the historical curve stays stable.
export function realRefusalsFor(teacherId: string, monthKey: string): number {
  try {
    const sessions = loadSessions();
    return sessions.filter((s) => {
      if (s.teacher_id !== teacherId) return false;
      if (!s.needs_substitute) return false;
      return monthKeyOf(new Date(s.date_time)) === monthKey;
    }).length;
  } catch {
    return 0;
  }
}

export function monthlyRefusals(
  teacherId: string,
  monthKey: string,
  currentMonthRefusals?: number,
): number {
  const nowKey = monthKeyOf(new Date());
  if (monthKey === nowKey) {
    const value = currentMonthRefusals ?? realRefusalsFor(teacherId, monthKey);
    saveRealSnapshot(teacherId, monthKey, { refusals: value });
    return value;
  }
  if (monthKey > nowKey) return realRefusalsFor(teacherId, monthKey);
  const saved = getRealSnapshot(teacherId, monthKey);
  if (saved && typeof saved.refusals === "number") return saved.refusals;
  return mockRefusalsFor(teacherId, monthKey);
}

// ----- Onboarding + tracking window ----------------------------------------
// Bonus tracking starts on the FIRST FULL calendar month AFTER the hire month.
// The hire month itself is the "Onboarding" month — composite locked at 90,
// no penalty is applied.
export const ONBOARDING_COMPOSITE = 90;

export function trackingStartKey(teacher: User): string {
  const hire = teacher.hire_date ? new Date(teacher.hire_date) : null;
  const nowKey = monthKeyOf(new Date());
  const hireKey = hire && !isNaN(hire.getTime()) ? monthKeyOf(hire) : null;
  return hireKey ? addMonthKey(hireKey, 1) : addMonthKey(nowKey, -BONUS_STREAK_REQUIRED);
}

export function isOnboardingMonth(teacher: User, monthKey: string): boolean {
  const hire = teacher.hire_date ? new Date(teacher.hire_date) : null;
  if (!hire || isNaN(hire.getTime())) return false;
  return monthKeyOf(hire) === monthKey;
}

// ----- Sequential penalty state --------------------------------------------
// Rules:
//   - Every month with ≥3 refusals adds +15 to penaltyState (accumulative).
//   - Every clean month (<3 refusals) recovers 5, floored at 0.
//   - Onboarding month and any pre-tracking month leave penaltyState at 0.
export const RESPONSIVENESS_BAD_THRESHOLD = 3;
export const RESPONSIVENESS_PENALTY = 15;
export const RESPONSIVENESS_RECOVERY = 5;

export function penaltyStateAt(
  teacher: User,
  monthKey: string,
  currentMonthRefusals?: number,
): number {
  const startKey = trackingStartKey(teacher);
  // Walk forward from the tracking start (or from the hire month + 1 for
  // teachers without a hire_date fallback) up to and INCLUDING monthKey.
  let state = 0;
  let cursor = startKey;
  const nowKey = monthKeyOf(new Date());
  // Safety cap to avoid runaways from bogus data.
  for (let i = 0; i < 240 && cursor <= monthKey; i++) {
    if (isOnboardingMonth(teacher, cursor)) {
      // Onboarding month never changes the penalty state.
    } else if (cursor > nowKey) {
      // Future months don't feed into penalty state.
    } else {
      const refusals =
        cursor === nowKey ? (currentMonthRefusals ?? realRefusalsFor(teacher.id, cursor))
        : monthlyRefusals(teacher.id, cursor);
      if (refusals >= RESPONSIVENESS_BAD_THRESHOLD) state += RESPONSIVENESS_PENALTY;
      else state = Math.max(0, state - RESPONSIVENESS_RECOVERY);
    }
    if (cursor === monthKey) break;
    cursor = addMonthKey(cursor, 1);
  }
  return state;
}

// ----- Snapshot: final composite for any month, penalty applied ------------
export interface MonthlySnapshot {
  monthKey: string;
  baseComposite: number;   // 5-factor avg BEFORE penalty
  penaltyState: number;    // cumulative penalty applied this month
  composite: number;       // final composite, floored at 0 (Onboarding => 90)
  responsiveness: number;  // 100 - penaltyState (100 during Onboarding)
  onboarding: boolean;
}

export function monthlySnapshot(
  teacher: User,
  monthKey: string,
  currentMonthBase?: number,
  currentMonthRefusals?: number,
): MonthlySnapshot {
  const nowKey = monthKeyOf(new Date());
  const onboarding = isOnboardingMonth(teacher, monthKey);

  if (onboarding) {
    return {
      monthKey,
      baseComposite: ONBOARDING_COMPOSITE,
      penaltyState: 0,
      composite: ONBOARDING_COMPOSITE,
      responsiveness: 100,
      onboarding: true,
    };
  }

  let baseComposite: number;
  if (monthKey === nowKey && typeof currentMonthBase === "number") {
    baseComposite = currentMonthBase;
    saveRealSnapshot(teacher.id, monthKey, { baseComposite });
    if (typeof currentMonthRefusals === "number") {
      saveRealSnapshot(teacher.id, monthKey, { refusals: currentMonthRefusals });
    }
  } else {
    const saved = monthKey < nowKey ? getRealSnapshot(teacher.id, monthKey) : undefined;
    baseComposite = saved && typeof saved.baseComposite === "number"
      ? saved.baseComposite
      : mockCompositeFor(teacher.id, monthKey);
  }
  const penaltyState = penaltyStateAt(teacher, monthKey, currentMonthRefusals);
  const rawComposite = Math.max(0, baseComposite - penaltyState);
  const rawResponsiveness = Math.max(0, 100 - penaltyState);

  // Manual admin overrides win over the derived values for this month.
  const compositeOverride = latestOverride(teacher.id, monthKey, "composite");
  const responsivenessOverride = latestOverride(teacher.id, monthKey, "responsiveness");
  const composite = compositeOverride ? compositeOverride.new_value : rawComposite;
  const responsiveness = responsivenessOverride ? responsivenessOverride.new_value : rawResponsiveness;
  return { monthKey, baseComposite, penaltyState, composite, responsiveness, onboarding: false };
}


// ----- Bonus streak status --------------------------------------------------
// Business rules:
//   - Bonus eligibility requires BONUS_STREAK_REQUIRED consecutive calendar
//     months (including the current in-progress month) with the FINAL
//     composite ≥ threshold.
//   - Tracking starts on the first full calendar month after the hire month.
//   - Onboarding month (hire month) does NOT count toward the streak.
export const BONUS_STREAK_REQUIRED = 6;

export type BonusStatus =
  | { kind: "not-tracking"; trackingStartLabel: string; trackingStartKey: string }
  | { kind: "streak"; streak: number; needed: number; threshold: number }
  | { kind: "eligible"; streak: number; threshold: number };

export function bonusStatus(
  teacher: User,
  currentMonthComposite: number,
  threshold = getBonusThreshold(),
): BonusStatus {
  const nowKey = monthKeyOf(new Date());
  const startKey = trackingStartKey(teacher);

  if (startKey > nowKey) {
    return { kind: "not-tracking", trackingStartLabel: monthLabel(startKey), trackingStartKey: startKey };
  }

  const window: string[] = [];
  for (let i = BONUS_STREAK_REQUIRED - 1; i >= 0; i--) {
    const k = addMonthKey(nowKey, -i);
    if (k >= startKey) window.push(k);
  }

  let streak = 0;
  for (let i = window.length - 1; i >= 0; i--) {
    const key = window[i];
    const composite =
      key === nowKey ? currentMonthComposite : monthlySnapshot(teacher, key).composite;
    if (composite >= threshold) streak++;
    else break;
  }

  if (window.length === BONUS_STREAK_REQUIRED && streak === BONUS_STREAK_REQUIRED) {
    return { kind: "eligible", streak, threshold };
  }
  return { kind: "streak", streak: Math.min(streak, BONUS_STREAK_REQUIRED), needed: BONUS_STREAK_REQUIRED, threshold };
}
