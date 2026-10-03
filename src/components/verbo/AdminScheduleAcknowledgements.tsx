import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/verbo/ui";
import { supabase } from "@/integrations/supabase/client";
import { loadScheduleEvents, SCHEDULE_EVENTS, type ScheduleEvent } from "@/lib/session-schedule-events-store";
import { loadSessions, subscribeSessions, type ExtSession } from "@/lib/sessions-store";
import { teacherScheduleAlerts, scheduleChangeDate } from "@/lib/teacher-schedule-alerts";
import { userById } from "@/lib/mock-data";
import { waLink } from "@/lib/phone-utils";

/** Operations view of confirmed changes the assigned teacher has yet to acknowledge. */
export function AdminScheduleAcknowledgements() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [sessions, setSessions] = useState<ExtSession[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const refreshEvents = () => setEvents(loadScheduleEvents());
    const refreshSessions = () => setSessions(loadSessions());
    refreshEvents(); refreshSessions();
    window.addEventListener(SCHEDULE_EVENTS, refreshEvents);
    const unsubscribe = subscribeSessions(refreshSessions);
    return () => { window.removeEventListener(SCHEDULE_EVENTS, refreshEvents); unsubscribe(); };
  }, []);
  useEffect(() => {
    let active = true;
    const refreshAcknowledgements = async () => {
      const { data, error } = await supabase.from("teacher_schedule_acknowledgements" as never).select("event_id");
      if (active && !error) {
        setAcknowledged(new Set(((data ?? []) as Array<{ event_id: string }>).map((row) => row.event_id)));
        setLoaded(true);
      }
    };
    void refreshAcknowledgements();
    const onFocus = () => void refreshAcknowledgements();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refreshAcknowledgements(); }, 60_000);
    return () => { active = false; window.removeEventListener("focus", onFocus); window.clearInterval(interval); };
  }, [events]);
  const pending = useMemo(() => {
    if (!loaded) return [];
    const teacherIds = new Set(sessions.map((session) => session.teacher_id));
    return [...teacherIds].flatMap((teacherId) => teacherScheduleAlerts(teacherId, sessions, events, acknowledged))
      .sort((a, b) => +new Date(a.firstSession.date_time) - +new Date(b.firstSession.date_time));
  }, [loaded, sessions, events, acknowledged]);
  if (!pending.length) return null;
  return <Card className="border border-orange-300 bg-orange-50/70">
    <h2 className="text-lg font-semibold text-[#01304a]">Teacher schedule changes awaiting acknowledgement</h2>
    <p className="mt-1 text-sm text-muted-foreground">An acknowledgement records awareness. The scheduled class is already confirmed.</p>
    <div className="mt-3 space-y-2">
      {pending.map((group) => {
        const teacher = userById(group.firstSession.teacher_id);
        const digits = teacher?.phone?.replace(/\D/g, "") ?? "";
        const text = `Verbo Academy: ${group.scope === "regular" ? "tu horario habitual cambió" : "tu sesión se reagendó"}. ` +
          group.events.slice(0, 3).map((event) => `${scheduleChangeDate(event.previous_date_time)} → ${scheduleChangeDate(event.date_time)}`).join("; ") +
          (group.events.length > 3 ? `; y ${group.events.length - 3} sesiones más.` : ".") +
          " Revisa tu calendario en Academy y marca Enterado.";
        return <div key={`${group.firstSession.teacher_id}:${group.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm">
          <div><strong>{teacher?.name ?? "Teacher"}</strong>
            <span> · {group.scope === "regular" ? "Regular schedule update" : "Rescheduled session"}</span>
            <span> · {group.events.length} {group.events.length === 1 ? "session" : "sessions"}</span>
            <span> · Next: {scheduleChangeDate(group.firstSession.date_time)}</span>
          </div>
          {digits.length >= 10 && digits.length <= 15 ?
            <a href={`${waLink(teacher!.phone!)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#01304a] px-3 py-1 font-semibold text-[#01304a]">Open WhatsApp draft</a> :
            <span className="text-xs font-semibold text-[#9a3412]">Teacher phone needed for WhatsApp</span>}
        </div>;
      })}
    </div>
  </Card>;
}
