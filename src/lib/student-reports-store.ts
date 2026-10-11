// Free-text reports a teacher writes about a specific student.
// Admin sees pending reports in notifications and can close them from the
// student's report history.
//
// Backed by Supabase (`public.student_reports`). RLS: a teacher can insert
// and see only the reports they wrote (`teacher_id = auth.uid()`); admins see
// everything. A plain `select("*")` already returns exactly that scoped set
// for the calling session, so we use a single global cache hydrated once +
// kept in sync via Postgres Realtime.
//
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export interface StudentReport {
  id: string;
  student_id: string;
  teacher_id: string;
  created_at: string; // ISO
  text: string;
  status: "pending" | "resolved" | "dismissed";
  resolution_note?: string;
  resolved_at?: string;
}

export const REPORTS_EVENT = "verbo:student-reports-updated";

type Row = Database["public"]["Tables"]["student_reports"]["Row"];

let cache: StudentReport[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let hydrateGeneration = 0;
let refreshQueued = false;
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
    status: row.status as StudentReport["status"],
    resolution_note: row.resolution_note ?? undefined,
    resolved_at: row.resolved_at ?? undefined,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  const generation = hydrateGeneration;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("student_reports").select("*");
    if (error) {
      console.error("[student-reports-store] failed to load", error);
      return;
    }
    if (generation !== hydrateGeneration) return;
    cache = (data ?? []).map(mapRow);
    hydrated = true;
    notify();
  })().catch((error) => {
    if (generation === hydrateGeneration) {
      console.error("[student-reports-store] failed to load", error);
    }
  }).finally(() => {
    hydratePromise = null;
    if (refreshQueued) { refreshQueued = false; void hydrate(); }
  });
  return hydratePromise;
}

function invalidateAndRehydrate(reason?: "auth" | "refresh") {
  hydrateGeneration++;
  hydrated = false;
  if (reason === "auth") { cache = []; notify(); }
  if (hydratePromise) { refreshQueued = true; return; }
  void hydrate();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("student-reports-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "student_reports" }, () => {
      invalidateAndRehydrate("refresh");
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

export async function addStudentReport(input: { studentId: string; teacherId: string; text: string }): Promise<StudentReport> {
  const generation = hydrateGeneration;
  const [studentUuid, teacherUuid] = await Promise.all([
    legacyToUuid(input.studentId),
    legacyToUuid(input.teacherId),
  ]);
  if (!studentUuid || !teacherUuid) throw new Error("Couldn't identify the student or teacher");
  const { data, error } = await supabase
    .from("student_reports")
    .insert({ student_id: studentUuid, teacher_id: teacherUuid, text: input.text.trim() })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("Report was not saved");
  const report = mapRow(data);
  if (generation === hydrateGeneration) {
    cache = [report, ...cache.filter((r) => r.id !== report.id)];
    notify();
  }
  return report;
}

export async function closeStudentReport(
  id: string, status: "resolved" | "dismissed", resolutionNote: string,
): Promise<StudentReport> {
  if (!resolutionNote.trim()) throw new Error("A follow-up note is required");
  const generation = hydrateGeneration;
  const { data, error } = await supabase.rpc("close_student_report" as never, {
    p_report_id: Number(id), p_status: status, p_resolution_note: resolutionNote.trim(),
  } as never);
  if (error || !data) throw error ?? new Error("Report was not updated");
  const report = mapRow(data as Row);
  if (generation === hydrateGeneration) {
    cache = cache.map((r) => r.id === id ? report : r);
    notify();
  }
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
