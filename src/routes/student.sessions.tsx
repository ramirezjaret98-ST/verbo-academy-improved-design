// Student > Live Sessions.
//
// Reuses the same CalendarView + calendar-events adapter used by the Teacher
// Panel (see teacher.calendar.tsx). The student sees their own 1:1 sessions
// plus Insights / Book Clubs / Spotlights. Focus Workshops live on a separate
// route for workshop-only students.
//
// The 4-branch "Can't Attend" flow is driven by the student's Reschedule
// Policy (parseReschedulePolicy → notice hours + monthly cap %).
//   a) inside the notice window  → Late Cancellation Warning (Absent).
//   b) enough notice, quota used → Late Cancellation Warning with
//      "You've used all the reschedules allowed by your plan this cycle."
//   c) enough notice + quota OK  → Session Cancellation modal with two
//      actions: Reschedule (opens Reschedule Request flow) or
//      Cancel Without Rescheduling.
//   d) Groups: strict unanimity — a member's decision only affects THEIR
//      `member_statuses[studentId]` and always counts against their monthly
//      quota. The class keeps running for the remaining members. The session
//      only auto-cancels top-level when every roster member has cancelled or
//      requested a reschedule (handled inside `applyGroupMemberCancellation`).
//
// The Spotlight Session flow ("Request a Spotlight Session") is a separate
// modal chain: explainer (5s Understood delay) → slot picker + context text
// → publish as a Spotlight Request (or convert an overlapping regular session
// into "Converted to Spotlight" if the picked slot already has one).

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { USERS, userById } from "@/lib/mock-data";
import { adjustRemainingSessions } from "@/lib/students-store";
import {
  loadSessions, subscribeSessions, updateSession,
  SUB_STATUS_META, lastCoveredSummaryFor,
  type ExtSession, type ExtSessionStatus,
} from "@/lib/sessions-store";
import { CalendarView } from "@/components/verbo/CalendarView";
import {
  studentCalendarEvents, CALENDAR_STATUS_META, EVENT_KIND_META, calendarEventTheme,
  type CalendarEvent, type CalendarEventKind,
} from "@/lib/calendar-events";
import { Card, PrimaryButton, GhostButton, AccentModalHeader, InfoStatRow, AnimatedNumber } from "@/components/verbo/ui";

import { X, Video, AlertTriangle, Sparkles, CalendarClock, Clock, RefreshCcw, ArrowLeft, ChevronRight, Users as UsersIcon, BookOpen, Star } from "lucide-react";
import spotlightArt from "@/assets/spotlight1.png.asset.json";
import nextUpArt from "@/assets/Verbot_up_next.svg.asset.json";
import { getLessonPlan } from "@/lib/lesson-plans-store";
import { NextEventCard } from "@/components/verbo/NextEventCard";
import { resolvePlanTopic } from "@/lib/product-courses-store";
import { unitsForStudent } from "@/lib/vip-courses-store";
import { tailoredUnitsForStudent } from "@/lib/tailored-content-store";
import {
  addStudentRequest,
  convertSessionToSpotlight,
  parseReschedulePolicy,
  reschedulesUsedThisMonth,
  rescheduleQuota,
  spotlightRequestsThisMonth,
} from "@/lib/student-requests-store";

import {
  CantAttendRouter, RescheduleRequestModal, SlotPickerGrid,
  todayYMD, hoursUntil,
} from "@/components/verbo/CancelSessionFlow";

import { ClubReservationModal } from "@/components/verbo/ClubReservationModal";
import type { Club } from "@/lib/clubs-store";
import { resolvedRemainingSeats, resolvedMonthlyCap } from "@/lib/club-bookings-store";
import { groupOfStudent, incrementGroupRemaining, effectiveSessionCounts, sessionProgressFor } from "@/lib/groups-store";
import { useCoreFreemiumGate } from "@/components/verbo/CoreFreemiumFlow";
import { isSilenced, hasCreditUsed as freemiumUsed, markCreditUsed as markFreemiumUsed } from "@/lib/core-freemium-store";
import { effectiveHourlyRate, appendTeacherAdjustment } from "@/lib/teacher-tiers";
import { ProfilePeekCard } from "@/components/verbo/ProfilePeekCard";
import { useAvatar } from "@/lib/avatar-store";



export const Route = createFileRoute("/student/sessions")({
  validateSearch: (search: Record<string, unknown>) => ({
    focus: search.focus === "clubs" ? ("clubs" as const) : undefined,
  }),
  component: Page,
});

