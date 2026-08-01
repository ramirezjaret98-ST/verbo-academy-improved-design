// Adapters that turn the various platform data sources into a single
// list of CalendarEvent objects the shared CalendarView can render.
//
// This is a *read-only projection* — nothing here mutates state. All
// underlying data lives in its canonical store:
//   - Regular classes  → sessions-store (origin: "course")
//   - Workshop live    → sessions-store (origin: "workshop")
//   - Book Clubs       → clubs-store (type: "book")
//   - Insights         → clubs-store (type: "insight")
//   - Spotlights       → sessions-store (origin: "spotlight")
//
// Consumers pass a `teacherId` (or `studentId`) and get back the events
// that surface belongs to. When Spotlight Sessions get their own store,
// wire it here — no CalendarView changes required.

import type { ExtSession, ExtSessionStatus, AttendanceSubStatus } from "./sessions-store";
import { loadSessions, SUB_STATUS_META } from "./sessions-store";
import { loadClubs, type Club, type ClubType, type TimeStatus } from "./clubs-store";
import { groupsByStudentId } from "./groups-store";
import { isBooked } from "./club-bookings-store";
import {
  STATUS_PALETTE,
  SUBSTITUTION_COLOR,
  ABSENT_SUB_GRADIENT,
  isPendingStatusKey,
} from "./status-palette";



export type CalendarEventKind =
  | "class"        // 1:1 Performance Session (course)
  | "workshop"     // Focus Workshop live session
  | "insight"      // Verbo Insight (club)
  | "book_club"    // Book Club (club)
  | "spotlight";   // Spotlight Session

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  date: string;            // ISO
  duration_minutes: number;
  title: string;
  subtitle?: string;
  status?: ExtSessionStatus | TimeStatus;
  origin?: "course" | "workshop" | "spotlight";
  // ---- Group indicator (Performance Sessions groups) ----
  // When true, the event pill renders a "G" badge instead of the default
  // "1:1" badge, and the title is the Group Name.
  is_group?: boolean;
  group_id?: string;
  // ---- Club chip enrichment ----
  spots_taken?: number;
  spots_total?: number;
  enrolled_names?: string[];
  /** True when the currently-viewed student already has a seat in this club.
   *  Only set by student-scoped adapters; teacher adapters leave it undefined. */
  booked?: boolean;
  /** Refinement of Absent/Cancelled status. When set, the pill renders the
   *  2-letter initials + the sub-status color instead of the base color. */
  sub_status?: AttendanceSubStatus;
  /** True when this event is a Bulk Scheduler holiday-replacement session. */
  holiday_makeup?: boolean;
  /** True when the original teacher was replaced by a substitute. Only the
   *  staff-facing calendars surface this (substitutionAware). */
  covered_by_substitute?: boolean;

  // Passthrough refs so click handlers can open the right modal / route.
  session?: ExtSession;
  club?: Club;
}



function sessionEvent(s: ExtSession, title: string, subStatus?: AttendanceSubStatus): CalendarEvent {
  return {
    id: s.id,
    kind: s.origin === "workshop" ? "workshop" : s.origin === "spotlight" ? "spotlight" : "class",
    date: s.date_time,
    duration_minutes: s.duration_minutes,
    title,
    subtitle: s.workshop_topic,
    status: s.status,
    origin: s.origin ?? "course",
    is_group: !!s.group_id,
    group_id: s.group_id,
    sub_status: subStatus ?? s.attendance_sub_status,
    holiday_makeup: s.holiday_makeup,
    covered_by_substitute: s.covered_by_substitute,

    session: s,
  };
}


