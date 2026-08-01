// Club Reports — teacher-side closure records for Book Clubs, Insights and
// Spotlight Sessions (student-linked). These events don't carry a
// Performance Session-style evaluation: only attendance + free-form notes.
// The store follows the same localStorage + subscribe pattern as
// lesson-plans-store and clubs-store so every surface stays in sync.

export type ClubReportEventType = "insight" | "book" | "spotlight";
export type ClubAttendance = "present" | "absent";

export interface ClubReport {
  event_id: string;
  event_type: ClubReportEventType;
  teacher_id: string;
  attendance: Record<string, ClubAttendance>;
  comments: string;
  submitted_at: string; // ISO
}

export const CLUB_REPORTS_KEY = "verbo:club-reports";
export const CLUB_REPORTS_EVENT = "verbo:club-reports-updated";

export function loadClubReports(): Record<string, ClubReport> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CLUB_REPORTS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, ClubReport>;
  } catch { /* noop */ }
  return {};
}

export function persistClubReports(map: Record<string, ClubReport>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CLUB_REPORTS_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(CLUB_REPORTS_EVENT));
  } catch { /* noop */ }
}

export function saveClubReport(report: ClubReport) {
  const map = loadClubReports();
  map[report.event_id] = report;
  persistClubReports(map);
}

export function getClubReport(eventId: string): ClubReport | undefined {
  return loadClubReports()[eventId];
}

export function subscribeClubReports(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === CLUB_REPORTS_KEY) cb(); };
  window.addEventListener(CLUB_REPORTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CLUB_REPORTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}