const ALL_STUDENT_KINDS: CalendarEventKind[] = ["class", "insight", "book_club", "spotlight"];
const CLUB_KINDS: CalendarEventKind[] = ["insight", "book_club"];






function Page() {
  const { user } = useAuth();
  const { focus: focusParam } = Route.useSearch();

  const [, tick] = useState(0);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [cantAttendFor, setCantAttendFor] = useState<ExtSession | null>(null);
  const [cancelSpotlightFor, setCancelSpotlightFor] = useState<ExtSession | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<ExtSession | null>(null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [clubModal, setClubModal] = useState<Club | null>(null);
  // The clubs focus pulse is a 10s attention cue, not a permanent state.
  const [pulseActive, setPulseActive] = useState(focusParam === "clubs");

  useEffect(() => subscribeSessions(() => tick((n) => n + 1)), []);

  useEffect(() => {
    if (focusParam !== "clubs") return;
    setPulseActive(true);
    const t = setTimeout(() => setPulseActive(false), 10000);
    return () => clearTimeout(t);
  }, [focusParam]);

  const events = useMemo<CalendarEvent[]>(() => {
    if (!user) return [];
    return studentCalendarEvents(user.id, {
      teacherNameOf: (id) => userById(id)?.name,
    });
  }, [user]);

  // Arriving from "View Active Clubs": open the calendar straight on the month
  // of the nearest upcoming club instead of the current month.
  const nearestClubDate = useMemo(() => {
    if (focusParam !== "clubs") return undefined;
    const now = Date.now();
    const upcoming = events
      .filter((e) => CLUB_KINDS.includes(e.kind) && +new Date(e.date) >= now)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
    return upcoming[0] ? new Date(upcoming[0].date) : undefined;
  }, [events, focusParam]);


  if (!user) return null;

  const policy = parseReschedulePolicy(user);
  const quota = rescheduleQuota(user);
  const used = reschedulesUsedThisMonth(user.id);
  const isSignature = user.access_plan === "Signature";
  const isCore = user.access_plan === "Core";
  const spotlightCapNum = resolvedMonthlyCap(user.id, "spotlight");
  const spotlightUsedNum = spotlightRequestsThisMonth(user.id);
  const spotlightRemaining = resolvedRemainingSeats(user.id, "spotlight");
  const spotlightCapDisplay = isSignature ? "∞" : String(spotlightCapNum);
  const spotlightVisible = isSignature || spotlightCapNum > 0;

  // Dynamic kinds — for Advance/Elite/Signature, only include a consumable
  // kind when the student has effective access to it. Core keeps all three
  // visible while their freemium credit is live, and each type gets removed
  // once the student silences it (Modal 3). "class" is always included.
  const insightSilenced = isCore && isSilenced(user.id, "insight");
  const bookSilenced = isCore && isSilenced(user.id, "book");
  const spotSilenced = isCore && isSilenced(user.id, "spotlight");
  const studentKinds: CalendarEventKind[] = ["class"];
  const hasInsight = isCore ? !insightSilenced : (isSignature || resolvedRemainingSeats(user.id, "insight") > 0 || resolvedMonthlyCap(user.id, "insight") > 0);
  const hasBook = isCore ? !bookSilenced : (isSignature || resolvedRemainingSeats(user.id, "book") > 0 || resolvedMonthlyCap(user.id, "book") > 0);
  const hasSpot = isCore ? !spotSilenced : (isSignature || spotlightCapNum > 0);
  const canRequestSpotlight = isCore ? !spotSilenced : (isSignature || spotlightRemaining > 0);
  if (hasInsight) studentKinds.push("insight");
  if (hasBook) studentKinds.push("book_club");
  if (hasSpot) studentKinds.push("spotlight");

  const freemium = useCoreFreemiumGate(user);

  const handleEventClick = (ev: CalendarEvent) => {
    if (ev.club && (ev.kind === "insight" || ev.kind === "book_club")) {
      const club = ev.club;
      const kind = ev.kind === "book_club" ? "book" : "insight";
      freemium.tryOpen(kind, () => setClubModal(club));
      return;
    }
    setSelected(ev);
  };



  const onCantAttend = (session: ExtSession) => {
    setSelected(null);
    setCantAttendFor(session);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sessions &amp; Events</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Your next class, your next club, your next win. All in one place.
          </p>
        </div>
      </div>


      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        <NextEventCard events={events} onEventClick={handleEventClick} />
        {hasSpot && (
          <div
            className="relative h-full min-h-[200px] overflow-hidden rounded-3xl p-6 verbo-card-hover"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, #b2ece3 20%, #ffffff) 0%, color-mix(in oklab, #7cd7cb 26%, #ffffff) 100%)",
              boxShadow: "inset 0 0 0 1px color-mix(in oklab, #3ebbad 26%, transparent)",
            }}
          >
            <img
              src={spotlightArt.url}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 h-[110%] w-auto translate-y-[6%] select-none object-contain"
            />
            <div className="relative z-10 w-[58%]">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: "color-mix(in oklab, #3ebbad 22%, #ffffff)", color: "color-mix(in oklab, #3ebbad 55%, #01304a)" }}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold tracking-[-0.02em]" style={{ color: "#01304a" }}>
                  Spotlight Session
                </h3>
              </div>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "rgba(1, 48, 74, 0.7)" }}>
                An extra 60-minute 1:1 with an Elite Instructor, focused on one specific challenge.
              </p>
              <button
                type="button"
                onClick={() => { if (canRequestSpotlight) freemium.tryOpen("spotlight", () => setSpotlightOpen(true)); }}
                disabled={!canRequestSpotlight}
                title={!canRequestSpotlight ? "You've used all your Spotlight requests for this month." : undefined}
                className={`mt-4 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-3 py-2.5 text-xs font-semibold transition-transform duration-200 hover:scale-[1.02] hover:shadow-md ${canRequestSpotlight ? "cursor-pointer active:scale-[0.97]" : "cursor-not-allowed opacity-60"}`}
                style={{ color: "#01304a", boxShadow: "inset 0 0 0 1px color-mix(in oklab, #3ebbad 30%, transparent)" }}

              >
                <Sparkles className="h-3.5 w-3.5" /> Request a Spotlight
              </button>
            </div>
          </div>
        )}
        <SessionsRemainingCard studentId={user.id} />
      </div>

      <Card>
        <CalendarView
          events={events}
          onEventClick={handleEventClick}
          availableKinds={studentKinds}
          initialEnabledKinds={focusParam === "clubs" ? CLUB_KINDS : undefined}
          pulseKinds={pulseActive ? CLUB_KINDS : undefined}
          initialDate={nearestClubDate}

        />

      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatPill
          icon={<CalendarClock className="h-4 w-4" />}
          label="Reschedule Policy"
          value={`${policy.noticeHours}h notice · up to ${policy.maxPct}% of monthly sessions`}
          tone="violet"
        />
        <StatPill
          icon={<RefreshCcw className="h-4 w-4" />}
          label="Used this cycle"
          value={`${used} of ${quota} reschedules`}
          tone={quota > 0 && used / quota >= 0.8 ? "red" : quota > 0 && used / quota >= 0.5 ? "amber" : "green"}
          progressPct={quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0}
        />
        {spotlightVisible && (
          <StatPill
            icon={<Sparkles className="h-4 w-4" />}
            label="Spotlight"
            value={isSignature
              ? `${spotlightUsedNum} used this month`
              : `${spotlightUsedNum} of ${spotlightCapDisplay} used this month`}
            tone="dark"
          />
        )}
      </div>



      {selected && (
        <EventDetailsModal
          event={selected}
          onClose={() => setSelected(null)}
          onCantAttend={(s) => onCantAttend(s)}
          onCancelSpotlight={(s) => { setSelected(null); setCancelSpotlightFor(s); }}
        />
      )}

      {cantAttendFor && (
        <CantAttendRouter
          session={cantAttendFor}
          user={user}
          onClose={() => setCantAttendFor(null)}
          onReschedule={() => { const s = cantAttendFor; setCantAttendFor(null); setRescheduleFor(s); }}
        />
      )}

      {cancelSpotlightFor && (
        <CancelSpotlightModal
          session={cancelSpotlightFor}
          onClose={() => setCancelSpotlightFor(null)}
        />
      )}

      {rescheduleFor && (
        <RescheduleRequestModal
          session={rescheduleFor}
          onClose={() => setRescheduleFor(null)}
        />
      )}

      {spotlightOpen && (
        <SpotlightRequestFlow
          studentId={user.id}
          onClose={() => setSpotlightOpen(false)}
        />
      )}

      {clubModal && (
        <ClubReservationModal
          club={clubModal}
          studentId={user.id}
          onClose={() => setClubModal(null)}
        />
      )}

      {freemium.node}

    </div>

  );
}




