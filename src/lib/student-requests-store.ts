// Reschedule Requests + Spotlight Requests.
//
// A student cancels a session with reschedule quota → creates a
// `reschedule` request. Teachers see it in Teacher > Clubs (new section) and
// can Claim. Any qualified teacher can claim; the student's own teacher gets
// a "Your Student" badge. If nobody claims after 8h, it escalates to Admin's
// "Unclaimed Request" queue.
//
// Spotlight Requests work the same way (student initiates, teachers claim,
// same 8h escalation) but carry a mandatory description text and consume the
// monthly Spotlight cap on the student side.

import { loadSessions, persistSessions, updateSession, type ExtSessionStatus } from "./sessions-store";
import { getStudentVideoLink } from "./students-store";

export type StudentRequestKind = "reschedule" | "spotlight";

export interface StudentRequest {
  id: string;
  kind: StudentRequestKind;
  student_id: string;
  assigned_teacher_id?: string; // student's own teacher (for "Your Student" badge)
  // Reschedule: original session being replaced. Spotlight: undefined.
  origin_session_id?: string;
  // Preferred slot the student picked (must satisfy 24h + teacher availability).
  proposed_datetime: string; // ISO
  duration_minutes: number;
  // Spotlight-only: mandatory context from the student.
  spotlight_context?: string;
  // Ready-only context for the claim card. Reused across kinds.
  last_report_summary?: string;
  requested_at: string; // ISO
  status: "open" | "claimed" | "escalated" | "assigned" | "cancelled";
  claimed_by?: string;
  claimed_at?: string;
}

export const REQUESTS_KEY = "verbo:student-requests";
export const REQUESTS_EVENT = "verbo:student-requests-updated";
/** Requests unclaimed for this long escalate to Admin's Unclaimed queue. */
export const UNCLAIMED_ESCALATE_MS = 8 * 60 * 60 * 1000;

function readAll(): StudentRequest[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REQUESTS_KEY) || "[]"); } catch { return []; }
}
function writeAll(list: StudentRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(REQUESTS_EVENT));
}

/** Applies time-based auto-escalation on read so consumers always see the
 *  right status without a background job. */
export function loadStudentRequests(): StudentRequest[] {
  const now = Date.now();
  const list = readAll();
  let mutated = false;
  const next = list.map((r) => {
    if (r.status !== "open") return r;
    if (now - +new Date(r.requested_at) >= UNCLAIMED_ESCALATE_MS) {
      mutated = true;
      return { ...r, status: "escalated" as const };
    }
    return r;
  });
  if (mutated) writeAll(next);
  return next;
}

