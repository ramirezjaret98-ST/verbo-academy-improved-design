// Onboarding demo — 2026-08-26.
//
// Jaret's ask: a fake student "profile" he can pull up live on a call with a
// brand-new student to walk them through how the calendar/sessions flow
// works — real look, real colors, real logic — WITHOUT touching any real
// account or the database. A deliberate mirror of how this app worked
// before Supabase was connected (pure mock data), scoped to just this page.
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
//     reinicie").
//   - No entry point anywhere in the real nav — reached only via the
//     "Onboarding Demo" button on the Admin dashboard (opens in a new tab).
//   - Reuses the REAL `CalendarView` (already documented as presentation-only
//     — reads no store) and the real status color system
//     (`calendar-events.ts` / `status-palette.ts`) so what Jaret shows a
//     student is pixel-identical to production, but every action inside the
//     detail modal is inert — it explains what would happen instead of
//     calling any store/RPC.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Sparkles, CalendarClock, Video, RefreshCcw, CircleSlash, Info,
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
import type { ExtSessionStatus } from "@/lib/sessions-store";
import { Logo } from "@/components/verbo/Logo";

export const Route = createFileRoute("/demo-onboarding")({
  head: () => ({
    meta: [{ title: "Onboarding Demo | Verbo Academy" }],
  }),
  component: DemoOnboardingPage,
});

const DEMO_STUDENT = {
  name: "Demo Student",
  initials: "DS",
  plan: "Elite",
  level: "B1 — Intermediate",
  teacher: "Coach Jamie",
};

const STUDENT_KINDS: CalendarEventKind[] = ["class", "spotlight", "insight", "book_club"];

function atTime(daysFromToday: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** One session per canonical status, spread across ~2 weeks, so every color
 *  in the legend actually appears at least once — that's the whole point,
 *  Jaret explicitly asked for "one of each color" to explain the calendar
 *  logic in an onboarding call, not a full realistic schedule. */
function buildDemoEvents(): CalendarEvent[] {
  const classes: { status: ExtSessionStatus; days: number; hour: number }[] = [
    { status: "completed", days: -6, hour: 10 },
    { status: "absent", days: -4, hour: 16 },
    { status: "no_show", days: -3, hour: 9 },
    { status: "delayed", days: -1, hour: 11 },
    { status: "cancelled", days: -2, hour: 15 },
    { status: "scheduled", days: 1, hour: 10 },
    { status: "ready", days: 2, hour: 16 },
    { status: "pending_reschedule", days: 4, hour: 9 },
    { status: "rescheduled", days: 6, hour: 14 },
  ];
  const events: CalendarEvent[] = classes.map((c, i) => ({
    id: `demo-class-${i}`,
    kind: "class",
    date: atTime(c.days, c.hour),
    duration_minutes: 60,
    title: "1:1 Performance Session",
    status: c.status,
    origin: "course",
  }));

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
  scheduled: "From here a real student can join the class, or request to reschedule/cancel if something comes up.",
  ready: "The lesson plan is already saved — the student sees exactly what unit/topic is coming up before class starts.",
  completed: "After class, the report, rating and any homework notes from the teacher show up here.",
  absent: "Marked automatically if the class happened without the student (or the teacher, per the cause shown).",
  cancelled: "This slot won't happen — cancelled ahead of time, no makeup owed unless Jaret says otherwise.",
  pending_reschedule: "The student asked to move this — it's waiting on Admin/teacher approval.",
  no_show: "Nobody joined and nothing was reported — this is the one Admin usually follows up on.",
  rescheduled: "This was moved to a new date/time — the original slot is freed up.",
  delayed: "The class happened but started late — still counts as attended.",
};

function DemoSessionModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const theme = calendarEventTheme(event);
  const status = event.status as ExtSessionStatus | undefined;
  const statusLabel = status ? CALENDAR_STATUS_META[status]?.label : undefined;
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

          {status && ACTION_COPY[status] && (
            <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{ACTION_COPY[status]}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <PrimaryButton onClick={() => demoAction("Join class")} className="!px-3.5 !py-2 text-xs">
              <Video className="mr-1.5 h-3.5 w-3.5" /> Join class
            </PrimaryButton>
            <GhostButton onClick={() => demoAction("Reschedule")} className="!px-3.5 !py-2 text-xs">
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Reschedule
            </GhostButton>
            <GhostButton onClick={() => demoAction("Can't Attend")} className="!px-3.5 !py-2 text-xs">
              <CircleSlash className="mr-1.5 h-3.5 w-3.5" /> Can&apos;t Attend
            </GhostButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoOnboardingPage() {
  // Built once per page load — nothing here is read from or written to any
  // store, localStorage included, so there is nothing to reset: closing the
  // tab (or just refreshing) already starts completely fresh next time.
  const [events] = useState<CalendarEvent[]>(() => buildDemoEvents());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const bannerNote = useMemo(
    () => "This page uses made-up sessions only, for walking a new student through how the calendar works. Nothing here reads or writes real data — refreshing or closing this tab resets it.",
    [],
  );

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

        <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}
          >
            {DEMO_STUDENT.initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{DEMO_STUDENT.name}</h1>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Demo</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {DEMO_STUDENT.plan} plan · {DEMO_STUDENT.level} · Teacher: {DEMO_STUDENT.teacher}
            </p>
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

      {selected && <DemoSessionModal event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
