// Shared student profile store.
//
// The admin Students view persists per-student profile edits (including the
// Video Call Link) as overrides in localStorage and mutates the in-memory
// USERS singleton. This module exposes the SAME underlying data so other
// views (e.g. Sessions) read and write the exact same field instead of
// duplicating it. Editing the link here reflects in Students and vice-versa.
import {
  USERS,
  ASSIGNMENTS,
  type User,
  type ChallengeSubmission,
  type ChallengeSubmissionFormat,
} from "./mock-data";
import { loadChallenges } from "./challenges-store";
import { loadFlashChallenges } from "./flash-challenges-store";
import { addStudentReport } from "./student-reports-store";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { legacyToUuid } from "@/lib/user-id-bridge";

export type { ChallengeSubmission, ChallengeSubmissionFormat };

// NOTE: these keys must match the ones used by src/routes/admin.students.tsx
export const PROFILE_KEY = "verbo:student-profile-overrides";
export const REGISTERED_KEY = "verbo:registered-students";
export const STUDENTS_EVENT = "verbo:students-updated";

function readProfileOverrides(): Record<string, Partial<User>> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); } catch { return {}; }
}
function writeProfileOverrides(map: Record<string, Partial<User>>) {
  if (typeof window !== "undefined") localStorage.setItem(PROFILE_KEY, JSON.stringify(map));
}
function readRegisteredStudents(): User[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REGISTERED_KEY) || "[]"); } catch { return []; }
}

/** The STUDENT-side profile/commercial slice of `User` that is backed by the
 *  real `public.app_users` table (same field names as the DB columns). This is
 *  a strict subset shape of `Partial<User>` — keep the types in sync with the
 *  `User` interface in mock-data.ts. */
export interface StudentProfileFields {
  current_level?: string;
  attendance_percentage?: number;
  company?: string;
  member_since?: string;
  hired_sessions?: number;
  remaining_sessions?: number;
  product?: "enterprise" | "go" | "international" | "vip";
  focus?: string;
  access_plan?: "Core" | "Advance" | "Elite" | "Signature";
  contracted_levels?: string[];
  current_roadmap_level?: string;
  reopened_levels?: string[];
  sessions_per_week?: number;
  session_duration?: number;
  reschedule_policy?: string;
  reschedule_custom_hours?: number;
  reschedule_custom_pct?: number;
  payment_day?: number;
  cycle_start?: string;
  next_payment?: string;
  video_call_link?: string;
  status?: "active" | "suspended" | "frozen";
  insights_strikes?: number;
  bookclub_strikes?: number;
  sessions_auto?: boolean;
  admin_notes?: string;
  freeze_start?: string;
  freeze_end?: string;
  product_type?: "performance" | "workshops" | "insights";
  addon_insights_per_month?: number;
  addon_bookclubs_per_month?: number;
  addon_spotlight_per_month?: number;
  addon_workshops_enabled?: boolean;
  /** Login gate — reused by "Require Password Reset" in the admin form. */
  must_change_password?: boolean;
}

/** Every DB-backed student profile field — the ONLY keys ever sent to the
 *  `app_users` UPDATE (extra keys a caller may sneak in via a cast, e.g.
 *  `password` or Challenges state, are filtered out so PostgREST never sees an
 *  unknown column). */
const STUDENT_PROFILE_FIELD_KEYS: (keyof StudentProfileFields)[] = [
  "must_change_password",
  "current_level",
  "attendance_percentage",
  "company",
  "member_since",
  "hired_sessions",
  "remaining_sessions",
  "product",
  "focus",
  "access_plan",
  "contracted_levels",
  "current_roadmap_level",
  "reopened_levels",
  "sessions_per_week",
  "session_duration",
  "reschedule_policy",
  "reschedule_custom_hours",
  "reschedule_custom_pct",
  "payment_day",
  "cycle_start",
  "next_payment",
  "video_call_link",
  "status",
  "insights_strikes",
  "bookclub_strikes",
  "sessions_auto",
  "admin_notes",
  "freeze_start",
  "freeze_end",
  "product_type",
  "addon_insights_per_month",
  "addon_bookclubs_per_month",
  "addon_spotlight_per_month",
  "addon_workshops_enabled",
];