// Deterministic enrolled-student placeholders — the seed data only tracks
// spots_taken counts, so we hydrate a stable list of names for the hover
// popover. When the real roster ships, replace with a lookup here.
const CLUB_NAME_POOL = [
  "Elena Ruiz", "Marco Silva", "Yuki Tanaka", "Ana Torres", "Liam Bennett",
  "Priya Shah", "Noah Kim", "Sofía López", "Mateo Rossi", "Grace Lee",
  "Diego Álvarez", "Emma Wright", "Hana Sato", "Kai Nakamura", "Isabela Costa",
  "Owen Fischer", "Camila Vega", "Ruben Ortiz", "Aiko Mori", "Jonas Weber",
  "Zara Ahmed", "Luca Bianchi", "Nora Park", "Theo Rossi", "Maya Chen",
  "Felix Meyer", "Yara Haddad", "Iker Núñez", "Elif Demir", "Aarav Patel",
];
function enrolledNamesFor(c: Club): string[] {
  const taken = Math.max(0, Math.min(c.spots_taken ?? 0, CLUB_NAME_POOL.length));
  return CLUB_NAME_POOL.slice(0, taken);
}
function clubEvent(c: Club): CalendarEvent {
  return {
    id: c.id,
    kind: c.type === "book" ? "book_club" : "insight",
    date: c.date,
    duration_minutes: c.duration_minutes,
    title: c.title,
    subtitle: c.type === "book" ? "Book Club" : "Insight",
    status: c.status,
    spots_taken: c.spots_taken,
    spots_total: c.spots_total,
    enrolled_names: enrolledNamesFor(c),
    club: c,
  };
}

/** Every event the given teacher should see on their calendar. */
export function teacherCalendarEvents(teacherId: string, opts?: {
  studentNameOf?: (id: string) => string | undefined;
  cohortNameOf?: (id: string) => string | undefined;
}): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const gMap = groupsByStudentId();

  // Sessions — classes + workshop live sessions live in the same store.
  for (const s of loadSessions()) {
    if (s.teacher_id !== teacherId) continue;
    if (s.origin === "workshop") {
      const name = opts?.cohortNameOf?.(s.workshop_cohort_id ?? "") ?? "Workshop cohort";
      events.push(sessionEvent(s, name));
    } else {
      // Group session: use the shared Group Name instead of a single student.
      const g = s.group_id
        ? (gMap.get(s.student_id) ?? null)
        : null;
      const name = g ? g.name : (opts?.studentNameOf?.(s.student_id) ?? "Student");
      events.push(sessionEvent(s, name));
    }
  }

  // Clubs — Insights + Book Clubs the teacher has claimed / been assigned.
  for (const c of loadClubs()) {
    if (c.teacher_id === teacherId) events.push(clubEvent(c));
  }

  return events;
}

/** Every event a student should see on their calendar. Mirrors the teacher
 *  adapter but scoped to the student's own sessions + booked clubs. */
export function studentCalendarEvents(studentId: string, opts?: {
  teacherNameOf?: (id: string) => string | undefined;
}): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const s of loadSessions()) {
    const isMember = !!s.member_statuses && Object.keys(s.member_statuses).includes(studentId);
    if (s.student_id !== studentId && !isMember) continue;
    if (s.origin === "workshop") continue;
    const teacherName = opts?.teacherNameOf?.(s.teacher_id) ?? "Teacher";
    // For group sessions the student's own sub-status is the one we render.
    const memberSub = s.group_id ? s.member_sub_statuses?.[studentId] : undefined;
    const ev = sessionEvent(s, `Session with ${teacherName}`, memberSub);
    events.push(ev);
  }
  // Verbo Insights + Book Clubs — every upcoming/live club is visible on the
  // student calendar so they can browse and open the reservation modal from
  // there. Cancelled clubs are hidden. Cap/plan gating happens at reserve time.
  for (const c of loadClubs()) {
    if (c.type !== "insight" && c.type !== "book") continue;
    if (c.status === "cancelled") continue;
    const ev = clubEvent(c);
    ev.booked = isBooked(studentId, c.id);
    events.push(ev);
  }
  return events;
}

/** Admin cross-view: intersection of a teacher and/or student's events.
 *  Read-only — powers the Admin > Calendar > Overview screen. Returns [] when
 *  neither id is provided (the page renders its own empty state). */
