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
//
// Backed by Supabase (`public.teacher_strikes`). Reads are served from an
// in-memory cache kept in sync via Postgres Realtime, so `loadStrikes()` /
// `activeStrikeCount()` stay synchronous for the render-time call sites.
// RLS scopes rows to self-or-admin, so a plain hydrate-once + Realtime
// pattern is enough here. Mutations write optimistically to the cache and
// persist in the background.
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid, uuidToLegacySync, hydrateUserIdBridge } from "./user-id-bridge";
import { USERS } from "./mock-data";
import { loadSessions, updateSession, type ExtSession } from "./sessions-store";
import { patchTeacherProfile } from "./teacher-model";

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

export const STRIKES_EVENT = "verbo:teacher-strikes-updated";
export const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

let cache: Strike[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    // notifications-store.ts and activity-logs-store.ts listen for this
    // window event directly (bypassing `subscribeStrikes`), so it must keep
    // firing on every mutation and cache refresh.
    window.dispatchEvent(new CustomEvent(STRIKES_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("teacher_strikes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[strikes-store] failed to load teacher_strikes", error);
      hydratePromise = null;
      return;
    }
    cache = (data ?? []).map((row) => ({
      id: row.id,
      teacher_id: uuidToLegacySync(row.teacher_id),
      session_id: row.session_id != null ? String(row.session_id) : "",
      reason: row.reason as CancelReason,
      note: row.note ?? undefined,
      medical_note_name: row.medical_note_name ?? undefined,
      created_at: row.created_at,
      needs_substitute: row.needs_substitute ?? undefined,
      substitute_found: row.substitute_found ?? undefined,
      justified: row.justified,
      justification_cause: (row.justification_cause as JustificationCause) ?? undefined,
      justified_at: row.justified_at ?? undefined,
    }));
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("teacher-strikes-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "teacher_strikes" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly — `activeStrikeCount()` is called
  // synchronously inside render logic and KPI computations, so the cache
  // needs to be warm as early as possible.
  void hydrate();
  ensureRealtime();
}

export function loadStrikes(): Strike[] {
  return cache;
}

export function subscribeStrikes(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
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
function autoFreezeIfNeeded(teacherId: string) {
  if (activeStrikeCount(teacherId) < 3) return;
  const u = USERS.find((x) => x.id === teacherId && x.role === "teacher");
  if (!u) return;
  if ((u.teacher_status ?? "active") === "frozen") return;
  // Also stamp tier_frozen_since so the tier clock pauses — the manual admin
  // freeze flow already did this; the auto-freeze path historically didn't.
  patchTeacherProfile(teacherId, {
    teacher_status: "frozen",
    tier_frozen_since: new Date().toISOString(),
  });
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
    updateSession(input.sessionId, {
      status: "cancelled",
      absent_cause: "teacher",
      cancellation_reason: input.reason,
      cancellation_note: input.note,
      needs_substitute: needsSubstitute,
    });
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
  // Optimistic: prepend to the cache + notify BEFORE the freeze check, so
  // `activeStrikeCount` inside `autoFreezeIfNeeded` already counts this
  // strike — the 3rd-strike auto-freeze must trigger on the SAME
  // cancellation that crosses the threshold.
  cache = [strike, ...cache];
  notify();
  autoFreezeIfNeeded(input.teacherId);

  void (async () => {
    const teacherUuid = await legacyToUuid(input.teacherId);
    if (!teacherUuid) {
      console.error("[strikes-store] cannot persist strike — unresolved teacher id", {
        teacherId: input.teacherId,
        strikeId: strike.id,
      });
      return;
    }
    const { error } = await supabase.from("teacher_strikes").insert({
      id: strike.id,
      teacher_id: teacherUuid,
      session_id: input.sessionId ? Number(input.sessionId) : null,
      reason: strike.reason,
      note: strike.note ?? null,
      medical_note_name: strike.medical_note_name ?? null,
      created_at: strike.created_at,
      needs_substitute: strike.needs_substitute ?? null,
    });
    if (error) {
      console.error("[strikes-store] failed to persist strike", error);
    }
  })();

  return { strike, session: target, needsSubstitute };
}

export function justifyStrike(strikeId: string, cause: JustificationCause) {
  const justifiedAt = new Date().toISOString();
  cache = cache.map((s) =>
    s.id === strikeId
      ? { ...s, justified: true, justification_cause: cause, justified_at: justifiedAt }
      : s,
  );
  notify();
  void (async () => {
    const { error } = await supabase
      .from("teacher_strikes")
      .update({ justified: true, justification_cause: cause, justified_at: justifiedAt })
      .eq("id", strikeId);
    if (error) {
      console.error("[strikes-store] failed to persist strike justification", error);
    }
  })();
}

export function markSubstituteFound(strikeId: string, found: boolean) {
  cache = cache.map((s) => (s.id === strikeId ? { ...s, substitute_found: found } : s));
  notify();
  void (async () => {
    const { error } = await supabase
      .from("teacher_strikes")
      .update({ substitute_found: found })
      .eq("id", strikeId);
    if (error) {
      console.error("[strikes-store] failed to persist substitute flag", error);
    }
  })();
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
