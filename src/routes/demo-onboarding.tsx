// Onboarding demo — 2026-08-26, updated 2026-08-29.
//
// Jaret's ask: a fake student "profile" he can pull up live on a call with a
// brand-new student to walk them through how the calendar/sessions flow
// works — real look, real colors, real logic — WITHOUT touching any real
// account or the database. A deliberate mirror of how this app worked
// before Supabase was connected (pure mock data), scoped to just this page.
//
// 2026-08-29 update, per Jaret's follow-up asks:
//   - The "completed" class now carries a real teacher note + a downloadable
//     PDF report (a static demo asset, not a Supabase upload).
//   - Renamed the mock identities to Verbo Student / Verbo Instructor, and
//     the student card shows a filled-in headline + personality tags (there's
//     no self-serve profile editor in the app yet to link to, so this is a
//     read-only mock of "what a completed profile looks like").
//   - Two "scheduled" slots are genuinely clickable via "Can't Attend", and
//     that button now runs the SAME branching the real student flow does
//     (mirrors CancelSessionFlow.tsx's CantAttendRouter / SessionCancellation
//     / RescheduleRequestModal — copy, layout and button styles included)
//     instead of a single canned outcome:
//       a) < 24h notice          → Late Cancellation Warning → Absent.
//       b) 24h+ notice, chooses
//          "Cancel Without Rescheduling" → Cancelled, credit forfeited.
//       c) 24h+ notice, chooses
//          "Reschedule" → date + time-slot picker → "Publish Request" →
//          Pending Reschedule (same as the real app: publishing a request
//          does NOT move the session — it just flips the status while it
//          waits on Admin/teacher approval, which is why this is the one
//          the student "reagenda muchísimo" needs to see end-to-end).
//     All of this is local React state — no store, no Supabase, no real
//     availability data (the time-slot grid below is a small self-contained
//     mock, not the real findAvailableStartSlots).
//
// Safety, by construction (see security_finding_dev_credentials_exposed —
// the old "Developer Sandbox" panel that leaked real passwords):
//   - No `useAuth()`, no Supabase call, no real session of any kind. This
//     route needs no login at all, which is also why it works for a
//     screen-share with someone who doesn't have an account yet.
//   - Every session/click below is a plain in-memory array built once per
//     page load (`useState(() => buildDemoEvents())`) — there is nothing to
//     persist, so a refresh or closing the tab fully resets it, exactly as
//     asked ("como lo hacíamos con localStorage, para que al cerrarlo se
//     reinicie"). The whole cancel/reschedule flow below only ever mutates
//     that same in-memory array via setEvents — still no store, no RPC, no
//     localStorage.
//   - No entry point anywhere in the real nav — reached only via the
//     "Onboarding Demo" button on the Admin dashboard (opens in a new tab).
//   - Reuses the REAL `CalendarView` (already documented as presentation-only
//     — reads no store) and the real status color system
//     (`calendar-events.ts` / `status-palette.ts`) so what Jaret shows a
//     student is pixel-identical to production, and every modal below
//     mirrors the exact markup/copy used in CancelSessionFlow.tsx /
//     SessionReportModal / student.sessions.tsx so this doesn't drift from
//     the real UI.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Sparkles, CalendarClock, Video, Info, FileText, Star, X, AlertTriangle, ArrowLeft, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { CalendarView } from "@/components/verbo/CalendarView";
import { AccentModalHeader, GhostButton, PrimaryButton, Card } from "@/components/verbo/ui";
import {
  calendarEventTheme,
  CALENDAR_STATUS_META,
  type CalendarEvent,
  type CalendarEventKind,
} from "@/lib/calendar-events";
import type { ExtSession, ExtSessionStatus } from "@/lib/sessions-store";
import { Logo } from "@/components/verbo/Logo";

export const Route = createFileRoute("/demo-onboarding")({
  head: () => ({
    meta: [{ title: "Onboarding Demo | Verbo Academy" }],
  }),
  component: DemoOnboardingPage,
});

const DEMO_STUDENT = {
  name: "Verbo Student",
  initials: "VS",
  plan: "Elite",
  level: "B1 — Intermediate",
  teacher: "Verbo Instructor",
  headline: "Marketing lead who wants to run client calls in English with total confidence.",
  personalityTags: ["Curious", "Talkative", "Focused"],
};

// Matches the real default from parseReschedulePolicy() / RescheduleRequestModal's
// copy when a student has no custom override: 24h notice, up to 25% of monthly
// sessions. Quota/used below are illustrative mock numbers for this demo student.
const POLICY_NOTICE_HOURS = 24;
const POLICY_MAX_PCT = 25;
const MOCK_QUOTA = 3;
const MOCK_USED = 1;

