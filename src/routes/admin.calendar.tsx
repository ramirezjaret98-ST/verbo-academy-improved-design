import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, X, Video, FileText, CalendarClock, RefreshCcw, ClipboardList, NotebookPen } from "lucide-react";
import { USERS, userById } from "@/lib/mock-data";
import { subscribeStudents } from "@/lib/students-store";
import { subscribeTeachers } from "@/lib/teacher-model";
import { notifySuccess } from "@/lib/notify";
import { Card, GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { CalendarView } from "@/components/verbo/CalendarView";
import {
  adminCalendarEvents,
  EVENT_KIND_META,
  CALENDAR_STATUS_META,
  type CalendarEvent,
} from "@/lib/calendar-events";
import { groupsByStudentId } from "@/lib/groups-store";
import {
  updateSession, subscribeSessions, WORKSHOP_STATUS_META,
  type ExtSessionStatus,
} from "@/lib/sessions-store";
import { SessionReportModal, hasSessionReport } from "@/components/verbo/SessionReportModal";
import { RescheduleModal } from "@/components/verbo/RescheduleModal";
import { PlanModal } from "@/components/verbo/PlanModal";
import { getLessonPlan, saveLessonPlan } from "@/lib/lesson-plans-store";

// A session hasn't happened yet in any of these statuses — safe to bump to
// "ready" after (re)saving its lesson plan, mirroring what the teacher's own
// Planning modal does. A completed/absent/cancelled/no_show session keeps
// its real status even if Admin edits its plan after the fact.
const UPCOMING_STATUSES = new Set<ExtSessionStatus>(["scheduled", "ready", "rescheduled", "rearranged", "pending_reschedule", "delayed"]);

// The same 7 statuses Admin > Sessions offers in its edit dropdown — kept in
// sync with that page's STATUS_OPTIONS rather than re-deriving it, since this
// modal is meant to be a shortcut to the same engine, not a parallel one.
const STATUS_OPTIONS: ExtSessionStatus[] = [
  "scheduled", "ready", "completed", "absent", "cancelled", "pending_reschedule", "no_show",
];

const BRAND = "#01304a";

export const Route = createFileRoute("/admin/calendar")({ component: Page });

function Page() {
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [tick, setTick] = useState(0);

  // This page used to be purely read-only, so nothing here ever needed to
  // react to session changes made elsewhere. Now that the event modal below
  // can reschedule / change status directly, the calendar needs to reflect
  // that (and any other admin's edits) without a manual refresh.
  useEffect(() => subscribeSessions(() => setTick((n) => n + 1)), []);
  // 2026-08-26 fix: `teachers`/`students` below used to be memoized with an
  // empty dep array — frozen forever after the first render, AND never
  // pruned the hidden demo people from mock-data.ts (a deletion made on
  // another device/page would never disappear from this picker without a
  // hard reload). Now recomputed whenever the roster actually changes.
  useEffect(() => subscribeStudents(() => setTick((n) => n + 1)), []);
  useEffect(() => subscribeTeachers(() => setTick((n) => n + 1)), []);
  const teachers = useMemo(() => USERS.filter((u) => u.role === "teacher"), [tick]);
  const students = useMemo(() => USERS.filter((u) => u.role === "student"), [tick]);

  const hasFilter = !!teacherId || !!studentId;
  const events = useMemo(
    () => adminCalendarEvents({ teacherId: teacherId || undefined, studentId: studentId || undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teacherId, studentId, tick],
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

// 2026-08-19: exported so the Tablet quick-actions view can open this exact
// modal (Reschedule / Change status / Edit lesson plan, all wired to the
// same RescheduleModal/PlanModal/updateSession() this page already uses)
// for a session picked from its own "today/tomorrow" list or its embedded
// Calendar Overview, instead of re-building a parallel modal.
export function EventDetailsModal({
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
  const showReport = s ? hasSessionReport(s) : false;
  const [reportOpen, setReportOpen] = useState(false);

  // 2026-08-19: "command center" shortcuts — Jaret wants to reschedule /
  // change status right from this modal instead of hopping to Admin >
  // Sessions, reusing the exact same engines that page already uses
  // (RescheduleModal, updateSession()) rather than building new ones.
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [statusEditing, setStatusEditing] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ExtSessionStatus>((s?.status ?? "scheduled") as ExtSessionStatus);
  const [pendingAbsentCause, setPendingAbsentCause] = useState<"student" | "teacher">(s?.absent_cause ?? "student");
  const plan = s ? getLessonPlan(s.id) : undefined;

  const saveStatus = () => {
    if (!s) return;
    updateSession(s.id, {
      status: pendingStatus,
      ...(pendingStatus === "absent" ? { absent_cause: pendingAbsentCause } : {}),
    });
    setStatusEditing(false);
    notifySuccess("Session status updated.");
    onClose();
  };

  // 2026-08-19: Jaret's actual ask — the same editing power the teacher has
  // via the pencil "Edit lesson plan" on their own calendar (unit/level,
  // session type, comments — everything `PlanModal` covers), from Admin.
  // Concrete case he gave: a teacher cancels last-minute with no one to
  // cover, so Admin ends up giving the class and needs to change what was
  // planned. Reuses `PlanModal` as-is (same component teacher.calendar.tsx
  // renders) — no parallel editor built.
  const [planningOpen, setPlanningOpen] = useState(false);

  // Suppress unused-var warning for teacherIdFilter (kept for symmetry / future).
  void teacherIdFilter;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4"
      // While the Report modal (z-[70]) is stacked on top, ignore backdrop
      // clicks here — otherwise a click on the Report modal's own backdrop
      // bubbles up through this div (fixed positioning doesn't change DOM
      // nesting/bubbling) and closes both modals in one click instead of
      // just the top one.
      onClick={reportOpen ? undefined : onClose}
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

          {/* 2026-08-19: surfaces when the teacher actually created the
             *  lesson plan that moved this session to "ready" — Jaret asked
             *  for this timestamp specifically. Sourced from the same
             *  lesson_plans record the teacher's Planning modal writes
             *  (saved_at + on-time/late), nothing new to compute. */}
          {plan && (
            <div className="flex items-start gap-3">
              <div className="w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Lesson plan
              </div>
              <div className="space-y-0.5 text-xs text-foreground">
                <div>
                  Created {new Date(plan.saved_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" "}
                  <span className={plan.planning_status === "late" ? "font-semibold text-destructive" : "font-medium text-emerald-600"}>
                    ({plan.planning_status === "late" ? "late" : "on time"})
                  </span>
                </div>
                <div className="text-muted-foreground">{plan.title}</div>
              </div>
            </div>
          )}

          {/* 2026-08-14: click-time audit signal — when the teacher and/or
             *  student clicked their own "Connect"/"Join Live Session"
             *  button. NOT confirmed Teams attendance (no Graph API
             *  integration) — a click, nothing more. Only rendered once at
             *  least one side has a timestamp, so older sessions from
             *  before this existed don't show a misleading "no connection"
             *  flag. */}
          {s && (s.teacher_connected_at || s.student_connected_at) && (
            <div className="flex items-start gap-3">
              <div className="w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Connection
              </div>
              <div className="space-y-1 text-xs text-foreground">
                <div>
                  <span className="text-muted-foreground">Teacher clicked Connect — </span>
                  {s.teacher_connected_at ? new Date(s.teacher_connected_at).toLocaleString() : "not yet"}
                </div>
                <div>
                  <span className="text-muted-foreground">Student clicked Connect — </span>
                  {s.student_connected_at ? new Date(s.student_connected_at).toLocaleString() : "not yet"}
                </div>
                <div className="text-muted-foreground/80">Click time, not confirmed Teams attendance.</div>
              </div>
            </div>
          )}

          {/* 2026-08-13: once the teacher has submitted a report for this
             *  session, that's the useful thing to open from here — the call
             *  is over, "Open link" leads nowhere. Report + rating replace
             *  the video-call row; the link itself is kept as a small
             *  secondary reference underneath, not the primary action. */}
          {showReport && s ? (
            <div className="flex items-start gap-3">
              <div className="w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Session
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <button
                  onClick={() => setReportOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: BRAND }}
                >
                  <FileText className="h-3.5 w-3.5" /> View Report & Rating
                </button>
                {videoLink && (
                  <a
                    href={videoLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                  >
                    <Video className="h-3 w-3" /> Video link
                  </a>
                )}
              </div>
            </div>
          ) : (
            videoLink && (
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
            )
          )}
        </div>

        {s ? (
          <div className="border-t border-border bg-secondary/40 px-5 py-3">
            {statusEditing ? (
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    New status
                  </label>
                  <select
                    value={pendingStatus}
                    onChange={(e) => setPendingStatus(e.target.value as ExtSessionStatus)}
                    className="cursor-pointer rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{WORKSHOP_STATUS_META[opt].label}</option>
                    ))}
                  </select>
                </div>
                {pendingStatus === "absent" && (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Caused by
                    </label>
                    <select
                      value={pendingAbsentCause}
                      onChange={(e) => setPendingAbsentCause(e.target.value as "student" | "teacher")}
                      className="cursor-pointer rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                    </select>
                  </div>
                )}
                <PrimaryButton onClick={saveStatus} className="!px-3 !py-1.5 !text-xs">Save status</PrimaryButton>
                <GhostButton onClick={() => setStatusEditing(false)} className="!px-3 !py-1.5 !text-xs">Cancel</GhostButton>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setRescheduleOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                </button>
                <button
                  onClick={() => { setPendingStatus(s.status as ExtSessionStatus); setPendingAbsentCause(s.absent_cause ?? "student"); setStatusEditing(true); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <RefreshCcw className="h-3.5 w-3.5" /> Change status
                </button>
                <button
                  onClick={() => setPlanningOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <NotebookPen className="h-3.5 w-3.5" /> {plan ? "Edit lesson plan" : "Plan session"}
                </button>
                {!showReport && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <ClipboardList className="h-3 w-3" /> No report yet
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-border bg-secondary/40 px-5 py-2.5 text-[11px] text-muted-foreground">
            Clubs are managed from Admin &rsaquo; Clubs.
          </div>
        )}
      </div>

      {reportOpen && s && (
        <SessionReportModal session={s} onClose={() => setReportOpen(false)} />
      )}
      {rescheduleOpen && s && (
        <RescheduleModal
          session={s}
          kind={s.group_id ? "group" : "individual"}
          onClose={() => { setRescheduleOpen(false); onClose(); }}
        />
      )}
      {planningOpen && s && (
        <PlanModal
          session={s}
          existing={plan}
          onClose={() => setPlanningOpen(false)}
          onSave={(p) => {
            saveLessonPlan(p);
            if (UPCOMING_STATUSES.has(s.status as ExtSessionStatus)) {
              updateSession(s.id, { status: "ready" });
            }
            setPlanningOpen(false);
            notifySuccess("Lesson plan saved.");
            onClose();
          }}
        />
      )}
      {/* Reschedule's own Cancel button also routes through this same
         *  onClose — matching Admin > Sessions' usage of the same component
         *  would leave the details modal open afterward, but its snapshot
         *  (date/status) is stale the moment a reschedule succeeds, so this
         *  modal is closed too rather than showing outdated info. */}
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
