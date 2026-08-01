// Single source of truth for session/event STATUS colors across the whole app.
//
// Everything that paints a status (calendar pills, legends, workshop badges,
// dashboard status chips, admin tables, modal headers) reads from here — never
// from a local Tailwind class table. `calendar-events.ts` re-exports this as
// CALENDAR_STATUS_META; `sessions-store.ts` derives WORKSHOP_STATUS_META from it.
//
// Note: "rearranged" is kept for backwards compatibility with existing data but
// is visually identical to "rescheduled" everywhere.

export type StatusPaletteKey =
  | "scheduled"
  | "ready"
  | "completed"
  | "absent"
  | "cancelled"
  | "pending_reschedule"
  | "no_show"
  | "rescheduled"
  | "rearranged"
  | "delayed"
  | "converted_to_spotlight";

export interface StatusPaletteEntry {
  label: string;
  /** Flat hex used as the pill/dot background. */
  color: string;
  /** Only set for the white "scheduled" chip, which needs a visible outline. */
  borderColor?: string;
}

export const STATUS_PALETTE: Record<StatusPaletteKey, StatusPaletteEntry> = {
  scheduled:              { label: "Scheduled",              color: "#ffffff", borderColor: "#cbd5e1" },
  ready:                  { label: "Ready",                  color: "#8b5cf6" },
  completed:              { label: "Completed",              color: "#3cce10" },
  absent:                 { label: "Absent",                 color: "#dc0000" },
  cancelled:              { label: "Cancelled",              color: "#94a3b8" },
  pending_reschedule:     { label: "Pending Reschedule",     color: "#b45309" },
  no_show:                { label: "No Show",                color: "#1d1d1d" },
  rescheduled:            { label: "Rescheduled",            color: "#f97316" },
  // Never rendered differently from "rescheduled".
  rearranged:             { label: "Rescheduled",            color: "#f97316" },
  delayed:                { label: "Delayed",                color: "#ffa800" },
  converted_to_spotlight: { label: "Converted to Spotlight", color: "#2dd4bf" },
};

/** Substitution accent — a covered pending session. */
export const SUBSTITUTION_COLOR = "#b5ff56";
/** Gradient used by justified-absence sub-statuses (AW / AI / AV). */
export const ABSENT_SUB_GRADIENT = "linear-gradient(135deg, #dc0000 0%, #313131 100%)";

/** Statuses that still count as "not yet happened". */
export function isPendingStatusKey(status?: string): boolean {
  return status === "scheduled" || status === "ready" || status === "rescheduled" || status === "rearranged";
}

/** Readable text color for a given status background. */
export function statusTextColor(status: StatusPaletteKey): string {
  return status === "scheduled" ? "#01304a" : "#ffffff";
}