export function adminCalendarEvents(opts?: {
  teacherId?: string;
  studentId?: string;
}): CalendarEvent[] {
  const teacherId = opts?.teacherId?.trim() || undefined;
  const studentId = opts?.studentId?.trim() || undefined;
  if (!teacherId && !studentId) return [];

  const events: CalendarEvent[] = [];
  const gMap = groupsByStudentId();

  for (const s of loadSessions()) {
    const teacherOk = !teacherId || s.teacher_id === teacherId;
    const isMember = !!s.member_statuses && !!studentId && Object.keys(s.member_statuses).includes(studentId);
    const studentOk = !studentId || s.student_id === studentId || isMember;
    if (!teacherOk || !studentOk) continue;
    // Workshops have no per-student scope; hide them whenever a student filter is active.
    if (s.origin === "workshop" && studentId) continue;

    let title: string;
    if (s.origin === "workshop") {
      title = "Workshop cohort";
    } else if (s.group_id) {
      const g = gMap.get(s.student_id);
      title = g ? g.name : "Group session";
    } else if (s.origin === "spotlight") {
      title = "Spotlight Session";
    } else {
      title = "1:1 Session";
    }
    const memberSub = s.group_id && studentId ? s.member_sub_statuses?.[studentId] : undefined;
    events.push(sessionEvent(s, title, memberSub));
  }

  for (const c of loadClubs()) {
    if (c.type !== "insight" && c.type !== "book") continue;
    if (teacherId && c.teacher_id !== teacherId) continue;
    if (studentId && !isBooked(studentId, c.id)) continue;
    if (studentId && c.status === "cancelled") continue;
    const ev = clubEvent(c);
    if (studentId) ev.booked = true;
    events.push(ev);
  }



  return events;
}




/** True when a club event has no seats left. Full clubs never pulse and are
 *  rendered dimmed in the calendar. */
export function isClubFull(ev: CalendarEvent): boolean {
  return ev.spots_total != null && (ev.spots_taken ?? 0) >= ev.spots_total;
}


/** Meta a chip/legend can render for each supported event kind.
 *  `class` has no identity color of its own — its pill color always comes from
 *  the session status; the value here is only a neutral fallback for events
 *  that arrive without a status. */
export const EVENT_KIND_META: Record<CalendarEventKind, { label: string; color: string; borderColor?: string; short: string }> = {
  class:      { label: "Performance Session", color: STATUS_PALETTE.scheduled.color, borderColor: STATUS_PALETTE.scheduled.borderColor, short: "1:1" },
  workshop:   { label: "Workshop",       color: "#3300ff", short: "WS" },
  insight:    { label: "Insight",        color: "#01304a", short: "IN" },
  book_club:  { label: "Book Club",      color: "#c2410c", short: "BC" },
  spotlight:  { label: "Spotlight",      color: "#2dd4bf", short: "SP" },
};

/** The canonical statuses, in the order they appear in the legend. */
export const CALENDAR_STATUS_META: Record<ExtSessionStatus, { label: string; color: string; borderColor?: string }> = STATUS_PALETTE;

export const CANONICAL_STATUS_ORDER: ExtSessionStatus[] = [
  "scheduled", "ready", "completed", "absent", "cancelled", "pending_reschedule", "no_show", "delayed",
];

/** True for statuses where the session still hasn't happened. "rearranged" is
 *  treated exactly like "rescheduled". */
export function isPendingStatus(status?: ExtSessionStatus): boolean {
  return isPendingStatusKey(status);
}

/** VISUAL-ONLY derivation: a club (Insight / Book Club) still marked "upcoming"
 *  whose end time (date + duration) has already passed never actually happened — no
 *  teacher assigned, no report uploaded. It is painted as "Missed" (the same
 *  muted grey as cancelled). The stored club.status is NEVER changed. */
export function isMissedClubEvent(ev: CalendarEvent, now: Date = new Date()): boolean {
  if (ev.kind !== "insight" && ev.kind !== "book_club") return false;
  if (ev.status === "completed" || ev.status === "cancelled") return false;
  const start = new Date(ev.date).getTime();
  if (Number.isNaN(start)) return false;
  const end = start + (ev.duration_minutes ?? 0) * 60_000;
  return end < now.getTime();
}

function substitutionApplies(ev: CalendarEvent, substitutionAware?: boolean): boolean {
  return !!substitutionAware && !!ev.covered_by_substitute && isPendingStatus(ev.status as ExtSessionStatus | undefined);
}

/** Renderer helper: given an event, return the pill background + short label to
 *  display in the calendar cell. Priority: substitution → sub-status →
 *  class status → kind. `color` may be a CSS background (gradient) string. */
