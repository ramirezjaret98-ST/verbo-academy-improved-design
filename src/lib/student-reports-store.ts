// Free-text reports a teacher writes about a specific student.
// Persisted only — no notifications or admin inbox are wired yet.
//
// TODO: conectar destino del reporte (canal de chat interno o
// notificación por WhatsApp — decisión pendiente).

export interface StudentReport {
  id: string;
  student_id: string;
  teacher_id: string;
  created_at: string; // ISO
  text: string;
}

export const REPORTS_KEY = "verbo:student-reports";
export const REPORTS_EVENT = "verbo:student-reports-updated";

function readAll(): StudentReport[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]") as StudentReport[]; }
  catch { return []; }
}

function writeAll(list: StudentReport[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(REPORTS_EVENT));
  } catch { /* noop */ }
}

export function addStudentReport(input: { studentId: string; teacherId: string; text: string }): StudentReport {
  const report: StudentReport = {
    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    student_id: input.studentId,
    teacher_id: input.teacherId,
    created_at: new Date().toISOString(),
    text: input.text.trim(),
  };
  writeAll([report, ...readAll()]);
  return report;
}

export function reportsFor(teacherId: string, studentId: string): StudentReport[] {
  return readAll().filter((r) => r.teacher_id === teacherId && r.student_id === studentId);
}

/**
 * All reports about a given student, regardless of which teacher wrote them,
 * sorted newest-first. Used by the Admin student detail modal.
 */
export function reportsForStudent(studentId: string): StudentReport[] {
  return loadStudentReports()
    .filter((r) => r.student_id === studentId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function loadStudentReports(): StudentReport[] {
  return readAll();
}

export function subscribeStudentReports(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === REPORTS_KEY) cb(); };
  window.addEventListener(REPORTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(REPORTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}