type AppUsersUpdate = Database["public"]["Tables"]["app_users"]["Update"];

/** Patch a student's DB-backed profile fields. Optimistic: mutates the USERS
 *  singleton + broadcasts immediately, then persists to Supabase in the
 *  background (or to the legacy localStorage override map when the student has
 *  no real `app_users` row yet — e.g. locally-registered demo students). */
export function patchStudentProfile(studentId: string, patch: Partial<StudentProfileFields>): void {
  const u = USERS.find((x) => x.id === studentId);
  // Shallow snapshot of the previous values so a failed Supabase write can
  // roll the optimistic mutation back.
  const prev: Record<string, unknown> = {};
  if (u) {
    for (const key of Object.keys(patch)) {
      prev[key] = (u as unknown as Record<string, unknown>)[key];
    }
    prev.hired_plan = u.hired_plan;
    Object.assign(u, patch);
    // Legacy display-only alias — mirrored locally, never sent to Supabase.
    if (patch.access_plan !== undefined) u.hired_plan = patch.access_plan;
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDENTS_EVENT));

  void (async () => {
    const uuid = await legacyToUuid(studentId);
    if (uuid === null) {
      // No real app_users row (locally-registered-only student) — keep the
      // old localStorage-override persistence path working exactly as today.
      const overrides = readProfileOverrides();
      const merged: Record<string, unknown> = { ...(overrides[studentId] ?? {}), ...patch };
      delete merged.hired_plan;
      overrides[studentId] = merged as Partial<User>;
      writeProfileOverrides(overrides);
      return;
    }
    const dbPatch: AppUsersUpdate = {};
    for (const key of STUDENT_PROFILE_FIELD_KEYS) {
      if (key in patch) {
        (dbPatch as Record<string, unknown>)[key] = (patch as Record<string, unknown>)[key];
      }
    }
    const { error } = await supabase.from("app_users").update(dbPatch).eq("id", uuid);
    if (error) {
      console.error("[students-store] failed to save profile", error);
      if (u) Object.assign(u, prev);
      window.dispatchEvent(new CustomEvent(STUDENTS_EVENT));
    }
  })();
}

// Apply persisted overrides + locally-registered students onto the USERS
// singleton, then refresh the DB-backed student profile fields from Supabase
// in the background. Idempotent — safe to call on every mount.
export function hydrateStudents() {
  if (typeof window === "undefined") return;
  const overrides = readProfileOverrides();
  USERS.forEach((u) => { if (overrides[u.id]) Object.assign(u, overrides[u.id]); });
  readRegisteredStudents().forEach((u) => {
    if (!USERS.find((x) => x.id === u.id)) USERS.push(u);
  });
  void (async () => {
    // `app_users` SELECT RLS only allows a row's own id or admin — a teacher
    // does NOT see their roster's rows this way (on purpose: the schema
    // exposes that column-limited slice only via the student_profile_for_teacher
    // RPC, which hides admin/financial fields — see Lote 10 notes). So this
    // fetches BOTH sources and merges them: select("*") covers self (any
    // role) and, for admin, every student; the RPC covers a teacher's own
    // roster with its narrower column set. For a student or admin caller the
    // RPC's own WHERE clause just returns 0 rows / a harmless redundant
    // superset, respectively — no need to branch on the caller's role here.
    const [selectRes, rpcRes] = await Promise.all([
      supabase.from("app_users").select("*"),
      supabase.rpc("student_profile_for_teacher"),
    ]);
    if (selectRes.error) {
      console.error("[students-store] failed to load app_users profiles", selectRes.error);
    }
    if (rpcRes.error) {
      console.error("[students-store] failed to load teacher roster profiles", rpcRes.error);
    }
    const applyRow = (row: Record<string, unknown>) => {
      const legacyId = row.legacy_id;
      if (typeof legacyId !== "string" || !legacyId) return;
      const u = USERS.find((x) => x.id === legacyId);
      if (!u) return;
      for (const key of STUDENT_PROFILE_FIELD_KEYS) {
        const value = row[key];
        // Only assign non-null/known DB values so a column this row's source
        // doesn't return (RPC) or hasn't been backfilled yet doesn't clobber
        // a mock demo default.
        if (value !== null && value !== undefined) {
          (u as unknown as Record<string, unknown>)[key] = value;
        }
      }
      if (row.access_plan) u.hired_plan = row.access_plan as typeof u.hired_plan;
    };
    for (const row of selectRes.data ?? []) applyRow(row as unknown as Record<string, unknown>);
    for (const row of rpcRes.data ?? []) applyRow(row as unknown as Record<string, unknown>);
    if (!selectRes.error || !rpcRes.error) {
      window.dispatchEvent(new CustomEvent(STUDENTS_EVENT));
    }
  })();
}

