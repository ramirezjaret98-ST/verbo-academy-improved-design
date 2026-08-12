// Per-session teacher -> student performance ratings.
// Backed by Supabase (`public.performance_ratings`). Global cache hydrated
// once + Postgres Realtime, same pattern used across this migration (see
// coverage-notes-store.ts / sessions-store.ts).
//
// Composite primary key on the table is (session_id, student_id) — one row
// per student per session. This matters for group sessions: one shared
// `sessions` row can have several `perMember` evaluations
// (submitGroupSessionReport in sessions-store.ts), and under the old
// localStorage design (keyed by session_id alone) each member's rating
// overwrote the previous member's under the same key. The cache here uses
// the same composite shape (`${sessionId}:${studentLegacyId}`) so every
// member keeps their own entry.
//
// Two coexisting rating shapes, unchanged from the pre-migration design:
//   1. Base 4-key rating (1-5) — kept for legacy seed data and back-compat.
//   2. `subskills` map (0-100) written by the Session Report — the real,
//      granular values captured by teachers. When present, downstream
//      analytics (PerformanceAnalytics) prefer these over the derived
//      base-key hash offsets.
// A single (session, student) pair may have EITHER shape or BOTH; readers
// must tolerate partial data — teachers only rate the subskills actually
// worked on.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export interface PerformanceRating {
  fluency: number;
  vocabulary: number;
  confidence: number;
  grammar: number;
  /** Optional per-subskill scores, 0-100. Key format: "Macro:Sub". */
  subskills?: Record<string, number>;
}

/** Keyed by `${sessionId}:${studentLegacyId}` — NOT by session id alone
 *  (see file header for why). `sessionId` matches `ExtSession.id`
 *  (sessions-store.ts), `studentLegacyId` matches the legacy short id
 *  ("u2") used everywhere else in the frontend. */
export type PerformanceMap = Record<string, PerformanceRating>;

export const PERFORMANCE_EVENT = "verbo:performance-updated";

export function performanceKey(sessionId: string, studentId: string): string {
  return `${sessionId}:${studentId}`;
}

let cache: PerformanceMap = {};
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
const SSR_SNAPSHOT: PerformanceMap = {};

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PERFORMANCE_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("performance_ratings")
      .select("session_id, student_id, fluency, vocabulary, confidence, grammar, subskills");
    if (error) {
      console.error("[performance-store] failed to load performance_ratings", error);
      hydratePromise = null;
      return;
    }
    const next: PerformanceMap = {};
    for (const row of data ?? []) {
      const studentLegacy = uuidToLegacySync(row.student_id);
      const subskills = (row.subskills as Record<string, number> | null) ?? undefined;
      next[performanceKey(String(row.session_id), studentLegacy)] = {
        fluency: Number(row.fluency),
        vocabulary: Number(row.vocabulary),
        confidence: Number(row.confidence),
        grammar: Number(row.grammar),
        subskills: subskills && Object.keys(subskills).length > 0 ? subskills : undefined,
      };
    }
    cache = next;
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate().then(notify);
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("performance-ratings-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "performance_ratings" }, invalidateAndRehydrate)
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);
}

/** Kicks off hydration (and realtime, in the browser). Safe to call
 *  redundantly — cheap no-op once already hydrated/subscribed. */
export function loadPerformance(): void {
  ensureRealtime();
  if (!hydrated) void hydrate().then(notify);
}

export function getPerformanceSnapshot(): PerformanceMap {
  loadPerformance();
  return cache;
}

export function getServerPerformanceSnapshot(): PerformanceMap {
  return SSR_SNAPSHOT;
}