type StatPillTone = "violet" | "red" | "amber" | "green" | "dark";

const STAT_PILL_TONES: Record<StatPillTone, {
  wrap: string; iconWrap: string; label: string; value: string; track: string; bar: string;
}> = {
  violet: {
    wrap: "border-[#cb6ce6] bg-[#cb6ce6]",
    iconWrap: "bg-white/15 text-white",
    label: "text-white/60", value: "text-white",
    track: "bg-white/20", bar: "bg-white",
  },
  red: {
    wrap: "border-[#dc2626] bg-[#dc2626]",
    iconWrap: "bg-white/15 text-white",
    label: "text-white/60", value: "text-white",
    track: "bg-white/20", bar: "bg-white",
  },
  amber: {
    wrap: "border-[#d97706] bg-[#d97706]",
    iconWrap: "bg-white/15 text-white",
    label: "text-white/60", value: "text-white",
    track: "bg-white/20", bar: "bg-white",
  },
  green: {
    wrap: "border-[#3ea008] bg-[#3ea008]",
    iconWrap: "bg-white/15 text-white",
    label: "text-white/60", value: "text-white",
    track: "bg-white/20", bar: "bg-white",
  },
  dark: {
    wrap: "border-[#01304a] bg-[#01304a]",
    iconWrap: "bg-white/15 text-white",
    label: "text-white/60", value: "text-white",
    track: "bg-white/20", bar: "bg-white",
  },
};

