// Club bookings — student-side seat reservations for Verbo Insights and
// Book Clubs. Keeps the X/3 monthly cap (individual, even for Group members)
// and the <24h cutoff in a single source of truth shared by the
// student.insights and student.sessions routes.
//
// Also updates `clubs-store` spots_taken so admin/teacher surfaces reflect
// reservations in real time.
//
// Backed by Supabase (`public.club_bookings`). RLS: a student can
// insert/select/update/delete their own bookings; the club's assigned
// teacher can also see bookings for their own clubs; admins see everything.
// A plain `select("*")` already returns exactly that scoped set for the
// calling session (including "every booking" for admin, which is what
// `adminCalendarEvents()` in calendar-events.ts needs to look up an
// arbitrary student's booking) — so we use the same global-cache pattern as
// the rest of this migration instead of a per-student Map.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
import { loadClubs, type Club, type ClubType } from "./clubs-store";
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

export const CLUB_BOOKINGS_EVENT = "verbo:club-bookings-updated";

/** Cutoff window before start when reservations & cancellations close. */
export const RESERVATION_CUTOFF_HOURS = 24;

type Row = Database["public"]["Tables"]["club_bookings"]["Row"];

let cache: ClubBooking[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CLUB_BOOKINGS_EVENT));
}

function mapRow(row: Row): ClubBooking {
  return {
    id: String(row.id),
    student_id: uuidToLegacySync(row.student_id),
    club_id: String(row.club_id),
    club_type: row.club_type,
    booked_at: row.booked_at,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("club_bookings").select("*");
    if (error) {
      console.error("[club-bookings-store] failed to load", error);
      hydrated = true;
      return;
    }
    cache = (data ?? []).map(mapRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("club-bookings-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "club_bookings" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

export function loadBookings(): ClubBooking[] {
  if (!hydrated) void hydrate();
  return cache;
}

export function bookingsForStudent(studentId: string): ClubBooking[] {
  return loadBookings().filter((b) => b.student_id === studentId);
}

export function isBooked(studentId: string, clubId: string): boolean {
  return loadBookings().some((b) => b.student_id === studentId && b.club_id === clubId);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** Bookings the student has made *this calendar month*, split by type. */
export function bookingsThisMonth(studentId: string, type: ClubType): number {
  const now = monthKey(new Date().toISOString());
  return loadBookings().filter(
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
  return loadBookings().filter((b) => b.student_id === studentId && b.club_type === type).length;
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

export async function reserveSeat(studentId: string, clubId: string): Promise<{ ok: true; booking: ClubBooking } | { ok: false; reason: string }> {
  const club = loadClubs().find((c) => c.id === clubId);
  if (!club) return { ok: false, reason: "Session not found." };
  if (isBooked(studentId, clubId)) return { ok: false, reason: "You're already booked." };
  const blocked = reserveBlockedReason(studentId, club);
  if (blocked) return { ok: false, reason: blocked };

  const studentUuid = await legacyToUuid(studentId);
  const numericClubId = Number(clubId);
  if (!studentUuid || !Number.isFinite(numericClubId)) {
    return { ok: false, reason: "Something went wrong. Try again." };
  }

  const bookedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("club_bookings")
    .insert({ student_id: studentUuid, club_id: numericClubId, club_type: club.type, booked_at: bookedAt })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[club-bookings-store] failed to reserve seat", error);
    // A `club_bookings_before_insert` trigger re-validates capacity/cutoff/
    // status server-side and raises a human-readable message when it blocks
    // the insert (belt-and-suspenders against the client-side check above
    // going stale under concurrent reservations) — surface it when present.
    return { ok: false, reason: error?.message || "Something went wrong. Try again." };
  }
  const booking = mapRow(data);
  cache = [booking, ...cache];
  notify();
  // spots_taken is now bumped atomically, server-side, by the
  // `club_bookings_before_insert` trigger — no client-side patch needed here
  // (and doing one here would double-count it). clubs-store's own Realtime
  // subscription picks up the trigger's update.

  // Core freemium: consume the one-shot courtesy credit at confirmation.
  if (userById(studentId)?.access_plan === "Core") {
    const fkind = club.type === "book" ? "book" : "insight";
    if (!freemiumUsed(studentId, fkind)) void markFreemiumUsed(studentId, fkind);
  }
  return { ok: true, booking };
}


export async function cancelSeat(studentId: string, clubId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const club = loadClubs().find((c) => c.id === clubId);
  if (!club) return { ok: false, reason: "Session not found." };
  if (!isBooked(studentId, clubId)) return { ok: false, reason: "You don't have a seat here." };
  const blocked = cancelBlockedReason(club);
  if (blocked) return { ok: false, reason: blocked };

  const studentUuid = await legacyToUuid(studentId);
  const numericClubId = Number(clubId);
  if (!studentUuid || !Number.isFinite(numericClubId)) {
    return { ok: false, reason: "Something went wrong. Try again." };
  }

  const { error } = await supabase
    .from("club_bookings")
    .delete()
    .eq("student_id", studentUuid)
    .eq("club_id", numericClubId);
  if (error) {
    console.error("[club-bookings-store] failed to cancel seat", error);
    return { ok: false, reason: "Something went wrong. Try again." };
  }
  cache = cache.filter((b) => !(b.student_id === studentId && b.club_id === clubId));
  notify();
  // spots_taken is now decremented atomically, server-side, by the
  // `club_bookings_after_delete` trigger.

  return { ok: true };
}

// ---- React bindings -------------------------------------------------------
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const SERVER: ClubBooking[] = [];
export function useBookings(): ClubBooking[] {
  return useSyncExternalStore(subscribe, () => cache, () => SERVER);
}
export function subscribeBookings(cb: () => void): () => void {
  return subscribe(cb);
}
