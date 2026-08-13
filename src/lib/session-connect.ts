// Shared "when does the Join/Connect button activate" rule for a live
// session. Extracted from student.sessions.tsx's EventDetailsModal — the
// ONLY surface that had this gated correctly — so the Dashboard's Upcoming
// Sessions strip and Class Details Modal (student.index.tsx) can use the
// exact same window instead of leaving Connect always-enabled regardless
// of how far away the session is.
import { hoursUntil } from "@/components/verbo/CancelSessionFlow";

/** True from 5 minutes before the start until the session's end time. */
export function withinConnectWindow(iso: string, durationMinutes: number): boolean {
  const h = hoursUntil(iso);
  return h <= 5 / 60 && h > -(durationMinutes / 60);
}

export const CONNECT_HINT = "Activates 5 minutes before your session.";
