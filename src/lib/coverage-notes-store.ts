// Coverage notes — free-text context a titular teacher writes about a student
// for any substitute teacher who covers a rescheduled session.
//
// Keyed by `${teacherId}:${studentId}` (titular teacher + student), so if
// assignments change in the future the note stays scoped to the pairing
// that authored it. Persisted to localStorage and broadcast via a custom
// event so any open view stays in sync.
//
// TODO: auto-clear this note when the associated rescheduled session is
// marked "Completed" by the substitute teacher. That reassignment/
// completion event does not exist yet in the sessions engine — when it
// lands, call `setCoverageNote(teacherId, studentId, "")` from that
// handler (or introduce a per-session variant scoped by session_id).

import { USERS } from "./mock-data";

export const COVERAGE_NOTES_KEY = "verbo:coverage-notes";
export const COVERAGE_NOTES_EVENT = "verbo:coverage-notes-updated";

type NotesMap = Record<string, string>; // key = `${teacherId}:${studentId}`

function keyOf(teacherId: string, studentId: string) {
  return `${teacherId}:${studentId}`;
}

function readAll(): NotesMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(COVERAGE_NOTES_KEY) || "{}"); } catch { return {}; }
}

function writeAll(map: NotesMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COVERAGE_NOTES_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(COVERAGE_NOTES_EVENT));
  } catch { /* noop */ }
}

export function getCoverageNote(teacherId: string, studentId: string): string {
  return readAll()[keyOf(teacherId, studentId)] ?? "";
}

/** Substitute-side lookup: returns the note authored by ANY titular teacher
 *  for this student. Used by Session Details / Lesson Plan when the current
 *  viewer is a substitute and does not know the titular teacher id. */
export function getCoverageNoteForStudent(studentId: string): string {
  const all = readAll();
  for (const [k, v] of Object.entries(all)) {
    if (k.endsWith(`:${studentId}`) && v.trim()) return v;
  }
  return "";
}

export function setCoverageNote(teacherId: string, studentId: string, note: string) {
  const map = readAll();
  const k = keyOf(teacherId, studentId);
  if (note.trim()) map[k] = note;
  else delete map[k];
  writeAll(map);
}

export function subscribeCoverageNotes(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === COVERAGE_NOTES_KEY) cb(); };
  window.addEventListener(COVERAGE_NOTES_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(COVERAGE_NOTES_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
