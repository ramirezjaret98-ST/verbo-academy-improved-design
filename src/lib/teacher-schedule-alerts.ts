import type { ExtSession } from "./sessions-store";
import type { ScheduleEvent } from "./session-schedule-events-store";

export interface TeacherScheduleAlert {
  id: string;
  scope: "one_off" | "regular";
  events: ScheduleEvent[];
  firstSession: ExtSession;
  changedAt: string;
}

/** One pending notice per committed change, not one notice per future class. */
export function teacherScheduleAlerts(
  teacherId: string,
  sessions: ExtSession[],
  events: ScheduleEvent[],
  acknowledgedEventIds: ReadonlySet<string>,
  now = Date.now(),
): TeacherScheduleAlert[] {
  const currentSessions = new Map(sessions.map((session) => [Number(session.id), session]));
  const latestBySession = new Map<number, ScheduleEvent>();
  for (const event of [...events].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))) {
    if (event.kind !== "admin_rescheduled" && event.kind !== "reschedule_approved") continue;
    if (latestBySession.has(event.session_id)) continue;
    latestBySession.set(event.session_id, event);
  }

  const groups = new Map<string, ScheduleEvent[]>();
  for (const event of latestBySession.values()) {
    if (!event.change_scope) continue;
    const session = currentSessions.get(event.session_id);
    if (!session || session.teacher_id !== teacherId || event.teacher_id !== teacherId) continue;
    if (!["scheduled", "ready", "rescheduled", "rearranged", "delayed"].includes(session.status)) continue;
    if (+new Date(session.date_time) < now - 60 * 60_000) continue;
    if (acknowledgedEventIds.has(event.id)) continue;
    const key = event.batch_id ?? event.id;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups].map(([id, group]) => {
    group.sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));
    const firstSession = currentSessions.get(group[0].session_id)!;
    return {
      id,
      scope: group[0].change_scope as "one_off" | "regular",
      events: group,
      firstSession,
      changedAt: group.reduce((latest, event) => event.created_at > latest ? event.created_at : latest, group[0].created_at),
    };
  }).sort((a, b) => +new Date(a.firstSession.date_time) - +new Date(b.firstSession.date_time));
}

const MEXICO_TIME = "America/Mexico_City";
export function scheduleChangeDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MEXICO_TIME, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

export function scheduleChangeDirection(previous: string | null, current: string): string | null {
  if (!previous) return null;
  const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TIME, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
  if (localDay(previous) !== localDay(current)) return null;
  const minutes = Math.round((+new Date(current) - +new Date(previous)) / 60_000);
  if (!minutes || Math.abs(minutes) >= 24 * 60) return null;
  const amount = Math.abs(minutes);
  const duration = amount % 60 === 0 ? `${amount / 60} h` : `${amount} min`;
  return `${duration} ${minutes < 0 ? "antes" : "después"}`;
}
