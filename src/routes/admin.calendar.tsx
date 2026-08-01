import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, X, Video } from "lucide-react";
import { USERS, userById } from "@/lib/mock-data";
import { Card } from "@/components/verbo/ui";
import { CalendarView } from "@/components/verbo/CalendarView";
import {
  adminCalendarEvents,
  EVENT_KIND_META,
  CALENDAR_STATUS_META,
  type CalendarEvent,
} from "@/lib/calendar-events";
import { groupsByStudentId } from "@/lib/groups-store";
import type { ExtSessionStatus } from "@/lib/sessions-store";

const BRAND = "#01304a";

export const Route = createFileRoute("/admin/calendar")({ component: Page });

function Page() {
  const teachers = useMemo(() => USERS.filter((u) => u.role === "teacher"), []);
  const students = useMemo(() => USERS.filter((u) => u.role === "student"), []);
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);

  const hasFilter = !!teacherId || !!studentId;
  const events = useMemo(
    () => adminCalendarEvents({ teacherId: teacherId || undefined, studentId: studentId || undefined }),
    [teacherId, studentId],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only overview crossing student, teacher, and schedule. Pick a teacher, a student, or both to view their calendar.
        </p>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground">Teacher</label>
            <select
              className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">Select a teacher</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Student</label>
            <select
              className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Select a student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.company ? ` — ${s.company}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {hasFilter ? (
        <CalendarView events={events} onEventClick={(ev) => setOpenEvent(ev)} substitutionAware />
      ) : (
        <Card className="!p-12">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div
              className="grid h-14 w-14 place-items-center rounded-full text-white"
              style={{ backgroundColor: BRAND }}
            >
              <CalendarDays className="h-6 w-6" />
            </div>
            <div className="text-sm font-semibold text-foreground">Nothing to show yet</div>
            <div className="max-w-sm text-sm text-muted-foreground">
              Select a teacher or a student to see their calendar.
            </div>
          </div>
        </Card>
      )}

      {openEvent && (
        <EventDetailsModal
          event={openEvent}
          teacherIdFilter={teacherId || undefined}
          studentIdFilter={studentId || undefined}
          onClose={() => setOpenEvent(null)}
        />
      )}
    </div>
  );
}

function EventDetailsModal({
  event,
  teacherIdFilter,
  studentIdFilter,
  onClose,
}: {
  event: CalendarEvent;
  teacherIdFilter?: string;
  studentIdFilter?: string;
  onClose: () => void;
}) {
  const kindMeta = EVENT_KIND_META[event.kind];
  const dt = new Date(event.date);
  const dateStr = dt.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endStr = new Date(dt.getTime() + event.duration_minutes * 60_000)
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const s = event.session;
  const c = event.club;
  const teacherName = s
    ? userById(s.teacher_id)?.name
    : c && c.teacher_id
      ? userById(c.teacher_id)?.name
      : undefined;

  // Build student(s) / audience label.
  let audienceLabel = "Students";
  let audienceValue: string;
  if (s) {
    if (s.origin === "workshop") {
      audienceLabel = "Cohort";
      audienceValue = event.title;
    } else if (s.group_id) {
      const gMap = groupsByStudentId();
      const g = gMap.get(s.student_id);
      const memberIds = s.member_statuses ? Object.keys(s.member_statuses) : [];
      const names = memberIds
        .map((id) => userById(id)?.name)
        .filter((n): n is string => !!n);
      audienceLabel = "Group";
      audienceValue = `${g?.name ?? event.title}${names.length ? ` — ${names.join(", ")}` : ""}`;
    } else {
      audienceLabel = "Student";
      audienceValue = userById(s.student_id)?.name ?? "—";
    }
  } else if (c) {
    // Club — no roster in seed data; show the currently-filtered student if any.
    const filteredStudentName = studentIdFilter ? userById(studentIdFilter)?.name : undefined;
    audienceLabel = "Attendees";
    audienceValue = filteredStudentName
      ? `${filteredStudentName} (reserved)`
      : `${c.spots_taken ?? 0}/${c.spots_total ?? 0} seats taken`;
  } else {
    audienceValue = "—";
  }

  const statusMeta = event.status
    ? CALENDAR_STATUS_META[event.status as ExtSessionStatus]
    : undefined;

  const videoLink = s?.teams_link || (c as { meeting_link?: string } | undefined)?.meeting_link;

  // Suppress unused-var warning for teacherIdFilter (kept for symmetry / future).
  void teacherIdFilter;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: kindMeta.color }}
            >
              {kindMeta.label}
            </span>
            <div className="text-sm font-semibold text-foreground">{event.title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm">
          <Row label="When" value={`${dateStr} · ${timeStr}–${endStr}`} />
          <Row label="Type" value={kindMeta.label} />
          <Row label="Teacher" value={teacherName ?? "—"} />
          <Row label={audienceLabel} value={audienceValue} />
          {statusMeta && (
            <div className="flex items-start gap-3">
              <div className="w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </div>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ background: statusMeta.color }}
              >
                {statusMeta.label}
              </span>
            </div>
          )}
          {event.subtitle && <Row label="Details" value={event.subtitle} />}
          {videoLink && (
            <div className="flex items-start gap-3">
              <div className="w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Video call
              </div>
              <a
                href={videoLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium underline"
                style={{ color: BRAND }}
              >
                <Video className="h-3.5 w-3.5" /> Open link
              </a>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-secondary/40 px-5 py-2.5 text-[11px] text-muted-foreground">
          Read-only view. Manage sessions from Admin &rsaquo; Sessions.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}
