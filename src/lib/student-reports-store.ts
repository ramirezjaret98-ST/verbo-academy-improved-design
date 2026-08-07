// Free-text reports a teacher writes about a specific student.
// Persisted only — no notifications or admin inbox are wired yet.
//
// Backed by Supabase (`public.student_reports`). RLS: a teacher can insert
// and see only the reports they wrote (`teacher_id = auth.uid()`); admins see
// everything. A plain `select("*")` already returns exactly that scoped set
// for the calling session, so we use a single global cache hydrated once +
// kept in sync via Postgres Realtime.
//
// TODO: conectar destino del reporte (canal de chat interno o
// notificación por WhatsApp — decisión pendiente).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export interface StudentReport {
  id: string;
  student_id: string;
  teacher_id: string;
  created_at: string; // ISO
  text: string;
}

export const REPORTS_EVENT = "verbo:student-reports-updated";

type Row = Database["public"]["Tables"]["student_reports"]["Row"];

let cache: StudentReport[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(REPORTS_EVENT));
}

function mapRow(row: Row): StudentReport {
  return {
    id: String(row.id),
    student_id: uuidToLegacySync(row.student_id),
    teacher_id: uuidToLegacySync(row.teacher_id),
    created_at: row.created_at,
    text: row.text,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("student_reports").select("*");
    if (error) {
      console.error("[student-reports-store] failed to load", error);
      hydrated = true;
      return;
    }
    cache = (data ?? []).map(mapRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("student-reports-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "student_reports" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
}

export function addStudentReport(input: { studentId: string; teacherId: string; text: string }): StudentReport {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const report: StudentReport = {
    id: tempId,
    student_id: input.studentId,
    teacher_id: input.teacherId,
    created_at: new Date().toISOString(),
    text: input.text.trim(),
  };
  cache = [report, ...cache];
  notify();

  void (async () => {
    const [studentUuid, teacherUuid] = await Promise.all([
      legacyToUuid(input.studentId),
      legacyToUuid(input.teacherId),
    ]);
    if (!studentUuid || !teacherUuid) {
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("student_reports")
      .insert({ student_id: studentUuid, teacher_id: teacherUuid, text: report.text })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[student-reports-store] failed to save report", error);
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    cache = cache.map((r) => (r.id === tempId ? mapRow(data) : r));
    notify();
  })();

  return report;
}

export function reportsFor(teacherId: string, studentId: string): StudentReport[] {
  return loadStudentReports().filter((r) => r.teacher_id === teacherId && r.student_id === studentId);
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
  if (!hydrated) void hydrate();
  return cache;
}

export function subscribeStudentReports(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