export function getStudentVideoLink(studentId: string): string {
  const u = USERS.find((x) => x.id === studentId);
  return u?.video_call_link ?? "";
}

// Update a student's video call link — the single shared field. Optimistically
// mutates USERS + broadcasts, then persists to Supabase (or the local
// fallback) via patchStudentProfile.
export function setStudentVideoLink(studentId: string, link: string) {
  patchStudentProfile(studentId, { video_call_link: link });
}

/** Adjust an individual student's remaining_sessions by `delta` (can be negative).
 *  Result is clamped to [0, hired_sessions]. Persists via patchStudentProfile
 *  and broadcasts STUDENTS_EVENT. */
export function adjustRemainingSessions(studentId: string, delta: number) {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return;
  const hired = u.hired_sessions ?? 0;
  const current = u.remaining_sessions ?? 0;
  const next = Math.max(0, Math.min(hired, current + delta));
  patchStudentProfile(studentId, { remaining_sessions: next });
}

/** Toggle a completed level into "Reopened for Review" (read-only student access). */
export function setLevelReopened(studentId: string, levelName: string, on: boolean) {
  const u = USERS.find((x) => x.id === studentId);
  const current = u?.reopened_levels ?? [];
  const next = on
    ? Array.from(new Set([...current, levelName]))
    : current.filter((n) => n !== levelName);
  patchStudentProfile(studentId, { reopened_levels: next });
}

export function getReopenedLevels(studentId: string): string[] {
  return USERS.find((x) => x.id === studentId)?.reopened_levels ?? [];
}

/* -------------------------------------------------------------------------- */
/* Challenges: chosen + completed, with streak tracking.                       */
/* -------------------------------------------------------------------------- */

function persistStudentPatch(studentId: string, patch: Partial<User>) {
  const u = USERS.find((x) => x.id === studentId);
  if (u) Object.assign(u, patch);
  if (typeof window === "undefined") return;
  const overrides = readProfileOverrides();
  overrides[studentId] = { ...(overrides[studentId] ?? {}), ...patch };
  writeProfileOverrides(overrides);
  window.dispatchEvent(new CustomEvent(STUDENTS_EVENT));
}

/** Add a challenge to `chosen_challenges` (idempotent). Returns true if this
 *  was the first time this student picks that challenge — the caller can then
 *  fire the teacher notification once. */
export function chooseChallenge(studentId: string, challengeId: string): boolean {
  const u = USERS.find((x) => x.id === studentId);
  const list = u?.chosen_challenges ?? [];
  if (list.some((c) => c.challenge_id === challengeId)) return false;
  persistStudentPatch(studentId, {
    chosen_challenges: [...list, { challenge_id: challengeId, chosen_at: new Date().toISOString() }],
  });
  return true;
}

export function hasChosenChallenge(studentId: string, challengeId: string): boolean {
  const u = USERS.find((x) => x.id === studentId);
  return (u?.chosen_challenges ?? []).some((c) => c.challenge_id === challengeId);
}

export function hasCompletedChallenge(studentId: string, challengeId: string): boolean {
  const u = USERS.find((x) => x.id === studentId);
  return (u?.completed_challenges ?? []).some((c) => c.challenge_id === challengeId);
}

