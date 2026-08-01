// Club bookings — student-side seat reservations for Verbo Insights and
// Book Clubs. Keeps the X/3 monthly cap (individual, even for Group members)
// and the <24h cutoff in a single source of truth shared by the
// student.insights and student.sessions routes.
//
// Also updates `clubs-store` spots_taken so admin/teacher surfaces reflect
// reservations in real time.
import { useSyncExternalStore } from "react";
import { loadClubs, persistClubs, type Club, type ClubType } from "./clubs-store";
import { groupsByStudentId } from "./groups-store";
import { userById } from "./mock-data";
import type { AccessPlanId } from "./student-model";
import { hasCreditUsed as freemiumUsed, markCreditUsed as markFreemiumUsed } from "./core-freemium-store";
import { spotlightRequestsThisMonth } from "./student-requests-store";


/** Per-plan monthly seat defaults across the three consumable event types.
 *  Manual overrides on the student record (addon_*_per_month) always win,
 *  even when set to 0 — the admin has absolute control over individual cases.
 *  Advance/Core reset each month (non-accumulable). Elite accumulates (see
 *  `resolvedRemainingSeats`). Signature is unlimited. Core's real access
 *  is freemium — implemented separately. */
export const PLAN_DEFAULTS: Record<AccessPlanId, { insight: number; book: number; spotlight: number }> = {
  Core:      { insight: 0, book: 0, spotlight: 0 },
  Advance:   { insight: 2, book: 2, spotlight: 1 },
  Elite:     { insight: 4, book: 4, spotlight: 4 },
  Signature: { insight: Infinity, book: Infinity, spotlight: Infinity },
};

/** The three "consumable" event kinds gated by plan/add-on caps. */
export type AccessKind = "insight" | "book" | "spotlight";


export interface ClubBooking {
  id: string;
  student_id: string;
  club_id: string;
  club_type: ClubType;
  booked_at: string; // ISO
}

const KEY = "verbo:club-bookings";
const EVENT = "verbo:club-bookings-updated";

/** Cutoff window before start when reservations & cancellations close. */
export const RESERVATION_CUTOFF_HOURS = 24;

