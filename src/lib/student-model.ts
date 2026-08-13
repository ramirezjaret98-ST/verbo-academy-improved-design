import type { CSSProperties } from "react";

// ============================================================================
// Student commercial model — single source of truth for the Admin > Students UI.
// Three independent axes: Product · Focus (Enfoque) · Access Plan.
// Everything here is meant to be easy to edit once the real catalog lands.
// ============================================================================

export type ProductId = "enterprise" | "go" | "international" | "vip";
export type AccessPlanId = "Core" | "Advance" | "Elite" | "Signature";
export type StudentStatus = "active" | "suspended" | "frozen";

// Roughly one live session per unit; a level block = 30 units = 30 sessions.
export const SESSIONS_PER_LEVEL = 40;
export const MAX_INSIGHT_STRIKES = 3;
export const MAX_BOOKCLUB_STRIKES = 3;

// ----------------------------------------------------------------------------
// PRODUCTS — audience + content roadmap. `icon` maps to a lucide-react name.
// ----------------------------------------------------------------------------
export interface ProductDef {
  id: ProductId;
  name: string;
  icon: "briefcase" | "compass" | "globe" | "crown";
  blurb: string;
  hasFocus: boolean;
  defaultAccessPlan?: AccessPlanId; // auto-selected (still editable)
  // Commercial names for each 30-session level block (placeholders — edit later).
  levels: string[];
}

export const PRODUCTS: ProductDef[] = [
  {
    id: "enterprise",
    name: "Enterprise",
    icon: "briefcase",
    blurb: "Corporate training with a strategic roadmap.",
    hasFocus: false,
    defaultAccessPlan: undefined, // admin chooses freely
    levels: ["Core Foundations", "Strategic Fluency", "Executive Presence", "Global Leadership"],
  },
  {
    id: "go",
    name: "GO",
    icon: "compass",
    blurb: "Flexible everyday learning for individuals.",
    hasFocus: true,
    defaultAccessPlan: "Core",
    levels: ["Kickstart", "Everyday Flow", "Confident Voice", "Culture Master"],
  },
  {
    id: "international",
    name: "International",
    icon: "globe",
    blurb: "Goal-driven programs for travel & relocation.",
    hasFocus: true,
    defaultAccessPlan: "Advance",
    levels: ["Survival Basics", "Travel Ready", "Social Fluency", "Full Command"],
  },
  {
    id: "vip",
    name: "VIP",
    icon: "crown",
    blurb: "Premium white-glove program with full personalization.",
    hasFocus: true,
    defaultAccessPlan: "Signature",
    levels: ["VIP Foundations", "VIP Momentum", "VIP Mastery", "VIP Signature"],
  },
];

export function getProduct(id?: string | null): ProductDef | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

// ----------------------------------------------------------------------------
// FOCUS (Enfoque) — marketing sub-offer. Only GO & International have it.
// `suggestedLevels` pre-marks the roadmap selection.
// ----------------------------------------------------------------------------
export interface FocusDef {
  id: string;
  name: string;
  product: ProductId;
  suggestedLevels: number; // how many roadmap levels to pre-select
}

export const FOCUSES: FocusDef[] = [
  { id: "go-global", name: "Global Experience", product: "go", suggestedLevels: 2 },
  { id: "go-hobby", name: "Hobby & Culture", product: "go", suggestedLevels: 2 },
  { id: "intl-survival", name: "Survival", product: "international", suggestedLevels: 2 },
  { id: "intl-mastery", name: "Mastery", product: "international", suggestedLevels: 4 },
];

export function focusesForProduct(product?: string | null): FocusDef[] {
  return FOCUSES.filter((f) => f.product === product);
}

export function getFocus(name?: string | null): FocusDef | undefined {
  return FOCUSES.find((f) => f.name === name);
}

// ----------------------------------------------------------------------------
// ACCESS PLANS — service tier (benefits, rescheduling, personalization).
// ----------------------------------------------------------------------------
export interface AccessPlanDef {
  id: AccessPlanId;
  blurb: string;
  reschedulePolicy: string; // preset label used in the reschedule dropdown
  rescheduleHours: number | null; // null = no restriction
  reschedulePct: number | null;
}

export const ACCESS_PLANS: AccessPlanDef[] = [
  {
    id: "Core",
    blurb: "Core incluye 1 Insight/mes no acumulable y ventana de reagendamiento de 24h.",
    reschedulePolicy: "24h notice, max 25% of monthly sessions",
    rescheduleHours: 24,
    reschedulePct: 25,
  },
  {
    id: "Advance",
    blurb: "Advance incluye 2 Insights/mes no acumulables y ventana de reagendamiento de 12h.",
    reschedulePolicy: "12h notice, max 40% of monthly sessions",
    rescheduleHours: 12,
    reschedulePct: 40,
  },
  {
    id: "Elite",
    blurb: "Elite incluye 4 Insights/mes no acumulables y ventana de reagendamiento de 6h.",
    reschedulePolicy: "6h notice, max 70% of monthly sessions",
    rescheduleHours: 6,
    reschedulePct: 70,
  },
  {
    id: "Signature",
    blurb: "Signature includes unlimited Insights and unrestricted rescheduling.",
    reschedulePolicy: "No restriction",
    rescheduleHours: null,
    reschedulePct: null,
  },
];

export const ACCESS_PLAN_IDS: AccessPlanId[] = ["Core", "Advance", "Elite", "Signature"];

export function getAccessPlan(id?: string | null): AccessPlanDef | undefined {
  return ACCESS_PLANS.find((p) => p.id === id);
}