/** Milliseconds between allowed "Mark as Completed" actions per student. */
export const COMPLETE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Returns null if the student may complete a challenge now, or the number of
 *  milliseconds remaining before the 24-hour cooldown expires. */
export function completeCooldownRemaining(studentId: string): number | null {
  const u = USERS.find((x) => x.id === studentId);
  if (!u?.last_completed_at) return null;
  const elapsed = Date.now() - +new Date(u.last_completed_at);
  const remaining = COMPLETE_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : null;
}

/** Mark a challenge as completed. Idempotent + updates streak counters using
 *  the same "≤14 days keeps the streak alive" rule used elsewhere. Enforces a
 *  24-hour cooldown between completions — returns false if blocked. */
export function completeChallenge(studentId: string, challengeId: string): boolean {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return false;
  const done = u.completed_challenges ?? [];
  if (done.some((c) => c.challenge_id === challengeId)) return false;
  if (completeCooldownRemaining(studentId) !== null) return false;

  const now = new Date();
  const nowIso = now.toISOString();
  const last = u.last_completed_at ? new Date(u.last_completed_at) : null;
  const diffDays = last ? (now.getTime() - last.getTime()) / 86_400_000 : Infinity;
  const nextCurrent = last && diffDays <= 14 ? (u.current_streak ?? 0) + 1 : 1;
  const nextLongest = Math.max(u.longest_streak ?? 0, nextCurrent);

  persistStudentPatch(studentId, {
    completed_challenges: [...done, { challenge_id: challengeId, completed_at: nowIso }],
    last_completed_at: nowIso,
    current_streak: nextCurrent,
    longest_streak: nextLongest,
  });
  return true;
}

/** Set / update the shared_link on a completed-challenge entry. `shared_at` is
 *  set exactly ONCE (the first time the link goes from empty → non-empty) and
 *  is preserved on every subsequent edit so the teacher notification never
 *  re-fires. */
export function shareChallengeResult(
  studentId: string,
  challengeId: string,
  link: string,
): void {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return;
  const list = u.completed_challenges ?? [];
  const idx = list.findIndex((c) => c.challenge_id === challengeId);
  if (idx < 0) return;
  const trimmed = link.trim();
  const prev = list[idx];
  const next = [...list];
  next[idx] = {
    ...prev,
    shared_link: trimmed || undefined,
    shared_at: prev.shared_at ?? (trimmed ? new Date().toISOString() : undefined),
  };
  persistStudentPatch(studentId, { completed_challenges: next });
}

export function getSharedResult(studentId: string, challengeId: string): string {
  const u = USERS.find((x) => x.id === studentId);
  const entry = (u?.completed_challenges ?? []).find((c) => c.challenge_id === challengeId);
  return entry?.shared_link ?? "";
}
/* -------------------------------------------------------------------------- */
/* Lightning (Verbo Flash) — completion is INDEPENDENT from the traditional     */
/* 24h cooldown. Tracks its own last_lightning_completed_at + counter for the   */
/* Lightning Bolt badge.                                                        */
/* -------------------------------------------------------------------------- */

/** Complete a Lightning challenge. No cross-cooldown with the traditional bank:
 *  a student may complete both a Lightning and a normal challenge in the same
 *  24h window. Idempotent per challenge id. */
export function completeLightningChallenge(studentId: string, challengeId: string): boolean {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return false;
  const done = u.completed_challenges ?? [];
  if (done.some((c) => c.challenge_id === challengeId)) return false;

  const nowIso = new Date().toISOString();
  persistStudentPatch(studentId, {
    completed_challenges: [
      ...done,
      { challenge_id: challengeId, completed_at: nowIso, format: "lightning" },
    ],
    last_lightning_completed_at: nowIso,
    lightning_completions: (u.lightning_completions ?? 0) + 1,
  });
  return true;
}




/* -------------------------------------------------------------------------- */
/* Mystery Box (Verbo Flash) — 24h cooldown independent from challenge          */
/* completion. Tracks last_mystery_box_opened_at per student.                   */
/* -------------------------------------------------------------------------- */