export function subscribePerformance(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  ensureRealtime();
  if (!hydrated) void hydrate().then(notify);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Persist a teacher's rating for one student's completed session.
 *  `sessionId` is the shared `sessions.id`; `studentId`/`teacherId` are
 *  legacy short ids (resolved to `app_users` UUIDs internally, same
 *  convention as coverage-notes-store.ts / sessions-store.ts). Optimistic:
 *  the cache updates and listeners are notified immediately, with the real
 *  write happening in the background and rolling back on failure. */
export function savePerformance(
  sessionId: string,
  studentId: string,
  teacherId: string,
  rating: PerformanceRating,
) {
  if (!sessionId || !studentId || !teacherId) {
    console.error("[performance-store] savePerformance called with missing id(s)", { sessionId, studentId, teacherId });
    return;
  }
  const key = performanceKey(sessionId, studentId);
  const prev = cache[key];
  cache = { ...cache, [key]: rating };
  notify();

  void (async () => {
    const [studentUuid, teacherUuid] = await Promise.all([
      legacyToUuid(studentId),
      legacyToUuid(teacherId),
    ]);
    if (!studentUuid || !teacherUuid) {
      console.error("[performance-store] unknown student/teacher id, dropping optimistic rating", { studentId, teacherId });
      rollback();
      return;
    }
    const numericSessionId = Number(sessionId);
    if (!Number.isFinite(numericSessionId)) {
      console.error("[performance-store] non-numeric session id, dropping optimistic rating", sessionId);
      rollback();
      return;
    }
    const { error } = await supabase
      .from("performance_ratings")
      .upsert(
        {
          session_id: numericSessionId,
          student_id: studentUuid,
          teacher_id: teacherUuid,
          fluency: rating.fluency,
          vocabulary: rating.vocabulary,
          confidence: rating.confidence,
          grammar: rating.grammar,
          subskills: rating.subskills ?? {},
        },
        { onConflict: "session_id,student_id" },
      );
    if (error) {
      console.error("[performance-store] failed to save performance_ratings", error);
      rollback();
    }
  })();

  function rollback() {
    cache = { ...cache };
    if (prev === undefined) delete cache[key];
    else cache[key] = prev;
    notify();
  }
}

/** Save a subskill-only evaluation (0-100 per subskill) for one student's
 *  session. Derives the 4 legacy base averages from the subskills so any
 *  surface still consuming the base keys keeps working. */
export function saveSubskillEvaluation(
  sessionId: string,
  studentId: string,
  teacherId: string,
  subskills: Record<string, number>,
) {
  // Group subskill scores by their base key, average, and convert 0-100 → 0-5.
  // Mapping lives in skills-taxonomy but we avoid a circular import by
  // reading the base out of the key convention when possible; callers pass
  // pre-mapped totals via `saveSubskillEvaluation` if they want to control it.
  // To keep this file base-key-agnostic we let PerformanceAnalytics compute
  // final averages from `subskills` directly and only mirror an approximate
  // 4-base average here (mean of all rated subskills, scaled to 0-5).
  const values = Object.values(subskills).filter((v) => typeof v === "number");
  const mean100 = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  const mean5 = Math.round((mean100 / 100) * 5 * 10) / 10; // 1 decimal
  const rating: PerformanceRating = {
    fluency: mean5, vocabulary: mean5, confidence: mean5, grammar: mean5,
    subskills,
  };
  savePerformance(sessionId, studentId, teacherId, rating);
}

/** Averages a set of (sessionId, studentId) ratings. `entries` pairs each
 *  session id with the student id whose rating to look up, so callers stay
 *  correct for group sessions instead of assuming session id alone
 *  identifies a rating. */
export function averagePerformance(
  entries: Array<{ sessionId: string; studentId: string }>,
  map: PerformanceMap,
): PerformanceRating & { count: number } {
  const ratings = entries
    .map(({ sessionId, studentId }) => map[performanceKey(sessionId, studentId)])
    .filter(Boolean) as PerformanceRating[];
  const count = ratings.length;
  if (count === 0) return { fluency: 0, vocabulary: 0, confidence: 0, grammar: 0, count: 0 };
  const sum = ratings.reduce(
    (a, r) => ({
      fluency: a.fluency + r.fluency,
      vocabulary: a.vocabulary + r.vocabulary,
      confidence: a.confidence + r.confidence,
      grammar: a.grammar + r.grammar,
    }),
    { fluency: 0, vocabulary: 0, confidence: 0, grammar: 0 },
  );
  return {
    fluency: sum.fluency / count,
    vocabulary: sum.vocabulary / count,
    confidence: sum.confidence / count,
    grammar: sum.grammar / count,
    count,
  };
}
