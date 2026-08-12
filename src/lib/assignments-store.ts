// Teacher <-> student assignments ("who is whose teacher").
//
// 2026-08-08: this used to be a single hardcoded, in-memory array
// (`ASSIGNMENTS` in mock-data.ts) with only 3 seed rows and NO persistence
// at all — not even localStorage. Every assignment an admin made after that
// (Register Student/Teacher, reassigning a student, adding/moving a group
// member) only ever mutated that array in the admin's own browser tab. It
// was gone on refresh and never existed in any other browser/device — so a
// newly registered student never showed up on the assigned teacher's
// roster anywhere but the admin's own tab, if even there after a reload.
//
// A real `public.assignments` table already existed in Supabase (uuid
// teacher_id/student_id, PK on the pair, correct RLS: admin can write,
// admin/the teacher/the student can read) but was never wired to the
// frontend — the same "stub table nobody connected" pattern seen before in
// this project (performance_ratings, coverage_notes, etc.).
//
// This store follows the same pattern as coverage-notes-store.ts: an
// in-memory cache keyed by LEGACY ids (so `assignedTeacherIdFor` /
// `assignedStudentIdsFor` stay synchronous for existing call sites), kept
// in sync via Postgres Realtime, with optimistic writes translated to real
// UUIDs through user-id-bridge.ts. The app's business rule is "one teacher
// per student" (every prior ASSIGNMENTS.find(...) call site assumed a
// single match), even though the table's PK technically allows a student
// to have rows with more than one teacher — `setAssignment` enforces the
// single-teacher rule by removing any other row for that student first.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import { legacyToUuid, uuidToLegacySync, hydrateUserIdBridge } from "./user-id-bridge";

export const ASSIGNMENTS_EVENT = "verbo:assignments-updated";

/** studentLegacyId -> teacherLegacyId. One row per student, matching the
 *  app's "one teacher per student" assumption. */
let cache = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ASSIGNMENTS_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("assignments").select("teacher_id, student_id");
    if (error) {
      console.error("[assignments-store] failed to load assignments", error);
      hydratePromise = null;
      return;
    }
    const next = new Map<string, string>();
    for (const row of data ?? []) {
      const studentLegacy = uuidToLegacySync(row.student_id);
      const teacherLegacy = uuidToLegacySync(row.teacher_id);
      if (studentLegacy && teacherLegacy) next.set(studentLegacy, teacherLegacy);
    }
    cache = next;
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
    .channel("assignments-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => {
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

/** Call once on app bootstrap (or at the top of any page that needs
 *  assignments before the module-level auto-hydrate above has necessarily
 *  finished) to make sure the cache is warm. Safe to call repeatedly. */
export function hydrateAssignments() {
  void hydrate();
}

export function assignedTeacherIdFor(studentId: string): string | undefined {
  return cache.get(studentId);
}

export function assignedStudentIdsFor(teacherId: string): string[] {
  const ids: string[] = [];
  for (const [studentId, tId] of cache.entries()) {
    if (tId === teacherId) ids.push(studentId);
  }
  return ids;
}

/** All (teacherId, studentId) pairs — for the rare call site that wants to
 *  scan the whole table (e.g. "any teacher who ever had this student"). */
export function allAssignments(): { teacher_id: string; student_id: string }[] {
  return Array.from(cache.entries()).map(([student_id, teacher_id]) => ({ teacher_id, student_id }));
}

/** Assigns (or reassigns) a student to a teacher. Optimistic: updates the
 *  cache + notifies immediately, persists in the background. Enforces
 *  "one teacher per student" by replacing any existing row for this
 *  student rather than adding a second one. */
export function setAssignment(studentId: string, teacherId: string) {
  const previousTeacherId = cache.get(studentId);
  if (previousTeacherId === teacherId) return;
  cache.set(studentId, teacherId);
  notify();
  void (async () => {
    const [studentUuid, teacherUuid] = await Promise.all([
      legacyToUuid(studentId),
      legacyToUuid(teacherId),
    ]);
    if (!studentUuid || !teacherUuid) {
      console.error("[assignments-store] cannot persist assignment — unresolved ids", { studentId, teacherId, studentUuid, teacherUuid });
      return;
    }
    // Remove any other row for this student first (enforces one-teacher-
    // per-student even though the table's PK would technically allow more).
    const { error: deleteError } = await supabase.from("assignments").delete().eq("student_id", studentUuid);
    if (deleteError) {
      console.error("[assignments-store] failed to clear previous assignment", deleteError);
    }
    const { error: insertError } = await supabase
      .from("assignments")
      .insert({ teacher_id: teacherUuid, student_id: studentUuid });
    if (insertError) {
      console.error("[assignments-store] failed to save assignment", insertError);
    }
  })();
}

/** Unassigns a student from any teacher (e.g. removed from a group with no
 *  replacement teacher). Optimistic, same pattern as setAssignment. */
export function removeAssignment(studentId: string) {
  if (!cache.has(studentId)) return;
  cache.delete(studentId);
  notify();
  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) {
      console.error("[assignments-store] cannot remove assignment — unresolved student id", studentId);
      return;
    }
    const { error } = await supabase.from("assignments").delete().eq("student_id", studentUuid);
    if (error) {
      console.error("[assignments-store] failed to remove assignment", error);
    }
  })();
}

export function subscribeAssignments(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}
