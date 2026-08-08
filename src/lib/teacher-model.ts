// ============================================================================
// Teacher commercial/operational model — single source of truth for the
// Admin > Teachers UI. Mirrors the shape of student-model.ts.
// ============================================================================
import { USERS, SESSIONS, userById, type User, type Session } from "./mock-data";
import { assignedStudentIdsFor } from "./assignments-store";
import { PRODUCTS, type ProductId } from "./student-model";
import { effectiveHourlyRate, teacherTier } from "./teacher-tiers";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { legacyToUuid } from "@/lib/user-id-bridge";

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
  const ids = assignedStudentIdsFor(teacherId);
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

// ----------------------------------------------------------------------------
// Supabase-backed teacher profile store (Lote 11) — mirrors students-store.ts.
// ----------------------------------------------------------------------------
export const TEACHERS_EVENT = "verbo:teachers-updated";
/** Same key admin.teachers.tsx / strikes-store.ts / teacher-tiers.ts already use. */
const TEACHER_PROFILE_KEY = "verbo:teacher-profile-overrides";

function readTeacherOverrides(): Record<string, Partial<User>> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(TEACHER_PROFILE_KEY) || "{}"); } catch { return {}; }
}
function writeTeacherOverrides(map: Record<string, Partial<User>>) {
  if (typeof window !== "undefined") localStorage.setItem(TEACHER_PROFILE_KEY, JSON.stringify(map));
}

/** The DB-backed slice of `User` for teachers (same field names as the
 *  `app_users` columns actually used by this profile). Keep in sync with the
 *  `User` interface in mock-data.ts. */
export interface TeacherProfileFields {
  qualified_products?: QualifiedProduct[];
  hourly_rate?: number;
  teacher_status?: TeacherStatus;
  hire_date?: string;
  tier_frozen_since?: string | null;
  tier_frozen_days?: number;
  tier_reset_at?: string | null;
  rating?: number;
  plan_punctuality?: number;
  report_punctuality?: number;
  hours_month?: number;
  hours_cycle?: number;
  payment_frequency?: PaymentFrequency;
  admin_notes?: string;
  must_change_password?: boolean;
}

/** Every DB-backed teacher profile field — the ONLY keys ever sent to the
 *  `app_users` UPDATE (extra keys the caller may pass, e.g. `password`,
 *  `adjustments`, `payment_records`, `availability`, are filtered out so
 *  PostgREST never sees an unknown column — they stay localStorage-only,
 *  see patchTeacherProfile below). */
const TEACHER_PROFILE_FIELD_KEYS: (keyof TeacherProfileFields)[] = [
  "qualified_products", "hourly_rate", "teacher_status", "hire_date",
  "tier_frozen_since", "tier_frozen_days", "tier_reset_at", "rating",
  "plan_punctuality", "report_punctuality", "hours_month", "hours_cycle",
  "payment_frequency", "admin_notes", "must_change_password",
];

type AppUsersUpdate = Database["public"]["Tables"]["app_users"]["Update"];

/** Patch a teacher's profile. Accepts a full `Partial<User>` (not just the
 *  DB-backed subset) because callers like admin.teachers.tsx's persist()
 *  pass the entire updated User object, including fields that are NOT
 *  migrated this lote (adjustments, payment_records, availability,
 *  password). Behavior:
 *   1. Optimistic: `Object.assign` onto the live USERS singleton entry +
 *      dispatch TEACHERS_EVENT immediately.
 *   2. ALWAYS merge the full `patch` (minus id/role) into the
 *      `verbo:teacher-profile-overrides` localStorage map — this is a MERGE
 *      (`{...(map[id]||{}), ...patch}`), never a full replace, so a caller
 *      passing a tiny partial patch (e.g. strikes-store.ts freezing just
 *      `teacher_status`) never wipes out previously-stored fields like
 *      `adjustments`. This is what keeps `adjustments`/`payment_records`/
 *      `availability` working exactly as before — they simply never leave
 *      localStorage, by design, for this lote.
 *   3. In the background, resolve `legacyToUuid(teacherId)`. If a real UUID
 *      exists: build a Supabase update payload containing only the keys in
 *      `TEACHER_PROFILE_FIELD_KEYS` that are present in `patch`, PLUS a
 *      special case — `patch.availability_request` (a nested
 *      `{ note, requested_on } | null` shape on the frontend `User` type)
 *      is flattened into the two DB columns `availability_request_note` /
 *      `availability_request_at`. Only call the Supabase update if the
 *      resulting payload has at least one key. On error, roll back ONLY the
 *      DB-backed keys on the in-memory USERS entry (not the localStorage
 *      mirror, which already succeeded) and re-dispatch TEACHERS_EVENT. */
