// Coverage notes — free-text context a titular teacher writes about a student
// for any substitute teacher who covers a rescheduled session.
//
// Keyed by `${teacherId}:${studentId}` (titular teacher + student), so if
// assignments change in the future the note stays scoped to the pairing
// that authored it.
//
// Backed by Supabase (`public.coverage_notes`). Reads are served from an
// in-memory cache (`${teacherLegacyId}:${studentLegacyId}` -> note) kept in
// sync via Postgres Realtime, so `getCoverageNote()` /
// `getCoverageNoteForStudent()` stay synchronous for existing call sites.
// RLS scopes what each viewer can read (admin, the authoring teacher, or any
// teacher of that student — which now includes substitutes), so no extra
// client-side filtering is needed. `setCoverageNote()` updates the cache
// optimistically and upserts/deletes in the background.
//
// TODO: auto-clear this note when the associated rescheduled session is
// marked "Completed" by the substitute teacher. That reassignment/
// completion event does not exist yet in the sessions engine — when it
// lands, call `setCoverageNote(teacherId, studentId, "")` from that
// handler (or introduce a per-session variant scoped by session_id).
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid, uuidToLegacySync, hydrateUserIdBridge } from "./user-id-bridge";

export const COVERAGE_NOTES_EVENT = "verbo:coverage-notes-updated";

function keyOf(teacherId: string, studentId: string) {
  return `${teacherId}:${studentId}`;
}

/** `${teacherLegacyId}:${studentLegacyId}` -> note text. */
let cache = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COVERAGE_NOTES_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("coverage_notes")
      .select("teacher_id, student_id, note");
    if (error) {
      console.error("[coverage-notes-store] failed to load coverage_notes", error);
      hydratePromise = null;
      return;
    }
    const next = new Map<string, string>();
    for (const row of data ?? []) {
      if (!row.note || !row.note.trim()) continue;
      next.set(keyOf(uuidToLegacySync(row.teacher_id), uuidToLegacySync(row.student_id)), row.note);
    }
    cache = next;
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
    .channel("coverage-notes-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "coverage_notes" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

export function getCoverageNote(teacherId: string, studentId: string): string {
  return cache.get(keyOf(teacherId, studentId)) ?? "";
}

/** Substitute-side lookup: returns the note authored by ANY titular teacher
 *  for this student. Used by Session Details / Lesson Plan when the current
 *  viewer is a substitute and does not know the titular teacher id. */
export function getCoverageNoteForStudent(studentId: string): string {
  for (const [k, v] of cache.entries()) {
    if (k.endsWith(`:${studentId}`) && v.trim()) return v;
  }
  return "";
}

export function setCoverageNote(teacherId: string, studentId: string, note: string) {
  // Optimistic: update the cache + notify immediately, persist in background.
  const k = keyOf(teacherId, studentId);
  if (note.trim()) cache.set(k, note);
  else cache.delete(k);
  notify();
  void (async () => {
    const [teacherUuid, studentUuid] = await Promise.all([
      legacyToUuid(teacherId),
      legacyToUuid(studentId),
    ]);
    if (!teacherUuid || !studentUuid) {
      console.error("[coverage-notes-store] cannot persist note — unresolved ids", {
        teacherId,
        studentId,
        teacherUuid,
        studentUuid,
      });
      return;
    }
    if (note.trim()) {
      const { error } = await supabase
        .from("coverage_notes")
        .upsert(
          { teacher_id: teacherUuid, student_id: studentUuid, note: note.trim() },
          { onConflict: "teacher_id,student_id" },
        );
      if (error) {
        console.error("[coverage-notes-store] failed to save coverage note", error);
      }
    } else {
      const { error } = await supabase
        .from("coverage_notes")
        .delete()
        .eq("teacher_id", teacherUuid)
        .eq("student_id", studentUuid);
      if (error) {
        console.error("[coverage-notes-store] failed to delete coverage note", error);
      }
    }
  })();
}

export function subscribeCoverageNotes(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}
