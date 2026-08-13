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
//
// Backed by Supabase (`public.student_requests`). This is a CROSS-USER
// workflow by design — the student creates the request on their device and
// any qualified teacher must see it on THEIR device — so the old
// localStorage backing could never work. Reads are served from an in-memory
// cache kept in sync via Postgres Realtime, so `loadStudentRequests()` stays
// synchronous for the render-time call sites. RLS scopes rows naturally
// (students see their own, teachers/admins see all), so a plain
// hydrate-once + Realtime pattern is enough here. Mutations write
// optimistically to the cache and persist in the background. The DB
// generates `id` itself (bigint identity), so inserts use the
// temp-id-then-replace pattern from teacher-kpi-overrides-store.ts.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { legacyToUuid, uuidToLegacySync, hydrateUserIdBridge } from "./user-id-bridge";
import {
  loadSessions,
  createSession,
  updateSession,
  convertOwnSessionToSpotlight,
  type ExtSessionStatus,
} from "./sessions-store";
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

export const REQUESTS_EVENT = "verbo:student-requests-updated";
/** Requests unclaimed for this long escalate to Admin's Unclaimed queue. */
export const UNCLAIMED_ESCALATE_MS = 8 * 60 * 60 * 1000;

type RequestRow = Database["public"]["Tables"]["student_requests"]["Row"];

let cache: StudentRequest[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    // notifications-store.ts listens for this window event directly
    // (bypassing `subscribeStudentRequests`), so it must keep firing on
    // every mutation and cache refresh.
    window.dispatchEvent(new CustomEvent(REQUESTS_EVENT));
  }
}