export function patchTeacherProfile(teacherId: string, patch: Partial<User>): void {
  const u = USERS.find((x) => x.id === teacherId);
  const prev: Record<string, unknown> = {};
  if (u) {
    for (const key of Object.keys(patch)) {
      prev[key] = (u as unknown as Record<string, unknown>)[key];
    }
    Object.assign(u, patch);
  }
  if (typeof window === "undefined") return;
  const overrides = readTeacherOverrides();
  const rest = { ...patch } as Partial<User>;
  delete (rest as Partial<User>).id;
  delete (rest as Partial<User>).role;
  overrides[teacherId] = { ...(overrides[teacherId] ?? {}), ...rest };
  writeTeacherOverrides(overrides);
  window.dispatchEvent(new CustomEvent(TEACHERS_EVENT));
  void (async () => {
    const uuid = await legacyToUuid(teacherId);
    // No real Supabase Auth account yet — the localStorage mirror above is
    // the only persistence, matching pre-existing behavior.
    if (uuid === null) return;
    const dbPatch: AppUsersUpdate = {};
    for (const key of TEACHER_PROFILE_FIELD_KEYS) {
      if (key in patch) { (dbPatch as Record<string, unknown>)[key] = (patch as Record<string, unknown>)[key]; }
    }
    if ("availability_request" in patch) {
      const ar = (patch as Partial<User>).availability_request;
      (dbPatch as Record<string, unknown>).availability_request_note = ar?.note ?? null;
      (dbPatch as Record<string, unknown>).availability_request_at = ar?.requested_on ?? null;
    }
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await supabase.from("app_users").update(dbPatch).eq("id", uuid);
    if (error) {
      console.error("[teacher-model] failed to save teacher profile", error);
      if (u) Object.assign(u, prev);
      window.dispatchEvent(new CustomEvent(TEACHERS_EVENT));
    }
  })();
}

/** Hydrates teacher profile fields from Supabase into the USERS singleton.
 *  Dual-source, same reasoning as hydrateStudents(): RLS on `app_users` only
 *  returns "myself" or (if admin) "everyone" via `select("*")`, so a
 *  non-admin, non-self viewer (e.g. a student peeking a teacher's card, or
 *  the reschedule-teacher picker) needs the `teacher_profile_for_peek()` RPC
 *  for the safe subset of fields. Call this once per relevant route mount,
 *  same pattern as hydrateStudents(). */
export function hydrateTeachers(): void {
  if (typeof window === "undefined") return;
  const overrides = readTeacherOverrides();
  USERS.forEach((u) => { if (u.role === "teacher" && overrides[u.id]) Object.assign(u, overrides[u.id]); });
  void (async () => {
    const [selectRes, rpcRes] = await Promise.all([
      supabase.from("app_users").select("*"),
      supabase.rpc("teacher_profile_for_peek"),
    ]);
    if (selectRes.error) console.error("[teacher-model] failed to load app_users profiles", selectRes.error);
    if (rpcRes.error) console.error("[teacher-model] failed to load teacher peek profiles", rpcRes.error);
    // A real teacher registered from a DIFFERENT browser/session never
    // reached THIS session's in-memory USERS array (that bookkeeping is
    // per-browser, localStorage-only) — build a fresh entry straight from
    // the DB/RPC row instead of silently dropping it (same root-cause fix as
    // students-store.ts's hydrateStudents(), applied here for teachers: e.g.
    // a student peeking a teacher card, or the reschedule-teacher picker,
    // for a teacher only assigned/registered in another session).
    const ensureTeacher = (legacyId: string, name: string): User => {
      let u = USERS.find((x) => x.id === legacyId && x.role === "teacher");
      if (!u) {
        u = { id: legacyId, name, email: "", password: "", role: "teacher" };
        USERS.push(u);
      }
      return u;
    };
    const applyFullRow = (row: Record<string, unknown>) => {
      const legacyId = row.legacy_id;
      if (typeof legacyId !== "string" || !legacyId) return;
      // select("*") returns every role admin can see — only build teacher
      // entries here.
      if (typeof row.role === "string" && row.role !== "teacher") return;
      const u = ensureTeacher(legacyId, typeof row.name === "string" ? row.name : "");
      if (typeof row.email === "string" && row.email) u.email = row.email;
      for (const key of TEACHER_PROFILE_FIELD_KEYS) {
        const value = row[key];
        if (value !== null && value !== undefined) { (u as unknown as Record<string, unknown>)[key] = value; }
      }
      const note = row.availability_request_note as string | null | undefined;
      const at = row.availability_request_at as string | null | undefined;
      u.availability_request = note || at ? { note: note ?? "", requested_on: at ?? "" } : null;
    };
    const applyPeekRow = (row: Record<string, unknown>) => {
      const legacyId = row.legacy_id;
      if (typeof legacyId !== "string" || !legacyId) return;
      const u = ensureTeacher(legacyId, typeof row.name === "string" ? row.name : "");
      const peekKeys: (keyof TeacherProfileFields)[] = ["qualified_products", "teacher_status", "hire_date", "tier_frozen_since", "tier_frozen_days", "tier_reset_at", "rating", "hours_month"];
      for (const key of peekKeys) {
        const value = (row as Record<string, unknown>)[key];
        if (value !== null && value !== undefined) { (u as unknown as Record<string, unknown>)[key] = value; }
      }
    };
    for (const row of selectRes.data ?? []) applyFullRow(row as unknown as Record<string, unknown>);
    for (const row of rpcRes.data ?? []) applyPeekRow(row as unknown as Record<string, unknown>);
    if (!selectRes.error || !rpcRes.error) window.dispatchEvent(new CustomEvent(TEACHERS_EVENT));
  })();
}

export function subscribeTeachers(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TEACHERS_EVENT, cb);
  return () => window.removeEventListener(TEACHERS_EVENT, cb);
}