export const MYSTERY_BOX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function mysteryBoxCooldownRemaining(studentId: string): number | null {
  const u = USERS.find((x) => x.id === studentId);
  if (!u?.last_mystery_box_opened_at) return null;
  const elapsed = Date.now() - +new Date(u.last_mystery_box_opened_at);
  const remaining = MYSTERY_BOX_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : null;
}

/** Attempt to open today's Mystery Box. Returns true if the cooldown allowed
 *  it (and stamps the open time), false if still on cooldown. */
export function openMysteryBox(studentId: string): boolean {
  if (mysteryBoxCooldownRemaining(studentId) !== null) return false;
  persistStudentPatch(studentId, { last_mystery_box_opened_at: new Date().toISOString() });
  return true;
}

/** The challenge already revealed by the Mystery Box and still pending
 *  completion, if any. Lets a student reopen the box to see/complete it
 *  without a new draw and without hitting the 24h cooldown. */
export function activeMysteryBoxPick(studentId: string): string | null {
  const u = USERS.find((x) => x.id === studentId);
  const pick = u?.mystery_box_pick_id;
  if (!pick) return null;
  return hasCompletedChallenge(studentId, pick) ? null : pick;
}

/** Persist the challenge drawn by the Mystery Box as the active pick. */
export function setMysteryBoxPick(studentId: string, challengeId: string): void {
  persistStudentPatch(studentId, { mystery_box_pick_id: challengeId });
}

/* -------------------------------------------------------------------------- */
/* Season (Verbo Flash) — per-season 24h cooldown, independent from Mystery    */
/* Box, Lightning and other Seasons. Also tracks completion counter per        */
/* season for the dynamic {Season} Challenger badge.                           */
/* -------------------------------------------------------------------------- */

export const SEASON_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function seasonCooldownRemaining(studentId: string, seasonId: string): number | null {
  const u = USERS.find((x) => x.id === studentId);
  const last = u?.last_season_opened_at?.[seasonId];
  if (!last) return null;
  const remaining = SEASON_COOLDOWN_MS - (Date.now() - +new Date(last));
  return remaining > 0 ? remaining : null;
}

export function openSeason(studentId: string, seasonId: string): boolean {
  if (seasonCooldownRemaining(studentId, seasonId) !== null) return false;
  const u = USERS.find((x) => x.id === studentId);
  const map = { ...(u?.last_season_opened_at ?? {}), [seasonId]: new Date().toISOString() };
  persistStudentPatch(studentId, { last_season_opened_at: map });
  return true;
}

/** Complete a Season-revealed challenge. Independent from Mystery Box /
 *  Lightning cooldowns. Increments per-season counter used to award the
 *  {display_name} Challenger badge. Idempotent per challenge id. */
export function completeSeasonChallenge(
  studentId: string,
  challengeId: string,
  seasonId: string,
): boolean {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return false;
  const done = u.completed_challenges ?? [];
  if (done.some((c) => c.challenge_id === challengeId)) return false;
  const nowIso = new Date().toISOString();
  const counts = { ...(u.season_completions ?? {}) };
  counts[seasonId] = (counts[seasonId] ?? 0) + 1;
  persistStudentPatch(studentId, {
    completed_challenges: [
      ...done,
      { challenge_id: challengeId, completed_at: nowIso },
    ],
    season_completions: counts,
  });
  return true;
}




/* -------------------------------------------------------------------------- */
/* Challenge submissions (Etapa 2) — the student never completes a challenge   */
/* directly anymore: they SUBMIT a delivery that a teacher reviews.            */
/* completeChallenge / completeLightningChallenge / completeSeasonChallenge     */
/* stay in this file untouched — Etapa 3's approveSubmission will call them.    */
/* -------------------------------------------------------------------------- */

export function getSubmission(
  studentId: string,
  challengeId: string,
): ChallengeSubmission | null {
  const u = USERS.find((x) => x.id === studentId);
  return (u?.challenge_submissions ?? []).find((s) => s.challenge_id === challengeId) ?? null;
}