export function subscribeStudentRequests(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === REQUESTS_KEY) cb(); };
  window.addEventListener(REQUESTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(REQUESTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function addStudentRequest(input: Omit<StudentRequest, "id" | "requested_at" | "status">): StudentRequest {
  const req: StudentRequest = {
    ...input,
    id: `sr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    requested_at: new Date().toISOString(),
    status: "open",
  };
  writeAll([req, ...readAll()]);
  return req;
}

/** Records a Spotlight conversion as an already-assigned request so it counts
 *  toward the student's monthly Spotlight cap without appearing in open queues. */
export function recordSpotlightConversion(input: {
  student_id: string;
  teacher_id: string;
  proposed_datetime: string;
  duration_minutes: number;
  spotlight_context: string;
}): void {
  const req: StudentRequest = {
    id: `sr-conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "spotlight",
    student_id: input.student_id,
    assigned_teacher_id: input.teacher_id,
    proposed_datetime: input.proposed_datetime,
    duration_minutes: input.duration_minutes,
    spotlight_context: input.spotlight_context,
    requested_at: new Date().toISOString(),
    status: "assigned",
    claimed_by: input.teacher_id,
    claimed_at: new Date().toISOString(),
  };
  writeAll([req, ...readAll()]);
}

export function claimStudentRequest(id: string, teacherId: string): StudentRequest | null {
  const list = readAll();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const r = list[idx];
  if (r.status !== "open" && r.status !== "escalated") return null;
  const updated: StudentRequest = {
    ...r,
    status: "claimed",
    claimed_by: teacherId,
    claimed_at: new Date().toISOString(),
  };
  list[idx] = updated;
  writeAll(list);
  // Materialize the actual session in the shared sessions-store so it shows
  // on both calendars immediately.
  const { addClaimedSession } = requireHelpers();
  addClaimedSession(updated);
  return updated;
}

export function adminAssignRequest(id: string, teacherId: string): StudentRequest | null {
  const list = readAll();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const r = list[idx];
  if (r.status !== "escalated" && r.status !== "open") return null;
  const updated: StudentRequest = {
    ...r,
    status: "assigned",
    claimed_by: teacherId,
    claimed_at: new Date().toISOString(),
  };
  list[idx] = updated;
  writeAll(list);
  requireHelpers().addClaimedSession(updated);
  return updated;
}

/** How many reschedule/spotlight requests this teacher has already picked up
 *  this calendar month — used by Admin's fair-rotation candidate ranking. */
export function teacherRequestLoadThisMonth(teacherId: string): number {
  const now = new Date();
  return loadStudentRequests().filter((r) => {
    if (r.claimed_by !== teacherId) return false;
    if (!r.claimed_at) return false;
    const d = new Date(r.claimed_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
}

/** Candidate teachers ranked by fewest requests handled this month. */
export function fairRotationCandidates(qualifiedTeacherIds: string[]): { teacherId: string; load: number }[] {
  return qualifiedTeacherIds
    .map((teacherId) => ({ teacherId, load: teacherRequestLoadThisMonth(teacherId) }))
    .sort((a, b) => a.load - b.load);
}

// ---------------------------------------------------------------------------
// Reschedule-quota tracking (per student, per calendar month).
// ---------------------------------------------------------------------------
export interface ReschedulePolicy {
  noticeHours: number;
  maxPct: number; // e.g. 25 = "up to 25% of monthly sessions"
}

/** Parses either the custom (hours/pct) fields or the preset "24h notice,
 *  max 25% of monthly sessions" label into a { noticeHours, maxPct } shape. */
export function parseReschedulePolicy(u: {
  reschedule_policy?: string;
  reschedule_custom_hours?: number;
  reschedule_custom_pct?: number;
}): ReschedulePolicy {
  if (u.reschedule_custom_hours != null && u.reschedule_custom_pct != null) {
    return { noticeHours: u.reschedule_custom_hours, maxPct: u.reschedule_custom_pct };
  }
  const raw = u.reschedule_policy ?? "";
  const hoursMatch = raw.match(/(\d+)\s*h/i);
  const pctMatch = raw.match(/(\d+)\s*%/);
  return {
    noticeHours: hoursMatch ? Number(hoursMatch[1]) : 24,
    maxPct: pctMatch ? Number(pctMatch[1]) : 25,
  };
}

/** Reschedules used in the current calendar month for a student — counts
 *  both open requests and any historical converted sessions. */
export function reschedulesUsedThisMonth(studentId: string): number {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const inMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  const reqs = loadStudentRequests().filter(
    (r) => r.kind === "reschedule" && r.student_id === studentId
      && r.status !== "cancelled" && inMonth(r.requested_at),
  ).length;
  return reqs;
}

/** Spotlight requests submitted in the current calendar month for a student. */
export function spotlightRequestsThisMonth(studentId: string): number {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const inMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  return loadStudentRequests().filter(
    (r) => r.kind === "spotlight" && r.student_id === studentId
      && r.status !== "cancelled" && inMonth(r.requested_at),
  ).length;
}

/** Given a student's plan, how many reschedules they may use this cycle. */
export function rescheduleQuota(u: {
  sessions_per_week?: number;
  reschedule_policy?: string;
  reschedule_custom_hours?: number;
  reschedule_custom_pct?: number;
}): number {
  const { maxPct } = parseReschedulePolicy(u);
  const perWeek = u.sessions_per_week ?? 2;
  const monthlyBooked = perWeek * 4;
  return Math.max(1, Math.floor((monthlyBooked * maxPct) / 100));
}

// ---------------------------------------------------------------------------
// Internal helpers — kept in a lazy require to avoid a cyclic import at
// module load time between this store and sessions-store.
// ---------------------------------------------------------------------------
function requireHelpers() {
  return {
    addClaimedSession(req: StudentRequest) {
      const teacherId = req.claimed_by;
      if (!teacherId) return;
      const now = new Date().toISOString();
      const link = getStudentVideoLink(req.student_id) || `https://teams.microsoft.com/l/meetup/${req.student_id}`;
      const status: ExtSessionStatus = "scheduled";
      const newSession = {
        id: `${req.kind === "spotlight" ? "sp" : "rs"}-${req.id}`,
        student_id: req.student_id,
        teacher_id: teacherId,
        date_time: req.proposed_datetime,
        duration_minutes: req.duration_minutes,
        teams_link: link,
        status,
        origin: req.kind === "spotlight" ? "spotlight" : undefined,
        notes: req.kind === "spotlight" ? `Spotlight Session — ${req.spotlight_context ?? ""}` : `Reschedule — original ${req.origin_session_id}`,
      };
      persistSessions([newSession as never, ...loadSessions()]);
      // For reschedules: mark the original session cancelled (Cancel-only path
      // already handled that; this branch is used when the student picked
      // "Reschedule").
      if (req.kind === "reschedule" && req.origin_session_id) {
        updateSession(req.origin_session_id, { status: "cancelled" as const });
      }
      // Timestamp usage: swallow lint on unused var
      void now;
    },
  };
}

// ---------------------------------------------------------------------------
// Spotlight overlap → Converted to Spotlight.
// ---------------------------------------------------------------------------
export function convertSessionToSpotlight(input: {
  originalSessionId: string;
  spotlightContext: string;
}): void {
  const sessions = loadSessions();
  const orig = sessions.find((s) => s.id === input.originalSessionId);
  if (!orig) return;
  // Mark the original session as Converted to Spotlight (no strike, no cancel).
  updateSession(orig.id, { status: "converted_to_spotlight" as const });
  // Create the Spotlight session in the same slot with the same teacher.
  const spotlightSession = {
    id: `sp-conv-${Date.now()}`,
    student_id: orig.student_id,
    teacher_id: orig.teacher_id,
    date_time: orig.date_time,
    duration_minutes: Math.min(60, orig.duration_minutes),
    teams_link: orig.teams_link,
    status: "scheduled" as const,
    origin: "spotlight" as const,
    notes: `Spotlight (converted) — ${input.spotlightContext}`,
  };
  persistSessions([spotlightSession as never, ...loadSessions()]);
  recordSpotlightConversion({
    student_id: orig.student_id,
    teacher_id: orig.teacher_id,
    proposed_datetime: orig.date_time,
    duration_minutes: spotlightSession.duration_minutes,
    spotlight_context: input.spotlightContext,
  });
}