export function eventPillDisplay(
  ev: CalendarEvent,
  opts?: { substitutionAware?: boolean },
): { color: string; borderColor?: string; short: string; cellLabel: string } {
  if (isMissedClubEvent(ev)) {
    return { color: STATUS_PALETTE.cancelled.color, short: EVENT_KIND_META[ev.kind].short, cellLabel: "Missed" };
  }
  if (substitutionApplies(ev, opts?.substitutionAware)) {
    return { color: SUBSTITUTION_COLOR, short: "SUB", cellLabel: "Substitution" };
  }
  if (ev.sub_status) {
    const meta = SUB_STATUS_META[ev.sub_status];
    const isJustifiedAbsence =
      ev.sub_status === "absent_work" || ev.sub_status === "absent_illness" || ev.sub_status === "absent_vacation";
    return {
      color: isJustifiedAbsence ? ABSENT_SUB_GRADIENT : meta.color,
      short: meta.initials,
      cellLabel: meta.initials,
    };
  }
  const kind = EVENT_KIND_META[ev.kind];
  const status = ev.status as ExtSessionStatus | undefined;
  const statusMeta = ev.kind === "class" && status ? CALENDAR_STATUS_META[status] : undefined;
  const color = statusMeta?.color ?? kind.color;
  const borderColor = statusMeta ? statusMeta.borderColor : kind.borderColor;
  const cellLabel = status && (status === "absent" || status === "cancelled")
    ? CALENDAR_STATUS_META[status].label
    : "";
  return { color, borderColor, short: ev.is_group ? "G" : kind.short, cellLabel };
}

/** Accent theme for MODAL HEADERS. Same priority chain as eventPillDisplay,
 *  but clubs and a few statuses get a gradient background. */
export function calendarEventTheme(
  ev: CalendarEvent,
  opts?: { substitutionAware?: boolean },
): { background: string; solid: string; textTone: "light" | "dark" } {
  if (isMissedClubEvent(ev)) {
    return { background: STATUS_PALETTE.cancelled.color, solid: STATUS_PALETTE.cancelled.color, textTone: "light" };
  }
  if (substitutionApplies(ev, opts?.substitutionAware)) {
    return { background: SUBSTITUTION_COLOR, solid: SUBSTITUTION_COLOR, textTone: "light" };
  }
  if (ev.sub_status) {
    const meta = SUB_STATUS_META[ev.sub_status];
    const isJustifiedAbsence =
      ev.sub_status === "absent_work" || ev.sub_status === "absent_illness" || ev.sub_status === "absent_vacation";
    return {
      background: isJustifiedAbsence ? ABSENT_SUB_GRADIENT : meta.color,
      solid: isJustifiedAbsence ? "#dc0000" : meta.color,
      textTone: "light",
    };
  }

  const status = ev.status as ExtSessionStatus | undefined;
  if (ev.kind === "class" && status) {
    if (status === "rescheduled" || status === "rearranged") {
      return { background: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)", solid: "#f97316", textTone: "light" };
    }
    if (status === "absent") {
      return { background: ABSENT_SUB_GRADIENT, solid: "#dc0000", textTone: "light" };
    }
    const meta = CALENDAR_STATUS_META[status];
    return { background: meta.color, solid: meta.color, textTone: status === "scheduled" ? "dark" : "light" };
  }

  const byKind: Record<CalendarEventKind, { background: string; solid: string }> = {
    class:     { background: STATUS_PALETTE.scheduled.color, solid: STATUS_PALETTE.scheduled.color },
    workshop:  { background: EVENT_KIND_META.workshop.color, solid: EVENT_KIND_META.workshop.color },
    insight:   { background: "linear-gradient(135deg, #01304a 0%, #05070a 100%)", solid: "#01304a" },
    book_club: { background: "linear-gradient(135deg, #c2410c 0%, #000000 100%)", solid: "#c2410c" },
    spotlight: { background: EVENT_KIND_META.spotlight.color, solid: EVENT_KIND_META.spotlight.color },
  };
  const theme = byKind[ev.kind];
  return { ...theme, textTone: ev.kind === "class" ? "dark" : "light" };
}