function mapRow(row: RequestRow): StudentRequest {
  return {
    id: String(row.id),
    kind: row.kind,
    student_id: uuidToLegacySync(row.student_id),
    assigned_teacher_id: row.assigned_teacher_id
      ? uuidToLegacySync(row.assigned_teacher_id)
      : undefined,
    origin_session_id: row.origin_session_id != null ? String(row.origin_session_id) : undefined,
    proposed_datetime: row.proposed_datetime,
    duration_minutes: row.duration_minutes,
    spotlight_context: row.spotlight_context ?? undefined,
    last_report_summary: row.last_report_summary ?? undefined,
    requested_at: row.requested_at,
    status: row.status,
    claimed_by: row.claimed_by ? uuidToLegacySync(row.claimed_by) : undefined,
    claimed_at: row.claimed_at ?? undefined,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("student_requests")
      .select("*")
      .order("requested_at", { ascending: false });
    if (error) {
      console.error("[student-requests-store] failed to load student_requests", error);
      hydratePromise = null;
      return;
    }
    cache = (data ?? []).map(mapRow);
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate();
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("student-requests-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "student_requests" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly — `loadStudentRequests()` and the monthly
  // quota counters are called synchronously inside render logic, so the
  // cache needs to be warm as early as possible.
  void hydrate();
  ensureRealtime();
}

/** Ids whose escalation is being (or has been) persisted this session, to
 *  avoid firing a duplicate Supabase UPDATE on every read/render. */
const escalationInFlight = new Set<string>();

/** Applies time-based auto-escalation on read so consumers always see the
 *  right status without a background job. The status flip is applied to the
 *  cache synchronously; the Supabase UPDATE persisting it fires at most once
 *  per row per session (retried on a later read only if it errored). */
export function loadStudentRequests(): StudentRequest[] {
  const now = Date.now();
  let changed = false;
  const next = cache.map((r) => {
    if (r.status !== "open") return r;
    if (now - +new Date(r.requested_at) >= UNCLAIMED_ESCALATE_MS) {
      changed = true;
      return { ...r, status: "escalated" as const };
    }
    return r;
  });
  if (changed) {
    cache = next;
    for (const r of next) {
      if (r.status !== "escalated") continue;
      if (r.id.startsWith("temp-")) continue; // not persisted yet, nothing to update
      if (escalationInFlight.has(r.id)) continue;
      escalationInFlight.add(r.id);
      void supabase
        .from("student_requests")
        .update({ status: "escalated" })
        .eq("id", Number(r.id))
        .then(({ error }) => {
          if (error) {
            console.error("[student-requests-store] failed to persist escalation", error);
            escalationInFlight.delete(r.id); // allow retry on a future read
          }
        });
    }
    notify();
  }
  return cache;
}

export function subscribeStudentRequests(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

export function addStudentRequest(
  input: Omit<StudentRequest, "id" | "requested_at" | "status">,
): StudentRequest {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const req: StudentRequest = {
    ...input,
    id: tempId,
    requested_at: new Date().toISOString(),
    status: "open",
  };
  // Optimistic: prepend to the cache + notify, persist in background.
  cache = [req, ...cache];
  notify();

  void (async () => {
    const [studentUuid, assignedUuid] = await Promise.all([
      legacyToUuid(input.student_id),
      input.assigned_teacher_id ? legacyToUuid(input.assigned_teacher_id) : Promise.resolve(null),
    ]);
    if (!studentUuid) {
      console.error("[student-requests-store] cannot persist request — unresolved student id", {
        studentId: input.student_id,
      });
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("student_requests")
      .insert({
        kind: input.kind,
        student_id: studentUuid,
        assigned_teacher_id: assignedUuid ?? null,
        origin_session_id: input.origin_session_id ? Number(input.origin_session_id) : null,
        proposed_datetime: input.proposed_datetime,
        duration_minutes: input.duration_minutes,
        spotlight_context: input.spotlight_context ?? null,
        last_report_summary: input.last_report_summary ?? null,
        requested_at: req.requested_at,
        status: "open",
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[student-requests-store] failed to save request", error);
      // Rollback: a request that silently failed to persist must not sit in
      // the local UI as if it worked.
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    const saved = mapRow(data);
    cache = cache.map((r) => (r.id === tempId ? saved : r));
    notify();
  })();

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
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();
  const req: StudentRequest = {
    id: tempId,
    kind: "spotlight",
    student_id: input.student_id,
    assigned_teacher_id: input.teacher_id,
    proposed_datetime: input.proposed_datetime,
    duration_minutes: input.duration_minutes,
    spotlight_context: input.spotlight_context,
    requested_at: nowIso,
    status: "assigned",
    claimed_by: input.teacher_id,
    claimed_at: nowIso,
  };
  // Optimistic so the monthly-cap counters reflect it immediately.
  cache = [req, ...cache];
  notify();

  void (async () => {
    const [studentUuid, teacherUuid] = await Promise.all([
      legacyToUuid(input.student_id),
      legacyToUuid(input.teacher_id),
    ]);
    if (!studentUuid || !teacherUuid) {
      console.error(
        "[student-requests-store] cannot persist spotlight conversion — unresolved ids",
        {
          studentId: input.student_id,
          teacherId: input.teacher_id,
        },
      );
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("student_requests")
      .insert({
        kind: "spotlight",
        student_id: studentUuid,
        assigned_teacher_id: teacherUuid,
        origin_session_id: null,
        proposed_datetime: input.proposed_datetime,
        duration_minutes: input.duration_minutes,
        spotlight_context: input.spotlight_context,
        last_report_summary: null,
        requested_at: nowIso,
        status: "assigned",
        claimed_by: teacherUuid,
        claimed_at: nowIso,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[student-requests-store] failed to save spotlight conversion", error);
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    const saved = mapRow(data);
    cache = cache.map((r) => (r.id === tempId ? saved : r));
    notify();
  })();
}

/** Shared body of claim/assign: optimistic cache flip + session
 *  materialization + background persistence of the status change. */
function transitionRequest(
  id: string,
  teacherId: string,
  newStatus: "claimed" | "assigned",
): StudentRequest | null {
  const idx = cache.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const r = cache[idx];
  if (r.status !== "open" && r.status !== "escalated") return null;
  // Extremely unlikely race: the request hasn't finished persisting yet, so
  // there's no DB row to claim. Fail gracefully instead of half-claiming.
  if (id.startsWith("temp-")) return null;
  const claimedAt = new Date().toISOString();
  const updated: StudentRequest = {
    ...r,
    status: newStatus,
    claimed_by: teacherId,
    claimed_at: claimedAt,
  };
  cache = cache.map((x) => (x.id === id ? updated : x));
  notify();
  // Materialize the actual session in the shared sessions-store so it shows
  // on both calendars immediately.
  requireHelpers().addClaimedSession(updated);

  void (async () => {
    const teacherUuid = await legacyToUuid(teacherId);
    if (!teacherUuid) {
      console.error("[student-requests-store] cannot persist claim — unresolved teacher id", {
        teacherId,
        requestId: id,
      });
      return;
    }
    const { error } = await supabase
      .from("student_requests")
      .update({ status: newStatus, claimed_by: teacherUuid, claimed_at: claimedAt })
      .eq("id", Number(id));
    if (error) {
      console.error("[student-requests-store] failed to persist claim", error);
    }
  })();

  return updated;
}

export function claimStudentRequest(id: string, teacherId: string): StudentRequest | null {
  return transitionRequest(id, teacherId, "claimed");
}

export function adminAssignRequest(id: string, teacherId: string): StudentRequest | null {
  return transitionRequest(id, teacherId, "assigned");
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
export function fairRotationCandidates(
  qualifiedTeacherIds: string[],
): { teacherId: string; load: number }[] {
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
  const y = now.getFullYear(),
    m = now.getMonth();
  const inMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  const reqs = loadStudentRequests().filter(
    (r) =>
      r.kind === "reschedule" &&
      r.student_id === studentId &&
      r.status !== "cancelled" &&
      inMonth(r.requested_at),
  ).length;
  return reqs;
}

/** Spotlight requests submitted in the current calendar month for a student. */
export function spotlightRequestsThisMonth(studentId: string): number {
  const now = new Date();
  const y = now.getFullYear(),
    m = now.getMonth();
  const inMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };
  return loadStudentRequests().filter(
    (r) =>
      r.kind === "spotlight" &&
      r.student_id === studentId &&
      r.status !== "cancelled" &&
      inMonth(r.requested_at),
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
      const link =
        getStudentVideoLink(req.student_id) ||
        `https://teams.microsoft.com/l/meetup/${req.student_id}`;
      const status: ExtSessionStatus = "scheduled";
      createSession({
        student_id: req.student_id,
        teacher_id: teacherId,
        date_time: req.proposed_datetime,
        duration_minutes: req.duration_minutes,
        teams_link: link,
        status,
        origin: req.kind === "spotlight" ? "spotlight" : undefined,
        notes:
          req.kind === "spotlight"
            ? `Spotlight Session — ${req.spotlight_context ?? ""}`
            : `Reschedule — original ${req.origin_session_id}`,
      });
      // For reschedules: mark the original session cancelled (Cancel-only path
      // already handled that; this branch is used when the student picked
      // "Reschedule").
      if (req.kind === "reschedule" && req.origin_session_id) {
        updateSession(req.origin_session_id, { status: "cancelled" as const });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Spotlight overlap → Converted to Spotlight.
// ---------------------------------------------------------------------------
/** Converts the student's own overlapping 1:1 session into a Spotlight
 *  session in the same slot. Previously did this as 3 separate direct
 *  client writes (updateSession + createSession + adjustRemainingSessions
 *  elsewhere), every one of which RLS rejects for a student caller — the
 *  UPDATE silently, the INSERT visibly. Now a single call into the
 *  `student_convert_session_to_spotlight` RPC (see sessions-store.ts),
 *  which does the status flip, the new-session insert, AND the +1 credit
 *  refund atomically and server-validated. Returns false (and leaves
 *  everything unchanged) if the RPC rejects the request — e.g. the session
 *  isn't the caller's own, or it's a group session (not supported by this
 *  flow yet — see groups-store.ts migration notes). */
export async function convertSessionToSpotlight(input: {
  originalSessionId: string;
  spotlightContext: string;
}): Promise<boolean> {
  const sessions = loadSessions();
  const orig = sessions.find((s) => s.id === input.originalSessionId);
  if (!orig) return false;

  const newId = await convertOwnSessionToSpotlight(input.originalSessionId, input.spotlightContext);
  if (!newId) return false;

  recordSpotlightConversion({
    student_id: orig.student_id,
    teacher_id: orig.teacher_id,
    proposed_datetime: orig.date_time,
    duration_minutes: Math.min(60, orig.duration_minutes),
    spotlight_context: input.spotlightContext,
  });
  return true;
}
