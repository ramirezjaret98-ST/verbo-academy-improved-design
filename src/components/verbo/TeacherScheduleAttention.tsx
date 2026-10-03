import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/verbo/ui";
import { supabase } from "@/integrations/supabase/client";
import { loadScheduleEvents, SCHEDULE_EVENTS, type ScheduleEvent } from "@/lib/session-schedule-events-store";
import { legacyToUuid } from "@/lib/user-id-bridge";
import { teacherScheduleAlerts, scheduleChangeDate, scheduleChangeDirection } from "@/lib/teacher-schedule-alerts";
import type { ExtSession } from "@/lib/sessions-store";
import { userById } from "@/lib/mock-data";

export function useTeacherScheduleAttention(teacherId: string | undefined, sessions: ExtSession[]) {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEvents(loadScheduleEvents());
    const refresh = () => setEvents(loadScheduleEvents());
    window.addEventListener(SCHEDULE_EVENTS, refresh);
    return () => window.removeEventListener(SCHEDULE_EVENTS, refresh);
  }, []);
  useEffect(() => {
    let active = true;
    if (!teacherId) return () => { active = false; };
    const refreshAcknowledgements = async () => {
      const uuid = await legacyToUuid(teacherId);
      if (!uuid) return;
      const { data, error } = await supabase.from("teacher_schedule_acknowledgements" as never)
        .select("event_id").eq("teacher_id", uuid);
      if (active && !error) {
        setAcknowledged(new Set(((data ?? []) as Array<{ event_id: string }>).map((row) => row.event_id)));
        setLoadedFor(teacherId);
      }
      if (active && error) toast.error("Could not load schedule acknowledgements.");
    };
    void refreshAcknowledgements();
    const onFocus = () => void refreshAcknowledgements();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refreshAcknowledgements(); }, 60_000);
    return () => { active = false; window.removeEventListener("focus", onFocus); window.clearInterval(interval); };
  }, [teacherId, events]);
  const alerts = useMemo(() => teacherId && loadedFor === teacherId
    ? teacherScheduleAlerts(teacherId, sessions, events, acknowledged)
    : [], [teacherId, loadedFor, sessions, events, acknowledged]);
  const acknowledge = async (eventIds: string[]) => {
    if (!teacherId || saving || !eventIds.length) return;
    setSaving(true);
    try {
      const uuid = await legacyToUuid(teacherId);
      if (!uuid) throw new Error("Teacher account unavailable");
      const { error } = await supabase.from("teacher_schedule_acknowledgements" as never)
        .upsert(eventIds.map((event_id) => ({ event_id, teacher_id: uuid })) as never[],
          { onConflict: "event_id,teacher_id", ignoreDuplicates: true });
      if (error) throw error;
      setAcknowledged((previous) => new Set([...previous, ...eventIds]));
      toast.success("Schedule change acknowledged.");
    } catch {
      toast.error("Could not save the acknowledgement. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const attentionIds = useMemo(() => new Set(alerts.flatMap((alert) => alert.events.map((event) => String(event.session_id)))), [alerts]);
  return { alerts, attentionIds, acknowledge, saving };
}

export function TeacherScheduleAttention({ attention, inCalendar = false }: {
  attention: ReturnType<typeof useTeacherScheduleAttention>;
  inCalendar?: boolean;
}) {
  if (!attention.alerts.length) return null;
  return <section className="space-y-3" aria-label="Schedule changes requiring attention">
    {attention.alerts.map((alert) => <Card key={alert.id}
      className="verbo-focus-pulse border-2 border-[#b52904] bg-orange-50/90 [--verbo-focus-pulse-color:#b52904] motion-reduce:animate-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#9a3412]">Schedule changed · Please review</p>
          <h2 className="mt-1 text-lg font-semibold text-[#01304a]">
            {alert.scope === "regular" ? "Regular schedule updated" : "Session rescheduled"}
          </h2>
          <p className="text-sm text-[#01304a]">
            {alert.events.length === 1 ? "1 session" : `${alert.events.length} sessions`} · Confirmed by admin. Your acknowledgement records that you saw this change.
          </p>
        </div>
        <div className="flex gap-2">
          {!inCalendar && <Link to="/teacher/calendar" search={{ highlight: undefined }} className="rounded-full border border-[#01304a] px-4 py-2 text-sm font-semibold text-[#01304a]">Open calendar</Link>}
          <button type="button" disabled={attention.saving}
            onClick={() => void attention.acknowledge(alert.events.map((event) => event.id))}
            className="rounded-full bg-[#01304a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {attention.saving ? "Saving…" : "I have seen this"}
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {alert.events.slice(0, 3).map((event) => <ScheduleChangeRow key={event.id} event={event} />)}
        {alert.events.length > 3 && <details className="text-sm text-[#01304a]">
          <summary className="cursor-pointer font-semibold">Show {alert.events.length - 3} more changed sessions</summary>
          <div className="mt-2 space-y-2">{alert.events.slice(3).map((event) => <ScheduleChangeRow key={event.id} event={event} />)}</div>
        </details>}
      </div>
    </Card>)}
  </section>;
}

function ScheduleChangeRow({ event }: { event: ScheduleEvent }) {
  const direction = scheduleChangeDirection(event.previous_date_time, event.date_time);
  return <div className="rounded-xl border border-orange-200 bg-white/80 px-3 py-2 text-sm text-[#01304a]">
    <span className="font-semibold">{userById(event.student_id ?? "")?.name ?? "Student"}</span>
    <span className="ml-2">{event.previous_date_time ? scheduleChangeDate(event.previous_date_time) : "Previous slot unavailable"} → <strong>{scheduleChangeDate(event.date_time)}</strong></span>
    {direction && <span className="ml-2 rounded-full bg-[#b52904] px-2 py-0.5 text-xs font-bold text-white">{direction}</span>}
  </div>;
}

