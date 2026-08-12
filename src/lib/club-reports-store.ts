// Club Reports — teacher-side closure records for Book Clubs, Insights and
// Spotlight Sessions (student-linked). These events don't carry a
// Performance Session-style evaluation: only attendance + free-form notes.
//
// Backed by Supabase (`public.club_reports`, one row per event — `club_id`
// for book/insight, `session_id` for spotlight, exactly one of the two set
// per the table's CHECK constraint). RLS already scopes select/write to
// admin or the report's own teacher — no fixes needed for this table. Two
// partial unique indexes (`club_reports_club_id_uniq`/`_session_id_uniq`,
// added in this lote) let `saveClubReport` upsert by whichever FK column
// is set, matching the old "one report per event" behavior of the
// localStorage `Record<event_id, ClubReport>` map.
//
// IMPORTANT — `attendance` is accepted here for API compatibility but is NOT
// persisted to `public.club_report_attendance` in this lote. That child
// table requires a real `student_id` (uuid, NOT NULL FK to app_users) per
// row, but the attendance UI (`ClubReportModal`, fed by `enrolled_names` in
// calendar-events.ts) currently has no real per-student roster to attach:
// book/insight events use a hardcoded fake name pool
// (`enrolledNamesFor()`, explicitly commented in calendar-events.ts as a
// placeholder "until the real roster ships"), and spotlight events don't
// populate `enrolled_names` at all. Confirmed by grep that nothing in the
// app reads `ClubReport.attendance` back, so this was already write-only —
// migrating it into a real per-student table needs `enrolledNamesFor()`
// rewired to the real `club_bookings` data first (already migrated, see
// `bookingsForStudent` in club-bookings-store.ts), which is a separate,
// slightly larger fix left for a future lote.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

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

export const CLUB_REPORTS_EVENT = "verbo:club-reports-updated";

type Row = Database["public"]["Tables"]["club_reports"]["Row"];

function fromRow(row: Row): ClubReport {
  return {
    event_id: row.club_id != null ? String(row.club_id) : String(row.session_id),
    event_type: row.event_type,
    teacher_id: row.teacher_id, // resolved to the legacy id below, per-cache
    attendance: {}, // not persisted — see file header.
    comments: row.comments ?? "",
    submitted_at: row.submitted_at,
  };
}

let reportsCache: ClubReport[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CLUB_REPORTS_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const [, { data, error }] = await Promise.all([
      hydrateUserIdBridge(),
      supabase.from("club_reports").select("*"),
    ]);
    if (error) {
      console.error("[club-reports-store] failed to load", error);
    }
    reportsCache = (data ?? []).map((row) => ({
      ...fromRow(row),
      teacher_id: uuidToLegacySync(row.teacher_id),
    }));
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
    .channel("club-reports-store-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "club_reports" }, () => {
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

export function loadClubReports(): Record<string, ClubReport> {
  const out: Record<string, ClubReport> = {};
  for (const r of reportsCache) out[r.event_id] = r;
  return out;
}

export function getClubReport(eventId: string): ClubReport | undefined {
  return reportsCache.find((r) => r.event_id === eventId);
}

export function saveClubReport(report: ClubReport) {
  const prev = reportsCache;
  reportsCache = [...reportsCache.filter((r) => r.event_id !== report.event_id), report];
  notify();

  void (async () => {
    const teacherUuid = await legacyToUuid(report.teacher_id);
    if (!teacherUuid) {
      console.error("[club-reports-store] no app_users row for legacy id", report.teacher_id);
      reportsCache = prev;
      notify();
      return;
    }
    const numericEventId = Number(report.event_id);
    const isClub = report.event_type === "book" || report.event_type === "insight";
    const { error } = await supabase.from("club_reports").upsert(
      {
        event_type: report.event_type,
        club_id: isClub ? numericEventId : null,
        session_id: isClub ? null : numericEventId,
        teacher_id: teacherUuid,
        comments: report.comments,
        submitted_at: report.submitted_at,
      },
      { onConflict: isClub ? "club_id" : "session_id" },
    );
    if (error) {
      console.error("[club-reports-store] failed to save report", error);
      reportsCache = prev;
      notify();
    }
  })();
}

export function subscribeClubReports(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}