function safeRead(): ClubBooking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClubBooking[]) : [];
  } catch { return []; }
}
function safeWrite(list: ClubBooking[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    cache = null;
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

let cache: ClubBooking[] | null = null;
function snapshot(): ClubBooking[] {
  if (cache === null) cache = safeRead();
  return cache;
}

export function loadBookings(): ClubBooking[] {
  return snapshot();
}

export function bookingsForStudent(studentId: string): ClubBooking[] {
  return snapshot().filter((b) => b.student_id === studentId);
}

export function isBooked(studentId: string, clubId: string): boolean {
  return snapshot().some((b) => b.student_id === studentId && b.club_id === clubId);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** Bookings the student has made *this calendar month*, split by type. */
export function bookingsThisMonth(studentId: string, type: ClubType): number {
  const now = monthKey(new Date().toISOString());
  return snapshot().filter(
    (b) => b.student_id === studentId && b.club_type === type && monthKey(b.booked_at) === now,
  ).length;
}

/** Manual add-on cap from student/group record. `undefined` = no override,
 *  which triggers the plan default. Any defined value (including 0) wins. */
function manualCap(studentId: string, kind: AccessKind): number | undefined {
  const u = userById(studentId);
  const g = groupsByStudentId().get(studentId);
  const pick = (
    userVal: number | undefined,
    groupVal: number | undefined,
  ): number | undefined => (userVal !== undefined ? userVal : groupVal);
  if (kind === "insight") return pick(u?.addon_insights_per_month, g?.addon_insights_per_month);
  if (kind === "book") return pick(u?.addon_bookclubs_per_month, g?.addon_bookclubs_per_month);
  return pick(u?.addon_spotlight_per_month, g?.addon_spotlight_per_month);
}

/** Resolved monthly cap for the student:
 *  1. If admin set an explicit add-on value on the student/group, use it.
 *  2. Otherwise fall back to PLAN_DEFAULTS[access_plan][kind].
 *  Returns Infinity for Signature-with-no-override (unlimited). */
export function resolvedMonthlyCap(studentId: string, kind: AccessKind): number {
  const m = manualCap(studentId, kind);
  if (m !== undefined) return m;
  const plan = userById(studentId)?.access_plan as AccessPlanId | undefined;
  if (!plan) return 0;
  return PLAN_DEFAULTS[plan]?.[kind] ?? 0;
}

/** Elite is the only plan where unused seats roll over. */
function isAccumulable(studentId: string): boolean {
  return userById(studentId)?.access_plan === "Elite";
}

/** Complete calendar months elapsed since cycle_start, inclusive of the
 *  current month (so a brand-new student on day 1 still has month 1 quota). */
function monthsElapsedSinceCycle(studentId: string): number {
  const iso = userById(studentId)?.cycle_start;
  if (!iso) return 1;
  const s = new Date(iso);
  const n = new Date();
  const diff = (n.getFullYear() - s.getFullYear()) * 12 + (n.getMonth() - s.getMonth());
  return Math.max(1, diff + 1);
}

/** Total historical bookings for the student, by type — used for Elite's
 *  cumulative balance (unused seats carry forward). */
export function totalBookingsForStudent(studentId: string, type: ClubType): number {
  return snapshot().filter((b) => b.student_id === studentId && b.club_type === type).length;
}

/** How many more seats the student can consume RIGHT NOW for this kind.
 *  - Signature: Infinity (no cap check).
 *  - Elite: cap × months_since_cycle_start − total_historical (accumulable).
 *  - Others: cap − bookings_this_month (non-accumulable, monthly reset). */
export function resolvedRemainingSeats(studentId: string, kind: AccessKind): number {
  const cap = resolvedMonthlyCap(studentId, kind);
  // Core plan: courtesy freemium credit — while it's unclaimed, treat as 1
  // available seat so the reservation/request flow isn't blocked by the
  // recurring cap (which is 0 for Core by design).
  const plan = userById(studentId)?.access_plan;
  const freemiumBoost = plan === "Core" && !freemiumUsed(studentId, kind) ? 1 : 0;
  if (!isFinite(cap)) return Infinity;
  if (cap === 0 && freemiumBoost === 0) return 0;
  if (isAccumulable(studentId) && kind !== "spotlight") {
    const type: ClubType = kind === "insight" ? "insight" : "book";
    const total = totalBookingsForStudent(studentId, type);
    return Math.max(0, cap * monthsElapsedSinceCycle(studentId) - total);
  }
  if (kind === "spotlight") return Math.max(0, cap - spotlightRequestsThisMonth(studentId)) + freemiumBoost;
  const type: ClubType = kind === "insight" ? "insight" : "book";
  return Math.max(0, cap - bookingsThisMonth(studentId, type)) + freemiumBoost;
}


/** Backwards-compat wrapper for the old X/month cap API. Prefer
 *  `resolvedMonthlyCap` / `resolvedRemainingSeats` for new call-sites. */
export function monthlyCap(studentId: string, type: ClubType): number {
  return resolvedMonthlyCap(studentId, type === "book" ? "book" : "insight");
}

export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 36e5;
}

/** Full reservability check. Returns a reason string if the seat can't be
 *  reserved right now; null if OK. */
export function reserveBlockedReason(
  studentId: string,
  club: Club,
): string | null {
  if (club.status === "cancelled") return "This session was cancelled.";
  if (club.status === "completed") return "This session has already taken place.";
  const hrs = hoursUntil(club.date);
  if (hrs < RESERVATION_CUTOFF_HOURS) return "Reservations close 24h before start.";
  if ((club.spots_taken ?? 0) >= club.spots_total) return "This session is full.";
  const kind: AccessKind = club.type === "book" ? "book" : "insight";
  const remaining = resolvedRemainingSeats(studentId, kind);
  if (remaining <= 0) {
    const cap = resolvedMonthlyCap(studentId, kind);
    if (cap === 0) {
      return club.type === "book"
        ? "Your plan doesn't include Book Club access."
        : "Your plan doesn't include Insight access.";
    }
    return club.type === "book"
      ? "You've used your Book Club seats for this cycle."
      : "You've used your Insight seats for this cycle.";
  }
  return null;
}


/** Cancellation is only allowed if the club is still upcoming and outside
 *  the 24h cutoff window. */
export function cancelBlockedReason(club: Club): string | null {
  if (club.status !== "upcoming") return "This session can no longer be modified.";
  if (hoursUntil(club.date) < RESERVATION_CUTOFF_HOURS)
    return "Cancellations close 24h before start.";
  return null;
}

export function reserveSeat(studentId: string, clubId: string): { ok: true; booking: ClubBooking } | { ok: false; reason: string } {
  const clubs = loadClubs();
  const idx = clubs.findIndex((c) => c.id === clubId);
  if (idx < 0) return { ok: false, reason: "Session not found." };
  const club = clubs[idx];
  if (isBooked(studentId, clubId)) return { ok: false, reason: "You're already booked." };
  const blocked = reserveBlockedReason(studentId, club);
  if (blocked) return { ok: false, reason: blocked };
  const booking: ClubBooking = {
    id: `cb${Date.now()}`,
    student_id: studentId,
    club_id: clubId,
    club_type: club.type,
    booked_at: new Date().toISOString(),
  };
  safeWrite([booking, ...snapshot()]);
  // Bump spots_taken.
  clubs[idx] = { ...club, spots_taken: (club.spots_taken ?? 0) + 1 };
  persistClubs(clubs);
  // Core freemium: consume the one-shot courtesy credit at confirmation.
  if (userById(studentId)?.access_plan === "Core") {
    const fkind = club.type === "book" ? "book" : "insight";
    if (!freemiumUsed(studentId, fkind)) markFreemiumUsed(studentId, fkind);
  }
  return { ok: true, booking };
}


export function cancelSeat(studentId: string, clubId: string): { ok: true } | { ok: false; reason: string } {
  const clubs = loadClubs();
  const idx = clubs.findIndex((c) => c.id === clubId);
  if (idx < 0) return { ok: false, reason: "Session not found." };
  const club = clubs[idx];
  if (!isBooked(studentId, clubId)) return { ok: false, reason: "You don't have a seat here." };
  const blocked = cancelBlockedReason(club);
  if (blocked) return { ok: false, reason: blocked };
  safeWrite(snapshot().filter((b) => !(b.student_id === studentId && b.club_id === clubId)));
  clubs[idx] = { ...club, spots_taken: Math.max(0, (club.spots_taken ?? 0) - 1) };
  persistClubs(clubs);
  return { ok: true };
}

// ---- React bindings -------------------------------------------------------
function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = () => { cache = null; cb(); };
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onEvent(); };
  window.addEventListener(EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}
const SERVER: ClubBooking[] = [];
export function useBookings(): ClubBooking[] {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}
export function subscribeBookings(cb: () => void): () => void {
  return subscribe(cb);
}
