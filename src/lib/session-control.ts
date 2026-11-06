export type ConfirmationOutcome = "held" | "not_held" | "difference";
export interface SessionConfirmation {
  occurrence_key: string;
  teacher_id: string;
  outcome: ConfirmationOutcome;
  reason: string;
  confirmed_at: string;
  confirmation_late: boolean;
  external_report: string;
  external_report_at: string | null;
  resolved_at: string | null;
  resolution_note: string;
  revision: number;
}
export interface SessionControlRow {
  occurrence_key: string;
  teacher_id: string;
  teacher_name: string;
  source: "academy" | "external" | "missing";
  label: string;
  scheduled_at: string;
  duration_minutes: number;
  session_id: number | null;
  session_status: string | null;
  report_at: string | null;
  stale: boolean;
  resolution_current: boolean;
  confirmation: SessionConfirmation | null;
}
export interface SessionControlData {
  starts_on: string;
  server_now: string;
  rows: SessionControlRow[];
}
export const outcomeLabels: Record<ConfirmationOutcome, string> = {
  held: "Session held",
  not_held: "Not held",
  difference: "There is a difference",
};
export function controlFlags(row: SessionControlRow, now: number) {
  const end = Date.parse(row.scheduled_at) + row.duration_minutes * 60_000;
  const finished = end <= now;
  const c = row.confirmation;
  const needsConfirmation = finished && (!c || row.stale) && !row.resolution_current;
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const confirmationOverdue =
    needsConfirmation && dayFormatter.format(now) > dayFormatter.format(end);
  const contradiction =
    !!c &&
    row.source === "academy" &&
    ((c.outcome === "held" &&
      ["absent", "no_show", "cancelled", "pending_reschedule"].includes(
        row.session_status ?? "",
      )) ||
      (c.outcome === "not_held" &&
        (row.session_status === "completed" ||
          (!!row.report_at && row.session_status !== "absent"))));
  const discrepancy =
    !!c &&
    !row.resolution_current &&
    (row.stale ||
      c.outcome === "difference" ||
      row.source === "missing" ||
      contradiction ||
      c.outcome === "not_held");
  const reportAt = row.source === "academy" ? row.report_at : c?.external_report_at;
  const needsReport = finished && c?.outcome === "held" && !row.stale && !reportAt;
  const reportLate = !!reportAt && Date.parse(reportAt) > end + 86_400_000;
  return {
    finished,
    needsConfirmation,
    confirmationOverdue,
    discrepancy,
    needsReport,
    reportOverdue: needsReport && now > end + 86_400_000,
    reportLate,
    pending: needsConfirmation || discrepancy || needsReport,
    complete: finished && !!c && !needsConfirmation && !discrepancy && !needsReport,
  };
}