/** Create a submission for a challenge (status "pending_review").
 *
 *  - "normal" / "mystery_box": enforces the same 24h cooldown as
 *    completeCooldownRemaining and advances the streak counters right away with
 *    the same "≤14 days keeps the streak alive" rule, storing the pre-change
 *    current_streak in `streak_before`.
 *  - "lightning" / "season": no counters are touched here — those move to the
 *    teacher approval step in Etapa 3.
 *
 *  Returns false if blocked (unknown student, cooldown, or already submitted). */
export function submitChallenge(
  studentId: string,
  challengeId: string,
  format: ChallengeSubmissionFormat,
  link: string,
  note?: string,
): boolean {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return false;
  const list = u.challenge_submissions ?? [];
  if (list.some((s) => s.challenge_id === challengeId)) return false;

  const streakFormat = format === "normal" || format === "mystery_box";
  if (streakFormat && completeCooldownRemaining(studentId) !== null) return false;

  const now = new Date();
  const nowIso = now.toISOString();
  const submission: ChallengeSubmission = {
    challenge_id: challengeId,
    challenge_format: format,
    status: "pending_review",
    link: link.trim(),
    note: note?.trim() || undefined,
    submitted_at: nowIso,
    history: [],
  };

  const patch: Partial<User> = {};
  if (streakFormat) {
    const last = u.last_completed_at ? new Date(u.last_completed_at) : null;
    const diffDays = last ? (now.getTime() - last.getTime()) / 86_400_000 : Infinity;
    const nextCurrent = last && diffDays <= 14 ? (u.current_streak ?? 0) + 1 : 1;
    submission.streak_before = u.current_streak ?? 0;
    patch.last_completed_at = nowIso;
    patch.current_streak = nextCurrent;
    patch.longest_streak = Math.max(u.longest_streak ?? 0, nextCurrent);
  }

  persistStudentPatch(studentId, {
    ...patch,
    challenge_submissions: [...list, submission],
  });
  return true;
}

/** Replace the delivery of a submission the teacher sent back. Only valid while
 *  the current status is "needs_resubmission". Archives the previous attempt in
 *  `history` and returns the submission to "pending_review". Streak untouched. */
export function resubmitChallenge(
  studentId: string,
  challengeId: string,
  link: string,
  note?: string,
): boolean {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return false;
  const list = u.challenge_submissions ?? [];
  const idx = list.findIndex((s) => s.challenge_id === challengeId);
  if (idx < 0) return false;
  const prev = list[idx];
  if (prev.status !== "needs_resubmission") return false;

  const nowIso = new Date().toISOString();
  const next = [...list];
  next[idx] = {
    ...prev,
    status: "pending_review",
    link: link.trim(),
    note: note?.trim() || undefined,
    submitted_at: nowIso,
    history: [
      ...prev.history,
      { link: prev.link, note: prev.note, submitted_at: prev.submitted_at },
    ],
    reviewed_at: undefined,
    reviewer_id: undefined,
    teacher_feedback: undefined,
  };
  persistStudentPatch(studentId, { challenge_submissions: next });
  return true;
}

/* -------------------------------------------------------------------------- */
/* Teacher review of submissions (Etapa 3).                                    */
/* Approval is the ONLY path that awards completion / counters — it delegates   */
/* to the existing complete* functions instead of duplicating their logic.      */
/* -------------------------------------------------------------------------- */

function patchSubmission(
  studentId: string,
  challengeId: string,
  patch: Partial<ChallengeSubmission>,
): ChallengeSubmission | null {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return null;
  const list = u.challenge_submissions ?? [];
  const idx = list.findIndex((s) => s.challenge_id === challengeId);
  if (idx < 0) return null;
  const next = [...list];
  next[idx] = { ...list[idx], ...patch };
  persistStudentPatch(studentId, { challenge_submissions: next });
  return next[idx];
}

/** Approve a delivery: marks the submission approved and applies exactly the
 *  completion effects of the matching format by reusing completeChallenge /
 *  completeLightningChallenge / completeSeasonChallenge. */