const STUDENT_KINDS: CalendarEventKind[] = ["class", "spotlight", "insight", "book_club"];

function atTime(daysFromToday: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Precise offset from right now, in hours — used for the two live cancel-demo
 *  slots so "today, in a few hours" and "well outside the notice window"
 *  are correct no matter what time of day Jaret runs the demo. */
function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Small self-contained stand-in for the real findAvailableStartSlots() —
 *  on-the-hour and on-the-half-hour slots, 9am–6pm, skipping anything
 *  already in the past when the picked date is today. Not tied to any real
 *  teacher's availability; this demo has no store to read one from. */
function mockAvailableSlots(dateYMD: string): string[] {
  const [y, m, d] = dateYMD.split("-").map(Number);
  const slots: string[] = [];
  for (let h = 9; h < 18; h++) {
    for (const min of [0, 30]) {
      const dt = new Date(y, m - 1, d, h, min, 0, 0);
      if (dt.getTime() > Date.now()) slots.push(dt.toISOString());
    }
  }
  return slots;
}

function demoSession(overrides: Partial<ExtSession> & { id: string; date_time: string; status: ExtSessionStatus }): ExtSession {
  return {
    student_id: "demo-student",
    teacher_id: "demo-teacher",
    duration_minutes: 60,
    teams_link: "",
    ...overrides,
  };
}

/** One session per canonical status, spread across ~2 weeks, so every color
 *  in the legend actually appears at least once — that's the whole point,
 *  Jaret explicitly asked for "one of each color" to explain the calendar
 *  logic in an onboarding call, not a full realistic schedule. Two of the
 *  "scheduled" slots are wired to the live Can't Attend flow below. */
function buildDemoEvents(): CalendarEvent[] {
  const completedId = "demo-class-completed";
  const noShowId = "demo-class-no-show";
  const delayedId = "demo-class-delayed";
  const cancelledId = "demo-class-cancelled";
  const readyId = "demo-class-ready";
  const pendingId = "demo-class-pending";
  const rescheduledId = "demo-class-rescheduled";
  const cancelViolateId = "demo-cancel-violate";
  const cancelComplyId = "demo-cancel-comply";

  const events: CalendarEvent[] = [
    {
      id: completedId,
      kind: "class",
      date: atTime(-6, 10),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      status: "completed",
      origin: "course",
      session: demoSession({
        id: completedId,
        date_time: atTime(-6, 10),
        status: "completed",
        report_comments:
          "Great session! We worked on structuring a professional presentation and practiced present perfect vs. past simple. Please review the attached PDF before our next class.",
        report_pdf_url: "/demo/verbo-session-report.pdf",
        student_rating: 5,
        report_submitted_at: atTime(-6, 11),
      }),
    },
    {
      id: noShowId,
      kind: "class",
      date: atTime(-3, 9),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      status: "no_show",
      origin: "course",
    },
    {
      id: delayedId,
      kind: "class",
      date: atTime(-1, 11),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      status: "delayed",
      origin: "course",
    },
    {
      id: cancelledId,
      kind: "class",
      date: atTime(-2, 15),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      status: "cancelled",
      origin: "course",
      session: demoSession({
        id: cancelledId,
        date_time: atTime(-2, 15),
        status: "cancelled",
        cancellation_reason: "personal",
        cancellation_note: "Cancelled with advance notice — no penalty, reschedule available.",
      }),
    },
    {
      id: readyId,
      kind: "class",
      date: atTime(2, 16),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      status: "ready",
      origin: "course",
    },
    {
      id: pendingId,
      kind: "class",
      date: atTime(4, 9),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      status: "pending_reschedule",
      origin: "course",
    },
    {
      id: rescheduledId,
      kind: "class",
      date: atTime(6, 14),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      status: "rescheduled",
      origin: "course",
    },
    // --- Live Can't Attend demo: click either of these two ---
    {
      id: cancelViolateId,
      kind: "class",
      date: hoursFromNow(3),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      subtitle: "Try “Can't Attend” here — it's today",
      status: "scheduled",
      origin: "course",
      session: demoSession({ id: cancelViolateId, date_time: hoursFromNow(3), status: "scheduled" }),
    },
    {
      id: cancelComplyId,
      kind: "class",
      date: atTime(5, 14),
      duration_minutes: 60,
      title: "1:1 Performance Session",
      subtitle: "Try “Can't Attend” here — it's a few days out, so Reschedule is available",
      status: "scheduled",
      origin: "course",
      session: demoSession({ id: cancelComplyId, date_time: atTime(5, 14), status: "scheduled" }),
    },
  ];

  // One non-class kind so the "Filter by type" chips have something to show
  // too — a Spotlight a few days out.
  events.push({
    id: "demo-spotlight-1",
    kind: "spotlight",
    date: atTime(3, 17),
    duration_minutes: 45,
    title: "Spotlight Session",
    status: "scheduled",
  });

  return events;
}

const ACTION_COPY: Partial<Record<ExtSessionStatus, string>> = {
  scheduled: "From here a real student can join the class, or tap Can't Attend if something comes up.",
  ready: "The lesson plan is already saved — the student sees exactly what unit/topic is coming up before class starts.",
  completed: "After class, the report, rating and any homework notes from the teacher show up here.",
  absent: "Marked automatically if the class happened without the student (or the teacher, per the cause shown).",
  cancelled: "This slot won't happen — cancelled ahead of time, no makeup owed unless Jaret says otherwise.",
  pending_reschedule: "The student requested a new time — it's waiting on Admin/teacher approval before it moves.",
  no_show: "Nobody joined and nothing was reported — this is the one Admin usually follows up on.",
  rescheduled: "This was moved to a new date/time — the original slot is freed up.",
  delayed: "The class happened but started late — still counts as attended.",
};

/** Matches the real student.sessions.tsx `canAct` gate: only these statuses
 *  can still be joined / cancelled / rescheduled by a student. */
function canStudentAct(status?: ExtSessionStatus): boolean {
  return status === "scheduled" || status === "ready" || status === "rescheduled";
}

// ---------------------------------------------------------------------------
// Can't Attend flow — mirrors CancelSessionFlow.tsx's real 3 screens.
// ---------------------------------------------------------------------------

function LateCancellationModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-card p-6 ring-1 ring-red-200"
        style={{ boxShadow: "0 10px 30px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.1)" }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Late Cancellation Warning!</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Cancellation received with less than the notice required by your plan ({POLICY_NOTICE_HOURS}h). The session will be marked as Absent and forfeited. No reschedule is available.
            </p>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 cursor-pointer rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90">
            Go Back
          </button>
          <button onClick={onConfirm} className="flex-1 cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-opacity hover:opacity-90">
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionCancellationModal({
  onClose, onReschedule, onCancelNoReschedule,
}: { onClose: () => void; onReschedule: () => void; onCancelNoReschedule: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--navy-100)] text-[#01304a]">
            <CalendarClock className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: "#01304a" }}>Session Cancellation</h3>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your membership allows you to cancel or reschedule up to <strong>{POLICY_MAX_PCT}%</strong> of
            your booked sessions without penalty. You've used <strong>{MOCK_USED} of {MOCK_QUOTA}</strong> reschedules this cycle.
          </p>
        </div>
        <p className="mt-2.5 flex items-start gap-1.5 text-xs font-medium text-emerald-700">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This is the official way to reschedule — it's tracked automatically and your teacher is notified right away.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onReschedule}
            className="w-full cursor-pointer rounded-lg bg-[#f38934] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={onCancelNoReschedule}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
          >
            Cancel Without Rescheduling
          </button>
          <GhostButton className="w-full justify-center" onClick={onClose}>
            <ArrowLeft className="h-3.5 w-3.5" /> Return
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function RescheduleRequestModal({
  onClose, onPublish,
}: { onClose: () => void; onPublish: (slotISO: string) => void }) {
  const [dateYMD, setDateYMD] = useState<string>(todayYMD());
  const [slotISO, setSlotISO] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const slots = useMemo(() => mockAvailableSlots(dateYMD), [dateYMD]);

  const submit = () => {
    if (!slotISO) { setError("Pick one of the available start times."); return; }
    onPublish(slotISO);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" />
          <h3 className="text-base font-semibold text-foreground">Reschedule Request</h3>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pick one of the available start times. Duration is fixed at <strong>60 min</strong> (from your plan). Start times are on the hour or half hour, and require at least {POLICY_NOTICE_HOURS}h notice.
        </p>
        <div className="mt-4">
          <label className="text-xs font-medium text-foreground">Date</label>
          <input
            type="date"
            value={dateYMD}
            min={todayYMD()}
            onChange={(e) => { setDateYMD(e.target.value); setSlotISO(""); setError(null); }}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium text-foreground">Available start times</label>
          {slots.length === 0 ? (
            <div className="mt-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-secondary/30 px-4 py-6 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
              </div>
              <p className="text-xs font-medium text-foreground">No available start times on this date</p>
              <p className="text-xs text-muted-foreground">Try another day.</p>
            </div>
          ) : (
            <div className="mt-2 grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
              {slots.map((iso) => {
                const active = iso === slotISO;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => { setSlotISO(iso); setError(null); }}
                    className={`cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium ring-1 transition-colors ${
                      active ? "bg-[#01304a] text-white ring-[#01304a]" : "bg-background text-foreground ring-input hover:bg-secondary"
                    }`}
                  >
                    {fmtSlotTime(iso)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose}>Return</GhostButton>
          <PrimaryButton onClick={submit}>Publish Request</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session details modal — opened from the calendar.
// ---------------------------------------------------------------------------

function DemoSessionModal({
  event,
  onClose,
  onCantAttend,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onCantAttend: (event: CalendarEvent) => void;
}) {
  const theme = calendarEventTheme(event);
  const status = event.status as ExtSessionStatus | undefined;
  const statusLabel = status ? CALENDAR_STATUS_META[status]?.label : undefined;
  const session = event.session;
  const isCompleted = status === "completed";
  const isAbsent = status === "absent";
  const isCancelled = status === "cancelled";
  const canAct = canStudentAct(status);

  const demoAction = (label: string) =>
    toast(`"${label}" — this is a demo, so nothing was actually changed. In the real app this would take effect immediately.`);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating"
        onClick={(e) => e.stopPropagation()}
      >
        <AccentModalHeader
          background={theme.background}
          iconTint="#ffffff"
          icon={CalendarClock}
          eyebrow={statusLabel ?? "Session"}
          title={event.title}
          textTone={theme.textTone}
          onClose={onClose}
        />
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date &amp; time</div>
              <div className="mt-0.5 font-medium text-foreground">
                {new Date(event.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Teacher</div>
              <div className="mt-0.5 font-medium text-foreground">{DEMO_STUDENT.teacher}</div>
            </div>
          </div>

          {event.subtitle && (
            <div className="flex items-start gap-2 rounded-lg bg-accent/10 p-3 text-xs font-medium text-accent">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{event.subtitle}</span>
            </div>
          )}

          {status && ACTION_COPY[status] && (
            <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{ACTION_COPY[status]}</span>
            </div>
          )}

          {isAbsent && session?.report_comments && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Teacher's notes</div>
              <div className="rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5 text-sm text-muted-foreground">
                {session.report_comments}
              </div>
            </div>
          )}

          {isCancelled && session?.cancellation_note && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cancellation note</div>
              <div className="rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5 text-sm text-muted-foreground">
                {session.cancellation_note}
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="space-y-3">
              {session?.report_comments && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Note for the Student</div>
                  <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground">
                    {session.report_comments}
                  </p>
                </div>
              )}
              {session?.report_pdf_url && (
                <a
                  href={session.report_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#01304a] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <FileText className="h-3.5 w-3.5" /> Open full PDF report
                </a>
              )}
              {typeof session?.student_rating === "number" && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your rating</div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-4 w-4 ${n <= session.student_rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {canAct && (
            <div className="flex items-center gap-2 pt-1">
              <PrimaryButton onClick={() => demoAction("Join class")} className="!flex-1 !px-3.5 !py-2 text-xs">
                <Video className="mr-1.5 h-3.5 w-3.5" /> Join class
              </PrimaryButton>
              <button
                type="button"
                onClick={() => onCantAttend(event)}
                className="inline-flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-opacity hover:opacity-90 active:scale-[0.97]"
              >
                <X className="h-4 w-4" /> Can&apos;t Attend
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type CantAttendStep = "late" | "choice" | "reschedule";

function DemoOnboardingPage() {
  // Built once per page load — nothing here is read from or written to any
  // store, localStorage included, so there is nothing to reset: closing the
  // tab (or just refreshing) already starts completely fresh next time.
  // The one exception is the Can't Attend flow below, which only ever
  // mutates this same in-memory array via setEvents.
  const [events, setEvents] = useState<CalendarEvent[]>(() => buildDemoEvents());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [flow, setFlow] = useState<{ step: CantAttendStep; event: CalendarEvent } | null>(null);
  const bannerNote = useMemo(
    () => "This page uses made-up sessions only, for walking a new student through how the calendar works. Nothing here reads or writes real data — refreshing or closing this tab resets it.",
    [],
  );

  function updateEvent(id: string, patch: (e: CalendarEvent) => CalendarEvent) {
    setEvents((prev) => prev.map((e) => (e.id === id ? patch(e) : e)));
  }

  // Step 1: student taps "Can't Attend" — same branch the real
  // CantAttendRouter uses: not enough notice skips straight to the warning,
  // otherwise they get the Reschedule/Cancel choice.
  function startCantAttend(event: CalendarEvent) {
    setSelected(null);
    const late = hoursUntil(event.date) < POLICY_NOTICE_HOURS;
    setFlow({ step: late ? "late" : "choice", event });
  }

  // Branch a: confirmed anyway despite the warning → Absent, forfeited.
  function confirmAbsent() {
    if (!flow) return;
    const { event } = flow;
    updateEvent(event.id, (e) => ({
      ...e,
      status: "absent",
      subtitle: undefined,
      session: {
        ...(e.session as ExtSession),
        status: "absent",
        absent_cause: "student",
        report_comments: "We missed you in today's session! No worries — see you at the next one.",
      },
    }));
    setFlow(null);
    toast("Session marked as Absent.");
  }

  // Branch b: cancel outright → Cancelled, credit forfeited, no reschedule.
  function confirmCancelNoReschedule() {
    if (!flow) return;
    const { event } = flow;
    updateEvent(event.id, (e) => ({
      ...e,
      status: "cancelled",
      subtitle: undefined,
      session: {
        ...(e.session as ExtSession),
        status: "cancelled",
        cancellation_reason: "personal",
        cancellation_note: "Cancelled without rescheduling. Credit forfeited.",
      },
    }));
    setFlow(null);
    toast("Session cancelled. Credit forfeited.");
  }

  // Branch c: publish a reschedule request → Pending Reschedule. The
  // session's own date/time does NOT move yet — exactly like the real app,
  // where the new time only takes effect once Admin/teacher approves it
  // (a separate, admin-side step this student-facing demo doesn't need to
  // simulate).
  function publishReschedule(slotISO: string) {
    if (!flow) return;
    const { event } = flow;
    updateEvent(event.id, (e) => ({
      ...e,
      status: "pending_reschedule",
      subtitle: undefined,
      session: { ...(e.session as ExtSession), status: "pending_reschedule" },
    }));
    setFlow(null);
    toast.success(
      `Reschedule Request published for ${new Date(slotISO).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. Teachers have been notified.`,
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f6f8" }}>
      {/* Unmistakable demo banner — never let this be confused with a real
         *  student's screen, even in a shared screenshot. */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-amber-900">
        <Sparkles className="h-4 w-4 shrink-0" />
        <p className="text-xs font-medium">
          <span className="font-bold uppercase tracking-wide">Demo mode</span> — {bannerNote}
        </p>
        <button
          onClick={() => {
            window.close();
            // Browsers silently ignore close() on a tab they didn't open via
            // script — if that happens, send it somewhere safe instead of
            // leaving "Exit demo" looking like it did nothing.
            setTimeout(() => { window.location.href = "/login"; }, 300);
          }}
          className="ml-auto shrink-0 cursor-pointer rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
        >
          Exit demo
        </button>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
        </div>

        <Card className="mb-6 flex flex-wrap items-start gap-4 p-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}
          >
            {DEMO_STUDENT.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{DEMO_STUDENT.name}</h1>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Demo</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {DEMO_STUDENT.plan} plan · {DEMO_STUDENT.level} · Teacher: {DEMO_STUDENT.teacher}
            </p>
            <p className="mt-2 text-sm italic text-foreground/80">"{DEMO_STUDENT.headline}"</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DEMO_STUDENT.personalityTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">Sessions &amp; Events</h2>
          <CalendarView
            events={events}
            onEventClick={setSelected}
            availableKinds={STUDENT_KINDS}
          />
        </Card>
      </div>

      {selected && (
        <DemoSessionModal
          event={selected}
          onClose={() => setSelected(null)}
          onCantAttend={startCantAttend}
        />
      )}

      {flow?.step === "late" && (
        <LateCancellationModal onClose={() => setFlow(null)} onConfirm={confirmAbsent} />
      )}
      {flow?.step === "choice" && (
        <SessionCancellationModal
          onClose={() => setFlow(null)}
          onReschedule={() => setFlow({ step: "reschedule", event: flow.event })}
          onCancelNoReschedule={confirmCancelNoReschedule}
        />
      )}
      {flow?.step === "reschedule" && (
        <RescheduleRequestModal onClose={() => setFlow(null)} onPublish={publishReschedule} />
      )}
    </div>
  );
}
