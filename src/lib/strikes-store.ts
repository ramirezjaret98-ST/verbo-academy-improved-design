// ============================================================================
// Teacher cancellation strikes — persisted ledger driving:
//   - the 6th KPI signal "Cancellations / No-Shows" (see teacher-kpis.ts)
//   - the "X/3 Strikes (6 months)" badge on Admin > Teachers cards
//   - the automatic Freeze applied at 3 unjustified strikes in a 6-month
//     rolling window
//   - the "Needs Substitute" flag surfaced to Admin when a teacher cancels
//     with <24h notice.
//
// This module also owns the "Can't Attend" cancel action so that
// sessions-store stays free of strike / freeze knowledge and no circular
// imports appear.
// ============================================================================
import { USERS } from "./mock-data";
import { loadSessions, persistSessions, type ExtSession } from "./sessions-store";

export type CancelReason = "illness" | "personal" | "major_issue" | "other";
export type JustificationCause = "evidence_provided" | "force_majeure" | "illness";

export interface Strike {
  id: string;
  teacher_id: string;
  session_id: string;
  reason: CancelReason;
  note?: string;
  /** Name of the attached medical note file when reason === "illness". */
  medical_note_name?: string;
  created_at: string; // ISO
  /** True iff cancellation happened with <24h notice. */
  needs_substitute?: boolean;
  /** Set by Admin when a substitute was found (used for <24h payroll logic). */
  substitute_found?: boolean;
  justified?: boolean;
  justification_cause?: JustificationCause;
  justified_at?: string;
}

export const STRIKES_KEY = "verbo:teacher-strikes";
export const STRIKES_EVENT = "verbo:teacher-strikes-updated";
export const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
/** localStorage key already used by admin.teachers.tsx for teacher overrides. */
const PROFILE_KEY = "verbo:teacher-profile-overrides";

export function loadStrikes(): Strike[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STRIKES_KEY) || "[]") as Strike[]; }
  catch { return []; }
}

export function persistStrikes(list: Strike[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STRIKES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(STRIKES_EVENT));
  } catch { /* noop */ }
}

export function subscribeStrikes(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === STRIKES_KEY) cb(); };
  window.addEventListener(STRIKES_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STRIKES_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Strikes still counting toward the 3-in-6-months rule for a teacher. */
export function activeStrikes(teacherId: string, now = Date.now()): Strike[] {
  const cutoff = now - SIX_MONTHS_MS;
  return loadStrikes().filter(
    (s) => s.teacher_id === teacherId && !s.justified && +new Date(s.created_at) >= cutoff,
  );
}

export function activeStrikeCount(teacherId: string, now = Date.now()): number {
  return activeStrikes(teacherId, now).length;
}

/** All strikes (justified or not) in the 6-month window — used by Admin lists. */
export function recentStrikes(teacherId: string, now = Date.now()): Strike[] {
  const cutoff = now - SIX_MONTHS_MS;
  return loadStrikes()
    .filter((s) => s.teacher_id === teacherId && +new Date(s.created_at) >= cutoff)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
function writeProfileOverride(teacherId: string, patch: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[teacherId] = { ...(map[teacherId] || {}), ...patch };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(map));
  } catch { /* noop */ }
}

function autoFreezeIfNeeded(teacherId: string) {
  if (activeStrikeCount(teacherId) < 3) return;
  const u = USERS.find((x) => x.id === teacherId && x.role === "teacher");
  if (!u) return;
  if ((u.teacher_status ?? "active") === "frozen") return;
  u.teacher_status = "frozen";
  writeProfileOverride(teacherId, { teacher_status: "frozen" });
}

/** Full "Can't Attend" cancellation action for Performance Sessions.
 *  Marks the session cancelled (cause: teacher), records a strike, and
 *  tags the session as needing a substitute when notice is <24h.
 *  Auto-freezes the teacher on the 3rd active strike. */
export function cancelSessionByTeacher(input: {
  sessionId: string;
  teacherId: string;
  reason: CancelReason;
  note?: string;
  medicalNoteName?: string;
  now?: number;
}): { strike: Strike; session: ExtSession | null; needsSubstitute: boolean } {
  const now = input.now ?? Date.now();
  const sessions = loadSessions();
  const target = sessions.find((s) => s.id === input.sessionId) ?? null;
  const startsAt = target ? +new Date(target.date_time) : now;
  const needsSubstitute = startsAt - now < 24 * 60 * 60 * 1000;

  if (target) {
    const next: ExtSession = {
      ...target,
      status: "cancelled",
      absent_cause: "teacher",
      cancellation_reason: input.reason,
      cancellation_note: input.note,
      needs_substitute: needsSubstitute,
    };
    persistSessions(sessions.map((s) => (s.id === input.sessionId ? next : s)));
  }

  const strike: Strike = {
    id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    teacher_id: input.teacherId,
    session_id: input.sessionId,
    reason: input.reason,
    note: input.note,
    medical_note_name: input.medicalNoteName,
    created_at: new Date(now).toISOString(),
    needs_substitute: needsSubstitute,
  };
  persistStrikes([strike, ...loadStrikes()]);
  autoFreezeIfNeeded(input.teacherId);

  return { strike, session: target, needsSubstitute };
}

export function justifyStrike(strikeId: string, cause: JustificationCause) {
  const next = loadStrikes().map((s) =>
    s.id === strikeId
      ? { ...s, justified: true, justification_cause: cause, justified_at: new Date().toISOString() }
      : s,
  );
  persistStrikes(next);
}

export function markSubstituteFound(strikeId: string, found: boolean) {
  const next = loadStrikes().map((s) => (s.id === strikeId ? { ...s, substitute_found: found } : s));
  persistStrikes(next);
}

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  illness: "Illness",
  personal: "Personal",
  major_issue: "Major Issue",
  other: "Other",
};

export const JUSTIFICATION_LABEL: Record<JustificationCause, string> = {
  evidence_provided: "Evidence Provided",
  force_majeure: "Force Majeure",
  illness: "Illness",
};