function StatPill({ icon, label, value, tone = "violet", progressPct }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: StatPillTone;
  progressPct?: number;
}) {
  const t = STAT_PILL_TONES[tone];
  return (
    <div className={`rounded-2xl border px-4 py-3 ${t.wrap}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.iconWrap}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${t.label}`}>{label}</div>
          <div className={`mt-0.5 text-xs font-semibold ${t.value}`}>{value}</div>
          {progressPct !== undefined && (
            <div className={`mt-2 h-1.5 w-full rounded-full ${t.track}`}>
              <div className={`h-1.5 rounded-full transition-all ${t.bar}`} style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



// ---------------------------------------------------------------------------
// Session details modal — student view.
// Performance Sessions branch on whether the teacher already saved a lesson
// plan (same data pattern as the Dashboard "Class Details" modal), never on
// the status string alone. "Connect" only activates 5 minutes before start.
// ---------------------------------------------------------------------------
/** True from 5 minutes before the start until the session's end time. */
function withinConnectWindow(iso: string, durationMinutes: number): boolean {
  const h = hoursUntil(iso);
  return h <= 5 / 60 && h > -(durationMinutes / 60);
}
const CONNECT_HINT = "Activates 5 minutes before your session.";

function ConnectButton({
  enabled, onClick, className,
}: { enabled: boolean; onClick: () => void; className?: string }) {
  if (enabled) {
    return (
      <PrimaryButton className={`verbo-btn-glow ${className ?? ""}`} accentColor="#5fca16" onClick={onClick}>
        <Video className="h-4 w-4" /> Connect
      </PrimaryButton>
    );
  }
  return (
    <button
      type="button"
      disabled
      title={CONNECT_HINT}
      className={`inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground ${className ?? ""}`}
    >
      <Video className="h-4 w-4" /> Connect
    </button>
  );
}

function EventDetailsModal({
  event, onClose, onCantAttend, onCancelSpotlight,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onCantAttend: (session: ExtSession) => void;
  onCancelSpotlight: (session: ExtSession) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isClass = event.kind === "class";
  const isSpotlight = event.kind === "spotlight";
  const session = event.session;
  const teacherName = session ? userById(session.teacher_id)?.name : undefined;
  const status = event.status as ExtSessionStatus | undefined;
  const statusMeta = status ? CALENDAR_STATUS_META[status] : null;
  const kindMeta = EVENT_KIND_META[event.kind];
  const isAbsent = status === "absent" || status === "no_show";
  const isCompleted = status === "completed";
  const canAct =
    isClass && session &&
    (status === "scheduled" || status === "ready" || status === "rescheduled");
  const canConnectSpotlight =
    isSpotlight && session &&
    (status === "scheduled" || status === "ready" || status === "rescheduled");
  const connectOpen = session ? withinConnectWindow(session.date_time, session.duration_minutes) : false;
  const connect = () => {
    if (session?.teams_link) window.open(session.teams_link, "_blank");
  };

  const plan = session ? getLessonPlan(session.id) : undefined;
  let topic: { levelName: string; unitTitle: string } | null = null;
  if (plan && user) {
    if (plan.vip_unit_id) {
      const u = unitsForStudent(user.id).find((x) => x.id === plan.vip_unit_id);
      if (u) topic = { levelName: "VIP Course", unitTitle: u.title };
    } else if (plan.tailored_unit_id) {
      const u = tailoredUnitsForStudent(user.id).find((x) => x.id === plan.tailored_unit_id);
      if (u) topic = { levelName: "Tailored Content", unitTitle: u.title };
    } else {
      topic = resolvePlanTopic(user.product, plan.level_id, plan.unit_id);
    }
  }
  const prepare = () => {
    if (!plan) return;
    onClose();
    if (plan.vip_unit_id) {
      navigate({ to: "/student/my-course" });
    } else if (plan.tailored_unit_id) {
      navigate({ to: "/student/courses", search: {} });
    } else {
      navigate({ to: "/student/courses", search: { levelId: plan.level_id, unitId: plan.unit_id } });
    }
  };

  const planBlock = plan ? (
    <section className="vc-rise mt-4" style={{ animationDelay: "0.35s" }}>

      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {isCompleted ? "What we covered" : "What we'll cover"}
      </h4>
      <div className="mt-2 space-y-1 rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5 text-sm text-foreground">
        <div><span className="text-muted-foreground">Type:</span> {plan.type}</div>
        <div><span className="text-muted-foreground">Title:</span> {plan.title}</div>
        {topic && (
          <div className="text-muted-foreground">{topic.levelName} — {topic.unitTitle}</div>
        )}
      </div>
    </section>
  ) : null;

  const notesBlock = (
    <section className="vc-rise mt-4" style={{ animationDelay: "0.4s" }}>

      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Teacher's notes</h4>
      <p className="mt-2 text-sm text-muted-foreground">
        {session?.report_comments || "No notes were left for this session."}
      </p>
    </section>
  );

  const theme = calendarEventTheme(event);
  const HeadIcon = isSpotlight ? Sparkles : event.kind === "workshop" ? UsersIcon : Video;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
        <AccentModalHeader
          background={theme.background}
          iconTint={theme.solid}
          icon={HeadIcon}
          eyebrow={kindMeta.label}
          title={isSpotlight && teacherName ? `Spotlight with ${teacherName}` : isClass && teacherName ? `Session with ${teacherName}` : event.title}
          watermark={{ type: "icon", icon: HeadIcon }}
          textTone={theme.textTone}
          onClose={onClose}
        />
        <div className="px-6 py-5">
        {(() => {
          const statusAccent = session?.attendance_sub_status
            ? SUB_STATUS_META[session.attendance_sub_status].color
            : statusMeta?.color;
          const statusText = session?.attendance_sub_status
            ? `${statusMeta?.label ?? ""} · ${SUB_STATUS_META[session.attendance_sub_status].label}`.trim().replace(/^·\s*/, "")
            : (statusMeta?.label ?? "—");
          return (
            <div className="vc-rise" style={{ animationDelay: "0.25s" }}>
              <InfoStatRow
                items={[
                  {
                    icon: CalendarClock,
                    value: new Date(event.date).toLocaleDateString([], { month: "short", day: "numeric" }),
                    label: "Date",
                    tint: theme.solid,
                  },
                  {
                    icon: Clock,
                    value: new Date(event.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
                    label: "Time",
                    tint: theme.solid,
                  },
                  {
                    icon: HeadIcon,
                    value: statusText,
                    label: "Status",
                    tint: statusAccent ?? theme.solid,
                  },
                ]}
              />
            </div>
          );
        })()}

        {(isClass || isSpotlight) && session && (
          <div className="vc-rise mt-4 space-y-2 text-sm" style={{ animationDelay: "0.3s" }}>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Teacher</span>
              <span className="flex items-center gap-2">
                <TeacherPeekAvatar userId={session.teacher_id} name={teacherName} />
                <span className="font-medium text-foreground">{teacherName ?? "—"}</span>
              </span>
            </div>
          </div>
        )}


        {isClass && session && isAbsent && (
          <>
            {session.absent_cause && (
              <div className="mt-4 rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5 text-sm text-muted-foreground">
                {session.absent_cause === "student"
                  ? "You marked yourself unavailable."
                  : session.absent_cause === "teacher"
                  ? "Your teacher canceled this session."
                  : "This session was not attended."}
              </div>
            )}
            {notesBlock}
          </>
        )}

        {isClass && session && isCompleted && (
          <>
            {planBlock}
            {notesBlock}
            <section className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your rating</h4>
              {session.student_rating ? (
                <div className="mt-2 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`h-4 w-4 ${n <= session.student_rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">You haven't rated this session yet.</p>
              )}
            </section>
          </>
        )}

        {canAct && (
          plan ? planBlock : (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                This Performance Session hasn't been planned yet. Check back closer to the date.
              </p>
            </div>
          )
        )}

        <div className="mt-6 flex flex-col gap-2">
          {canAct ? (
            plan ? (
              <>
                <GhostButton className="w-full justify-center" onClick={prepare}>
                  <BookOpen className="h-3.5 w-3.5" /> Prepare Session
                </GhostButton>
                <div className="flex items-center gap-2">
                  <ConnectButton className="flex-1" enabled={connectOpen} onClick={connect} />
                  <button
                    type="button"
                    onClick={() => session && onCantAttend(session)}
                    className="inline-flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-opacity hover:opacity-90 active:scale-[0.97]"
                  >
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              </>
            ) : (
              <GhostButton className="w-full justify-center" onClick={onClose}>Close</GhostButton>
            )
          ) : canConnectSpotlight ? (
            <div className="flex gap-2">
              <ConnectButton className="flex-1" enabled={connectOpen} onClick={connect} />
              {status === "scheduled" && (
                <GhostButton className="flex-1" onClick={() => session && onCancelSpotlight(session)}>
                  Cancel Spotlight
                </GhostButton>
              )}
            </div>
          ) : (
            <GhostButton className="w-full" onClick={onClose}>Close</GhostButton>
          )}
        </div>
        </div>
      </div>

    </div>
  );
}
/** Small teacher avatar that opens a read-only profile peek card. */
function TeacherPeekAvatar({ userId, name }: { userId?: string; name?: string }) {
  const avatar = useAvatar(userId);
  const inner = avatar ? (
    <img src={avatar} alt={name ?? "Teacher"} className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#01304a] text-xs font-semibold text-white"
      aria-hidden
    >
      {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
  if (!userId) return inner;
  return (
    <ProfilePeekCard userId={userId} displayName={name}>
      {inner}
    </ProfilePeekCard>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {

  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground" style={accent ? { color: accent } : undefined}>{value}</span>
    </div>
  );
}



// ---------------------------------------------------------------------------
// Spotlight Request flow — explainer (5s Understood delay) → slot + context.
// Special case: if the picked slot exactly matches an existing regular 1:1
// with the student's own teacher, we convert instead of claiming.
// ---------------------------------------------------------------------------
function SpotlightRequestFlow({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [step, setStep] = useState<"explain" | "form">("explain");
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    if (step !== "explain") return;
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [step, secondsLeft]);

  if (step === "explain") {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4">
        <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
          <AccentModalHeader
            background="#0d9488"
            iconTint="#0d9488"
            icon={Sparkles}
            eyebrow="SPOTLIGHT SESSION"
            title="What is a Spotlight Session?"
            watermark={{ type: "icon", icon: Sparkles }}
            onClose={onClose}
          />
          <div className="px-6 py-5">
            <p className="vc-rise text-sm font-medium text-foreground" style={{ animationDelay: "0.25s" }}>Stuck on something specific?</p>
            <p className="vc-rise mt-2 text-sm leading-relaxed text-muted-foreground" style={{ animationDelay: "0.3s" }}>
              A Spotlight Session is a focused 60-minute 1:1 with an Elite Instructor — built around exactly what you need: a presentation, an interview, a tricky email, anything on your plate. Tell us what it is, and they'll show up ready for it.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                disabled={secondsLeft > 0}
                onClick={() => setStep("form")}
                className="cursor-pointer rounded-lg bg-[#0d9488] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                {secondsLeft > 0 ? `Understood (${secondsLeft})` : "Understood"}
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  }
  return <SpotlightFormModal studentId={studentId} onClose={onClose} />;
}

function SpotlightFormModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [dateYMD, setDateYMD] = useState<string>(todayYMD());
  const [slotISO, setSlotISO] = useState<string>("");
  const [context, setContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOverlap, setConfirmOverlap] = useState<{ session: ExtSession; iso: string } | null>(null);

  // Spotlight duration is ALWAYS 60 minutes, regardless of the student's
  // regular session_duration.
  const SPOTLIGHT_DURATION = 60;
  const studentUser = userById(studentId);
  const product = studentUser?.product;
  const qualifiedIds = useMemo(
    () => USERS.filter((u) => u.role === "teacher" && u.teacher_status === "active"
      && (!product || (u.qualified_products ?? []).includes(product)))
      .map((t) => t.id),
    [product],
  );

  const submit = () => {
    if (resolvedRemainingSeats(studentId, "spotlight") <= 0) {
      setError("You've used all your Spotlight requests for this month.");
      return;
    }
    if (!slotISO) { setError("Pick one of the available start times."); return; }
    if (context.trim().length === 0) { setError("Please describe what you need for your Spotlight."); return; }
    // Overlap check with an existing regular 1:1 for this student at the
    // exact same start.
    const overlap = loadSessions().find((s) =>
      s.student_id === studentId &&
      !s.origin && // regular 1:1
      s.status !== "completed" && s.status !== "absent" && s.status !== "cancelled" &&
      +new Date(s.date_time) === +new Date(slotISO),
    );
    if (overlap) {
      setConfirmOverlap({ session: overlap, iso: slotISO });
      return;
    }
    publishSpotlightRequest(slotISO, context);
  };

  const publishSpotlightRequest = (iso: string, ctx: string) => {
    addStudentRequest({
      kind: "spotlight",
      student_id: studentId,
      assigned_teacher_id: undefined,
      proposed_datetime: iso,
      duration_minutes: SPOTLIGHT_DURATION,
      spotlight_context: ctx.trim(),
      last_report_summary: lastCoveredSummaryFor(loadSessions(), studentId),
    });
    // Core freemium: consume the one-shot courtesy credit on real submit.
    if (studentUser?.access_plan === "Core" && !freemiumUsed(studentId, "spotlight")) {
      markFreemiumUsed(studentId, "spotlight");
    }
    toast.success("Spotlight Request published. Teachers have been notified.");
    onClose();
  };



  if (confirmOverlap) {
    const teacherName = userById(confirmOverlap.session.teacher_id)?.name ?? "your teacher";
    const overlapIso = confirmOverlap.iso;
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center verbo-backdrop p-4">
        <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
          <h3 className="text-base font-semibold text-foreground">Overlaps with an existing session</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This overlaps with your already-scheduled session with <strong>{teacherName}</strong> at that time — would you like to replace it with this Spotlight instead?
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The original session will change to <strong>Converted to Spotlight</strong>. It won't count as a cancellation or a strike, and the credit is returned to your Hired / Remaining Sessions.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <GhostButton onClick={() => setConfirmOverlap(null)}>Return</GhostButton>
            <PrimaryButton onClick={() => {
              convertSessionToSpotlight({
                originalSessionId: confirmOverlap.session.id,
                spotlightContext: context.trim(),
              });
              // Refund the credit (as if never scheduled). Group students
              // share a single counter on the Group, individual students have
              // it on their own User record.
              const g = groupOfStudent(studentId);
              if (g) {
                incrementGroupRemaining(g.group.id);
              } else {
                adjustRemainingSessions(studentId, 1);
              }
              // Core freemium: consume the one-shot courtesy credit.
              if (studentUser?.access_plan === "Core" && !freemiumUsed(studentId, "spotlight")) {
                markFreemiumUsed(studentId, "spotlight");
              }
              toast.success("Session replaced with a Spotlight in the same slot.");
              onClose();
              void overlapIso;
            }}>

              Replace with Spotlight
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
        <AccentModalHeader
          background="#0d9488"
          iconTint="#0d9488"
          icon={Sparkles}
          eyebrow="SPOTLIGHT SESSION"
          title="Request a Spotlight Session"
          watermark={{ type: "icon", icon: Sparkles }}
          onClose={onClose}
        />
        <div className="px-6 py-5">
        <p className="vc-rise text-xs text-muted-foreground" style={{ animationDelay: "0.25s" }}>
          Pick one of the available start times. Spotlight sessions are always <strong>60 min</strong>, and require at least 24h notice.
        </p>

        <div className="mt-4 rounded-2xl border border-[var(--navy-100)] bg-[var(--navy-50)] p-4">
          <div>
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
            <SlotPickerGrid
              dateYMD={dateYMD}
              durationMin={SPOTLIGHT_DURATION}
              qualifiedTeacherIds={qualifiedIds}
              selectedISO={slotISO}
              onSelect={(iso) => { setSlotISO(iso); setError(null); }}
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs font-medium text-foreground">What do you need this Spotlight for? <span className="text-destructive">*</span></label>
          <textarea
            value={context}
            onChange={(e) => { setContext(e.target.value); setError(null); }}
            rows={4}
            placeholder="e.g. Prepare for a Q&A with our US investors next week — focus on hedging language and confident pushback."
            className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring"
          />
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose}><ArrowLeft className="h-3.5 w-3.5" /> Return</GhostButton>
          <PrimaryButton onClick={submit} style={{ backgroundColor: "#0d9488", color: "#fff" }}>Publish Request</PrimaryButton>
        </div>
        </div>
      </div>

    </div>
  );
}


// ---------------------------------------------------------------------------
// Sessions Remaining — shared source of truth for the balance. Reads from
// `effectiveSessionCounts` so group members see the group's shared counter
// automatically, and hides itself for non-performance products.
// ---------------------------------------------------------------------------
/** Circular ring showing the share of sessions still remaining (it empties as
 *  sessions get used). Purely presentational. */
function RemainingRing({ remaining, hired }: { remaining: number; hired: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const ratio = hired > 0 ? Math.max(0, Math.min(1, remaining / hired)) : 0;
  // Start empty on mount so the fill transition also plays on first render.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(ratio));
    return () => cancelAnimationFrame(raf);
  }, [ratio]);
  return (
    <svg viewBox="0 0 72 72" className="h-[72px] w-[72px] shrink-0 -rotate-90">
      <defs>
        <linearGradient id="sessionsRingFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f38934" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(1,48,74,0.10)" strokeWidth="7" />
      <circle
        cx="36" cy="36" r={r} fill="none" stroke="url(#sessionsRingFill)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - shown)}
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.23, 1, 0.32, 1)" }}
      />
    </svg>
  );
}


function SessionsRemainingCard({ studentId }: { studentId: string }) {
  const u = USERS.find((x) => x.id === studentId);
  if (!u) return null;
  if ((u.product_type ?? "performance") !== "performance") return null;
  const { hired, remaining } = effectiveSessionCounts(studentId, {
    hired: u.hired_sessions,
    remaining: u.remaining_sessions,
  });
  const { done } = sessionProgressFor(hired, remaining);
  const g = groupOfStudent(studentId);
  return (
    <div
      className="verbo-sessions-remaining group relative flex h-full min-h-[200px] flex-col justify-between overflow-hidden rounded-3xl border border-[rgba(243,137,52,0.18)] bg-[#FFFBEB] p-6 shadow-elevated transition-all duration-300 ease-out hover:shadow-floating"
      style={{
        background:
          "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 45%, #FDE68A 100%)",
        boxShadow:
          "inset 0 1px 0 0 rgba(255,255,255,0.7), 0 4px 16px -2px rgba(1,48,74,0.06), 0 2px 6px -1px rgba(1,48,74,0.04)",
      }}
    >
      {/* Decorative warm bloom */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-60"
        style={{ background: "radial-gradient(circle, rgba(243,137,52,0.35) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(245,158,11,0.30) 0%, transparent 70%)" }}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f38934] shadow-[0_0_8px_rgba(243,137,52,0.6)]" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#01304a]/70">Sessions remaining</div>
        </div>
        <div className="text-right text-[11px] font-medium text-[#01304a]/55">{done} used</div>
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-7xl font-extrabold leading-[1.05] tracking-[-0.03em] text-[#01304a]">
            <AnimatedNumber value={remaining} />
          </div>
          <div className="mt-2 text-[13px] font-medium text-[#01304a]/60">of {hired} sessions</div>
          {g && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#01304a]/10 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-[#01304a]/70 backdrop-blur-sm">
              <UsersIcon className="h-3 w-3" />
              Shared with your group
            </div>
          )}
        </div>
        <RemainingRing remaining={remaining} hired={hired} />
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Cancel Spotlight — student-side cancellation with 24h-notice pay rule.
// The Spotlight credit is always forfeited (no reschedule, no refund).
// If cancelled inside 24h, the teacher is paid 1 hour at their effective rate.
// ---------------------------------------------------------------------------
function CancelSpotlightModal({ session, onClose }: { session: ExtSession; onClose: () => void }) {
  const teacherName = userById(session.teacher_id)?.name ?? "your teacher";
  const confirm = () => {
    const hours = hoursUntil(session.date_time);
    const late = hours < 24;
    const note = late
      ? "Cancelled by student with less than 24h notice — teacher paid."
      : "Cancelled by student with 24h+ notice — no payment.";
    updateSession(session.id, { status: "cancelled", cancellation_note: note });
    if (late) {
      const teacher = USERS.find((u) => u.id === session.teacher_id);
      if (teacher) {
        appendTeacherAdjustment(
          teacher.id,
          Math.round(effectiveHourlyRate(teacher)),
          "Spotlight Session — late cancellation (paid, <24h notice)",
        );
      }
    }
    toast.success("Spotlight Session cancelled.");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--navy-100)] text-[#01304a]">
            <CalendarClock className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: "#01304a" }}>Cancel Spotlight Session?</h3>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This Spotlight with <strong>{teacherName}</strong> will be cancelled. It cannot be rescheduled or made up.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
          >
            Confirm Cancellation
          </button>
          <GhostButton className="w-full justify-center" onClick={onClose}>
            <ArrowLeft className="h-3.5 w-3.5" /> Return
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

