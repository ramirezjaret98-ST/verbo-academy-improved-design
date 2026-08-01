// Student → conduct reports against a teacher or another student.
// Independent from student-reports-store.ts (which is the opposite direction:
// teacher writes about student). Anonymous only to the reported person —
// Admin always sees the real reporter identity.
//
// Same persistence pattern as student-reports-store.ts: localStorage +
// CustomEvent for cross-tab sync.

export type ConductTargetType = "teacher" | "student";
export type ConductCategory =
  | "Inappropriate behavior"
  | "Harassment"
  | "Academic non-compliance"
  | "Other";

export type ConductReportStatus = "pending" | "reviewed" | "dismissed";

export const CONDUCT_CATEGORIES: ConductCategory[] = [
  "Inappropriate behavior",
  "Harassment",
  "Academic non-compliance",
  "Other",
];

export interface ConductReport {
  id: string;
  reporter_id: string;
  target_type: ConductTargetType;
  target_id: string;
  category: ConductCategory;
  text: string;
  created_at: string; // ISO
  status: ConductReportStatus;
  reviewed_at?: string; // ISO — when status moved to reviewed or dismissed
}

export const CONDUCT_REPORTS_KEY = "verbo:conduct-reports";
export const CONDUCT_REPORTS_EVENT = "verbo:conduct-reports-updated";

function readAll(): ConductReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CONDUCT_REPORTS_KEY) || "[]") as ConductReport[];
    // Back-fill status for reports persisted before the field existed.
    return raw.map((r) => (r.status ? r : { ...r, status: "pending" as const }));
  } catch { return []; }
}

function writeAll(list: ConductReport[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONDUCT_REPORTS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(CONDUCT_REPORTS_EVENT));
  } catch { /* noop */ }
}

export function addConductReport(input: {
  reporterId: string;
  targetType: ConductTargetType;
  targetId: string;
  category: ConductCategory;
  text: string;
}): ConductReport {
  const report: ConductReport = {
    id: `cr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    category: input.category,
    text: input.text.trim(),
    created_at: new Date().toISOString(),
    status: "pending",
  };
  writeAll([report, ...readAll()]);
  return report;
}

export function loadConductReports(): ConductReport[] {
  return readAll();
}

export function updateConductReport(
  id: string,
  patch: Partial<Pick<ConductReport, "status">>,
): ConductReport | null {
  const list = readAll();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const next: ConductReport = { ...list[idx], ...patch };
  if (patch.status && patch.status !== "pending") {
    next.reviewed_at = new Date().toISOString();
  }
  list[idx] = next;
  writeAll(list);
  return next;
}

export function subscribeConductReports(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === CONDUCT_REPORTS_KEY) cb(); };
  window.addEventListener(CONDUCT_REPORTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONDUCT_REPORTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
