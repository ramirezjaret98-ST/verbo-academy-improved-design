// Shared lesson-plans store. Keyed by session_id so Teacher (planner) and
// Student (calendar modal) read the exact same record in real-time.
//
// Backed by Supabase (`public.lesson_plans`, PK = `session_id`). RLS already
// scopes select/write to admin, the session's teacher (write), or either the
// session's teacher or student (select) — no fixes needed for this table.
// `level_id`/`unit_id` stay plain text (same compound-id strings as
// `course_units.code`, no FK — matches the rest of the not-yet-fully-typed
// syllabus reference columns). The frontend's two parallel
// `vip_unit_id`/`tailored_unit_id` fields collapse into a single DB column,
// `custom_unit_id` (FK to `custom_units.id`) — which one to populate on read
// is resolved from the referenced unit's `kind` via
// `findCustomUnitById()` in custom-units-store.ts (already migrated).
//
// Same pattern as every store migrated in previous lotes: one global
// in-memory cache, hydrated once and kept fresh via Postgres Realtime;
// `saveLessonPlan` stays optimistic and synchronous in its public signature.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { loadSessions } from "./sessions-store";
import { activeMembersOf } from "./groups-store";
import { setUnitAccess } from "./activities-store";
import { findCustomUnitById, hydrateCustomUnits } from "./custom-units-store";

export type LessonSessionType =
  | "Syllabus content"
  | "Additional Content"
  | "Review Session"
  | "Casual Topic"
  | "Evaluation";

export interface LessonPlan {
  session_id: string;
  title: string;
  type: LessonSessionType;
  level_id?: string;
  unit_id?: string;
  // Optional link to a Course Builder VIP unit. Only set when the student
  // is on the VIP product. Completing this session marks the unit done.
  vip_unit_id?: string;
  // Optional link to a Tailored Content unit for students on access_plan
  // "Elite". Parallel to vip_unit_id but for a fully separate mechanism.
  tailored_unit_id?: string;
  comments: string;
  planning_status: "on-time" | "late";
  saved_at: string; // ISO
}

export const LESSON_PLANS_EVENT = "verbo:lesson-plans-updated";

type Row = Database["public"]["Tables"]["lesson_plans"]["Row"];

function fromRow(row: Row): LessonPlan {
  const plan: LessonPlan = {
    session_id: String(row.session_id),
    title: row.title,
    type: row.type,
    comments: row.comments,
    planning_status: row.planning_status === "late" ? "late" : "on-time",
    saved_at: row.saved_at,
  };
  if (row.level_id != null) plan.level_id = row.level_id;
  if (row.unit_id != null) plan.unit_id = row.unit_id;
  if (row.custom_unit_id != null) {
    // custom-units-store is awaited (hydrateCustomUnits) before this runs, so
    // `findCustomUnitById` is reliable here — undefined only for a genuinely
    // deleted unit, in which case neither parallel field is set.
    const unit = findCustomUnitById(String(row.custom_unit_id));
    if (unit?.kind === "tailored") plan.tailored_unit_id = unit.id;
    else if (unit?.kind === "vip") plan.vip_unit_id = unit.id;
  }
  return plan;
}

let plansCache: LessonPlan[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LESSON_PLANS_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const [, { data, error }] = await Promise.all([
      hydrateCustomUnits(),
      supabase.from("lesson_plans").select("*"),
    ]);
    if (error) {
      console.error("[lesson-plans-store] failed to load", error);
    }
    plansCache = (data ?? []).map(fromRow);
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

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("lesson-plans-store-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "lesson_plans" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

export function loadLessonPlans(): Record<string, LessonPlan> {
  const out: Record<string, LessonPlan> = {};
  for (const p of plansCache) out[p.session_id] = p;
  return out;
}

export function getLessonPlan(sessionId: string): LessonPlan | undefined {
  return plansCache.find((p) => p.session_id === sessionId);
}

export function saveLessonPlan(plan: LessonPlan) {
  const prev = plansCache;
  plansCache = [...plansCache.filter((p) => p.session_id !== plan.session_id), plan];
  notify();

  void (async () => {
    const numericSessionId = Number(plan.session_id);
    const customUnitId = plan.vip_unit_id
      ? Number(plan.vip_unit_id)
      : plan.tailored_unit_id
        ? Number(plan.tailored_unit_id)
        : null;
    const { error } = await supabase.from("lesson_plans").upsert(
      {
        session_id: numericSessionId,
        title: plan.title,
        type: plan.type,
        level_id: plan.level_id ?? null,
        unit_id: plan.unit_id ?? null,
        custom_unit_id: customUnitId,
        comments: plan.comments,
        planning_status: plan.planning_status,
        saved_at: plan.saved_at,
      },
      { onConflict: "session_id" },
    );
    if (error) {
      console.error("[lesson-plans-store] failed to save plan", error);
      plansCache = prev;
      notify();
      return;
    }
    autoUnlockPlannedUnit(plan);
  })();
}

/** When a plan targets a syllabus unit (Syllabus content / Evaluation), that
 *  exact unit is unlocked for every real student of the session — the roster
 *  members for a group session, otherwise the single 1:1 student. Idempotent,
 *  and never cascades to prerequisite units. */
function autoUnlockPlannedUnit(plan: LessonPlan) {
  if (!plan.unit_id) return;
  const session = loadSessions().find((s) => s.id === plan.session_id);
  if (!session) return;
  const studentIds = session.group_id
    ? activeMembersOf(session.group_id).map((m) => m.student_id)
    : session.student_id
      ? [session.student_id]
      : [];
  for (const studentId of studentIds) {
    setUnitAccess(studentId, plan.unit_id, "unlocked", session.teacher_id, "teacher");
  }
}

export function subscribeLessonPlans(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}