export function approveSubmission(
  studentId: string,
  challengeId: string,
  teacherId: string,
): boolean {
  const sub = getSubmission(studentId, challengeId);
  if (!sub) return false;

  const nowIso = new Date().toISOString();
  patchSubmission(studentId, challengeId, {
    status: "approved",
    reviewer_id: teacherId,
    reviewed_at: nowIso,
    teacher_feedback: undefined,
  });

  if (sub.challenge_format === "lightning") {
    completeLightningChallenge(studentId, challengeId);
  } else if (sub.challenge_format === "season") {
    const seasonId = loadFlashChallenges().find((c) => c.id === challengeId)?.season_id;
    if (seasonId) completeSeasonChallenge(studentId, challengeId, seasonId);
  } else {
    // "normal" / "mystery_box" — submitChallenge already advanced the streak at
    // delivery time, and that's the source of truth. We only clear
    // last_completed_at so completeChallenge's cooldown guard doesn't block the
    // award, then restore the pre-approval counters so the streak keeps being
    // measured from the submission, not from the review.
    const u = USERS.find((x) => x.id === studentId);
    const savedLast = u?.last_completed_at;
    const savedStreak = u?.current_streak;
    const savedLongest = u?.longest_streak;
    persistStudentPatch(studentId, { last_completed_at: undefined });
    completeChallenge(studentId, challengeId);
    persistStudentPatch(studentId, {
      last_completed_at: savedLast,
      current_streak: savedStreak,
      longest_streak: savedLongest,
    });
  }

  return true;
}

/** Send a delivery back to the student for another attempt. Counters and streak
 *  are left untouched. */
export function requestResubmission(
  studentId: string,
  challengeId: string,
  teacherId: string,
  feedback: string,
): boolean {
  return !!patchSubmission(studentId, challengeId, {
    status: "needs_resubmission",
    teacher_feedback: feedback.trim(),
    reviewer_id: teacherId,
    reviewed_at: new Date().toISOString(),
  });
}

/** Reject a delivery for good. Rolls the streak back to `streak_before` for the
 *  streak-bearing formats and files a student report for the admin trail. */
export function rejectSubmission(
  studentId: string,
  challengeId: string,
  teacherId: string,
  feedback: string,
): boolean {
  const sub = getSubmission(studentId, challengeId);
  if (!sub) return false;

  patchSubmission(studentId, challengeId, {
    status: "rejected",
    teacher_feedback: feedback.trim(),
    reviewer_id: teacherId,
    reviewed_at: new Date().toISOString(),
  });

  if (sub.challenge_format === "normal" || sub.challenge_format === "mystery_box") {
    if (sub.streak_before !== undefined) {
      persistStudentPatch(studentId, { current_streak: sub.streak_before });
    }
  }

  const title =
    loadChallenges().find((c) => c.id === challengeId)?.title ??
    loadFlashChallenges().find((c) => c.id === challengeId)?.title ??
    challengeId;
  addStudentReport({
    studentId,
    teacherId,
    text: `Challenge submission not approved — ${title}: ${feedback.trim()}`,
  });
  return true;
}

export interface PendingSubmissionRow {
  studentId: string;
  studentName: string;
  submission: ChallengeSubmission;
}

/** Every submission still awaiting the student or the teacher on this teacher's
 *  roster. The roster source is the ASSIGNMENTS table — the same one
 *  teacherNotifications() uses in notifications-store.ts. */
export function pendingSubmissionsForTeacher(teacherId: string): PendingSubmissionRow[] {
  const roster = ASSIGNMENTS.filter((a) => a.teacher_id === teacherId).map((a) => a.student_id);
  const out: PendingSubmissionRow[] = [];
  for (const sid of roster) {
    const st = USERS.find((x) => x.id === sid);
    if (!st) continue;
    for (const s of st.challenge_submissions ?? []) {
      if (s.status !== "pending_review" && s.status !== "needs_resubmission") continue;
      out.push({ studentId: sid, studentName: st.name, submission: s });
    }
  }
  return out.sort((a, b) => +new Date(a.submission.submitted_at) - +new Date(b.submission.submitted_at));
}

export function subscribeStudents(cb: () => void): () => void {

  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === PROFILE_KEY) cb(); };
  window.addEventListener(STUDENTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDENTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
