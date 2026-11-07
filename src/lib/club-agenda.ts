import { clubTimeStatus } from "./club-lifecycle";
import type { CalendarEvent } from "./calendar-events";

/** Presentation only. Capacity never overrides a reservation or a reported outcome. */
export function clubAgendaState(event: CalendarEvent, now = Date.now()) {
  const status = clubTimeStatus(
    {
      status: event.club?.status ?? event.status ?? "upcoming",
      date: event.date,
      duration_minutes: event.duration_minutes,
    } as Parameters<typeof clubTimeStatus>[0],
    now,
  );
  const terminal =
    !!event.attendance_outcome || ["completed", "absent", "expired", "cancelled"].includes(status);
  const full = event.spots_total != null && (event.spots_taken ?? 0) >= event.spots_total;
  const label =
    event.attendance_outcome === "absent"
      ? "Absent"
      : event.attendance_outcome === "present"
        ? "Completed"
        : status === "cancelled"
          ? "Cancelled"
          : terminal
            ? status === "expired"
              ? "Ended"
              : status === "completed"
                ? "Completed"
                : "Absent"
            : event.booked
              ? "Reserved"
              : status === "live"
                ? "Live"
                : full
                  ? "Full"
                  : "Available";
  return {
    label,
    terminal,
    full,
    reserved: !!event.booked,
    color: terminal ? "#64748b" : event.booked ? "#01304a" : full ? "#c2410c" : "#5fca16",
  };
}
