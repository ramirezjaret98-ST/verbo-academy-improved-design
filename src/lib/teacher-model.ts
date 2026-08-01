// ============================================================================
// Teacher commercial/operational model — single source of truth for the
// Admin > Teachers UI. Mirrors the shape of student-model.ts.
// ============================================================================
import { USERS, ASSIGNMENTS, SESSIONS, userById, type User, type Session } from "./mock-data";
import { PRODUCTS, type ProductId } from "./student-model";
import { effectiveHourlyRate, teacherTier } from "./teacher-tiers";

export const DEFAULT_HOURLY_RATE = 120; // MXN / hour
export const AVAILABILITY_CHANGE_DAYS = 30; // teacher may request a change once per N days

// ----------------------------------------------------------------------------
// Financial / payroll model
// ----------------------------------------------------------------------------
export type PaymentFrequency = "weekly" | "biweekly" | "monthly";

export const PAYMENT_FREQUENCIES: { id: PaymentFrequency; label: string; count: number }[] = [
  { id: "weekly", label: "Weekly", count: 4 },
  { id: "biweekly", label: "Biweekly", count: 2 },
  { id: "monthly", label: "Monthly", count: 1 },
];

export function paymentFrequency(t: User): PaymentFrequency {
  return (t.payment_frequency as PaymentFrequency) ?? "monthly";
}

function isoDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// Evenly-spread default pay dates within the current month for a frequency.
export function generatePaymentDates(freq: PaymentFrequency, base = new Date()): string[] {
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (freq === "monthly") return [isoDate(year, month, daysInMonth)];
  if (freq === "biweekly") return [isoDate(year, month, 15), isoDate(year, month, daysInMonth)];
  return [7, 14, 21, Math.min(28, daysInMonth)].map((d) => isoDate(year, month, d));
}

export function defaultPaymentRecords(freq: PaymentFrequency, base = new Date()) {
  return generatePaymentDates(freq, base).map((date, i) => ({
    id: `pay-${i}-${date}`,
    date,
    status: "pending" as const,
  }));
}

export function hoursWorked(t: User): number {
  return typeof t.hours_cycle === "number" ? t.hours_cycle : (t.hours_month ?? 0);
}

export function adjustmentsTotal(t: User): number {
  return (t.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0);
}

export function financialSummary(t: User) {
  const rate = effectiveHourlyRate(t);
  const hours = hoursWorked(t);
  const subtotal = hours * rate;
  const adj = adjustmentsTotal(t);
  return { rate, hours, subtotal, adjustments: adj, total: subtotal + adj };
}

export type TeacherStatus = "active" | "frozen" | "removed";
export type QualifiedProduct = ProductId; // enterprise | go | international | vip

export const QUALIFIED_PRODUCTS: { id: QualifiedProduct; name: string }[] = PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
}));

export function teacherStatus(t: User): TeacherStatus {
  return (t.teacher_status as TeacherStatus) ?? "active";
}

export function qualifiedProducts(t: User): QualifiedProduct[] {
  return (t.qualified_products as QualifiedProduct[]) ?? [];
}

// ----------------------------------------------------------------------------
// Assignment helpers
// ----------------------------------------------------------------------------
export function assignedStudents(teacherId: string): User[] {
  const ids = ASSIGNMENTS.filter((a) => a.teacher_id === teacherId).map((a) => a.student_id);
  return USERS.filter((u) => u.role === "student" && ids.includes(u.id));
}

export function activeStudents(teacherId: string): User[] {
  return assignedStudents(teacherId).filter((s) => (s.status ?? "active") !== "suspended");
}

// Teachers eligible to teach a given product (qualified + not removed).
export function teachersForProduct(
  teachers: User[],
  product?: string | null,
  { includeRemoved = false }: { includeRemoved?: boolean } = {},
): User[] {
  return teachers.filter((t) => {
    if (!includeRemoved && teacherStatus(t) === "removed") return false;
    if (!product) return true;
    return qualifiedProducts(t).includes(product as QualifiedProduct);
  });
}

/**
 * Same as teachersForProduct() but sorted so that lower-tier teachers appear
 * first — this nudges coordinators toward newer / cheaper teachers when
 * assigning students. Ties break by name for stability.
 */
export function teachersForProductSorted(
  teachers: User[],
  product?: string | null,
  opts: { includeRemoved?: boolean } = {},
): User[] {
  return teachersForProduct(teachers, product, opts).slice().sort((a, b) => {
    const ta = teacherTier(a).id;
    const tb = teacherTier(b).id;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });
}

// ----------------------------------------------------------------------------
// KPI helpers
// ----------------------------------------------------------------------------
export function ratedSessions(teacherId: string): Session[] {
  return SESSIONS.filter(
    (s) =>
      s.teacher_id === teacherId &&
      typeof s.student_rating === "number" &&
      (s.review_status ?? "pending") !== "discarded",
  );
}

export function avgRating(t: User): number | null {
  const rated = ratedSessions(t.id);
  if (rated.length) {
    const sum = rated.reduce((a, s) => a + (s.student_rating ?? 0), 0);
    return Math.round((sum / rated.length) * 10) / 10;
  }
  return typeof t.rating === "number" ? t.rating : null;
}

export function flaggedReviews(teacherId: string): Session[] {
  return SESSIONS.filter(
    (s) => s.teacher_id === teacherId && typeof s.student_rating === "number" && (s.student_rating as number) <= 3,
  ).sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time));
}

export function pendingReviews(teacherId: string): Session[] {
  return flaggedReviews(teacherId).filter((s) => {
    const st = s.review_status ?? "pending";
    return st !== "reviewed" && st !== "discarded";
  });
}

export function studentName(id: string): string {
  return userById(id)?.name ?? "—";
}