// ----------------------------------------------------------------------------
// PRICING — official price per session (Fase 1, closed 2026-08-13; MXN, IVA
// incluido). This is the single source of truth for both the per-level
// package price and the monthly-price DEFAULT used in payments-log.ts (see
// `defaultMonthlyPrice`). The actual amount billed to a given student can
// still be overridden per-student — see `User.custom_price`.
// ----------------------------------------------------------------------------
export const PRICE_PER_SESSION: Record<AccessPlanId, number> = {
  Core: 250,
  Advance: 365,
  Elite: 550,
  Signature: 655,
};

// A student/group with no access_plan set yet (rare — mid-setup) falls back
// to Core's rate rather than an arbitrary placeholder.
export const DEFAULT_PRICE_PER_SESSION = PRICE_PER_SESSION.Core;

// Average weeks per calendar month — used only to turn a weekly cadence into
// a monthly estimate for the default price preview.
const AVG_WEEKS_PER_MONTH = 4.33;

/** Default MONTHLY price for a student/group on `plan`, given their real
 *  weekly cadence (`sessionsPerWeek`): price/session × sessions/week × weeks
 *  per month, rounded to the nearest 10 MXN. This is only ever the
 *  *starting point* shown in the admin form and used in The Money Lab when no
 *  override is set — the actual persisted amount is `User.custom_price` /
 *  `Group.access_plan`-derived value once the admin negotiates a different
 *  number. See `expectedAmountForStudent`/`expectedAmountForGroup` in
 *  payments-log.ts, which prefer `custom_price` over this default. */
export function defaultMonthlyPrice(plan: AccessPlanId | undefined, sessionsPerWeek: number | undefined): number {
  const perSession = (plan && PRICE_PER_SESSION[plan]) ?? DEFAULT_PRICE_PER_SESSION;
  const cadence = sessionsPerWeek && sessionsPerWeek > 0 ? sessionsPerWeek : 2;
  return Math.round((perSession * cadence * AVG_WEEKS_PER_MONTH) / 10) * 10;
}

export const RESCHEDULE_PRESETS: string[] = ACCESS_PLANS.map((p) => p.reschedulePolicy);

// ----------------------------------------------------------------------------
// Session cadence helper — keep weekly minutes constant when frequency changes.
// ----------------------------------------------------------------------------
export function suggestDuration(prevPerWeek: number, prevDuration: number, nextPerWeek: number): number {
  if (nextPerWeek <= 0) return prevDuration;
  const weeklyMinutes = prevPerWeek * prevDuration;
  return Math.max(15, Math.round(weeklyMinutes / nextPerWeek / 5) * 5);
}

// ----------------------------------------------------------------------------
// Payment date helper — next occurrence of `paymentDay` from a reference date.
// ----------------------------------------------------------------------------
export function nextPaymentDate(paymentDay: number, from: Date = new Date()): Date {
  const day = Math.min(31, Math.max(1, paymentDay || 1));
  const candidate = new Date(from.getFullYear(), from.getMonth(), day);
  // Clamp to end of month if the month is shorter than `day`.
  if (candidate.getMonth() !== from.getMonth()) {
    candidate.setDate(0);
  }
  if (candidate.getTime() <= from.setHours(0, 0, 0, 0)) {
    const next = new Date(from.getFullYear(), from.getMonth() + 1, day);
    if (next.getDate() !== day) next.setDate(0);
    return next;
  }
  return candidate;
}

// Next payment date strictly AFTER today (used when marking a cycle as paid so
// the indicator clears immediately). Shared by individual and group flows.
export function nextPaymentDateAfterToday(paymentDay: number): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return nextPaymentDate(paymentDay, tomorrow);
}

// Visual urgency of a payment cycle:
//   "overdue"  → the date already passed without being marked as paid
//   "due_soon" → within the next 3 days
//   null       → nothing to flag
export type PaymentUrgency = "overdue" | "due_soon" | null;

export function paymentUrgency(nextPay: Date | null | undefined): PaymentUrgency {
  if (!nextPay) return null;
  const d = daysUntil(nextPay);
  if (d < 0) return "overdue";
  if (d <= 3) return "due_soon";
  return null;
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

// ----------------------------------------------------------------------------
// Access plan pill styling — one solid identity color per plan.
// Core = orange · Advance = navy · Elite/Signature = black with gold detail.
// ----------------------------------------------------------------------------
export function accessPlanPillStyle(id?: string | null): CSSProperties {
  switch (id) {
    case "Core":
      return { background: "#f38934", color: "#ffffff" };
    case "Advance":
      return { background: "#01304a", color: "#ffffff" };
    case "Elite":
    case "Signature":
      return { background: "#0b0b0c", color: "#d4af37", border: "1px solid #d4af37" };
    default:
      return { background: "var(--secondary)", color: "var(--secondary-foreground)" };
  }
}

// ----------------------------------------------------------------------------
// Total challenges completed by a student — single criterion used everywhere
// (hero, player card and leaderboard): regular + lightning + season completions.
// ----------------------------------------------------------------------------
export function totalCompletedChallenges(student: {
  completed_challenges?: unknown[];
  lightning_completions?: number;
  season_completions?: Record<string, number>;
}): number {
  const regular = student.completed_challenges?.length ?? 0;
  const lightning = student.lightning_completions ?? 0;
  const seasons = Object.values(student.season_completions ?? {}).reduce(
    (sum, n) => sum + (n ?? 0),
    0,
  );
  return regular + lightning + seasons;
}
