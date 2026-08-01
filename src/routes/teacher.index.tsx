import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ASSIGNMENTS, USERS, studentsOfTeacher, userById, type Session, type SessionStatus } from "@/lib/mock-data";
import { Gauge } from "lucide-react";
import { AccentModal, AccentModalHeader, AccentModalFooter, AnimatedNumber, Card, GhostButton, HeroStatCard, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import { SkeletonStatCards, useHydrated } from "@/components/verbo/skeletons";

import { rankLabel } from "@/lib/staff-profile-store";
import alertIconAsset from "@/assets/Alert.svg.asset.json";
import planIconAsset from "@/assets/plan.svg.asset.json";
import completeIconAsset from "@/assets/complete.svg.asset.json";

import { CalendarClock, ClipboardCheck, FileEdit, X, Lock, Plus, Trash2, Download, CheckCircle2, Mic, PenLine, Ear, BookOpen, ChevronRight, Video, Star, AlertTriangle, AlertCircle, Trophy, CalendarDays, Users, Wallet, Sparkles as SparklesIcon, GraduationCap, type LucideIcon } from "lucide-react";
import { savePerformance, type PerformanceRating } from "@/lib/performance-store";
import { MACRO_SKILLS as SHARED_MACRO_SKILLS, skillKey as sharedSkillKey, type BaseKey as SharedBaseKey } from "@/lib/skills-taxonomy";
import { submitSessionReport, updateSession, loadSessions, subscribeSessions, SUB_STATUS_META, isJustificationWindowOpen, type ExtSession, type AttendanceSubStatus } from "@/lib/sessions-store";
import { PlanModal } from "@/components/verbo/PlanModal";

import { subscribeCourses, computeCurrentProgress } from "@/lib/product-courses-store";
import { loadLessonPlans, saveLessonPlan, subscribeLessonPlans, getLessonPlan, type LessonPlan } from "@/lib/lesson-plans-store";
import { markVipUnitDone, clearVipUnitDoneForSession } from "@/lib/vip-courses-store";
import { markTailoredUnitDone, clearTailoredUnitDoneForSession } from "@/lib/tailored-content-store";
import { computeTeacherKpis, getBonusThreshold } from "@/lib/teacher-kpis";
import { avgRating } from "@/lib/teacher-model";
import { activeStrikeCount } from "@/lib/strikes-store";
import { listChangeRequests, isTeacherAvailableAt, subscribeAvailability } from "@/lib/availability-store";
import { loadClubs, subscribeClubs, type Club } from "@/lib/clubs-store";
import { groupById } from "@/lib/groups-store";
import { SessionDetailsModal } from "@/components/verbo/SessionDetailsModal";
import { teacherCalendarEvents, EVENT_KIND_META, type CalendarEvent } from "@/lib/calendar-events";
import { loadWorkshops } from "@/lib/workshops-store";
import { loadClubReports, subscribeClubReports, type ClubReport } from "@/lib/club-reports-store";
import { ClubReportModal, type ClubReportEventInput } from "@/components/verbo/ClubReportModal";
import { RatingTrendModal } from "@/components/verbo/RatingTrendModal";
import { getCoverageNoteForStudent } from "@/lib/coverage-notes-store";
import studentsIconAsset from "@/assets/students_assigned.svg.asset.json";
import upcomingIconAsset from "@/assets/Upcoming_sessions.svg.asset.json";
import starIconAsset from "@/assets/Star.svg.asset.json";
import performanceIconAsset from "@/assets/performance.svg.asset.json";
import availabilityIconAsset from "@/assets/availability.svg.asset.json";
import clubsIconAsset from "@/assets/clubs.svg.asset.json";
import balanceIconAsset from "@/assets/balance.svg.asset.json";

export const Route = createFileRoute("/teacher/")({
  // Optional deep-link from the Calendar page → auto-open the Session Report
  // for a given session id. `report` maps to a session in `sessions`.
  validateSearch: (search: Record<string, unknown>) => ({
    report: typeof search.report === "string" ? (search.report as string) : undefined,
  }),
  component: TeacherDashboard,
});

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const REPORT_WINDOW_MS = 24 * 3_600_000;

// Accent colors for the three compressed dashboard panels (mirror the
// card-gradient-* utilities used by their cards).
const CRIMSON = "#b52904";
const CRIMSON_BG = "linear-gradient(150deg, #c2410c 0%, #b52904 55%, #760137 100%)";
const VIOLET = "var(--violet-500)";
const VIOLET_BG = "linear-gradient(150deg, var(--violet-300) 0%, var(--violet-500) 55%, var(--violet-900) 100%)";
const GREEN = "#5fca16";
const GREEN_BG = "linear-gradient(150deg, #7ee02d 0%, #5fca16 55%, #3ea008 100%)";
const ORANGE = "#ea580c";
const YELLOW = "#eab308";

type DashboardPanel = "attention" | "plan" | "complete";


type LocalSession = ExtSession & { _noReport?: boolean };

function TeacherDashboard() {
  const hydrated = useHydrated();
  const { user } = useAuth();

  const { report: reportId } = useSearch({ from: "/teacher/" });
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  // Sessions come straight from the persisted store (never from a stale local
  // copy of the seed) so completed/rescheduled sessions stay that way on reload.
  const [sessions, setSessions] = useState<LocalSession[]>(() =>
    typeof window === "undefined" ? [] : loadSessions().map((s) => ({ ...s })),
  );
  const [evaluating, setEvaluating] = useState<ExtSession | null>(null);
  const [editing, setEditing] = useState<{ session: ExtSession; perf: PerformanceRating; subskills: Record<string, number> } | null>(null);
  const [planning, setPlanning] = useState<ExtSession | null>(null);
  
  const [plans, setPlans] = useState<Record<string, LessonPlan>>({});
  // Live-synced canonical sessions (used by summary cards, Needs Your
  // Attention, and Recent Activity). Everything else in the dashboard
  // still reads the legacy `sessions` mirror so the report/plan flows
  // keep their local mutation model.
  const [liveSessions, setLiveSessions] = useState<ExtSession[]>(() =>
    typeof window === "undefined" ? [] : loadSessions()
  );
  const [clubs, setClubs] = useState<Club[]>([]);
  const [availTick, setAvailTick] = useState(0);
  const [viewing, setViewing] = useState<ExtSession | null>(null);
  const [clubReports, setClubReports] = useState<Record<string, ClubReport>>({});
  const [reportingClub, setReportingClub] = useState<ClubReportEventInput | null>(null);
  const [showRatingTrend, setShowRatingTrend] = useState(false);
  const [openPanel, setOpenPanel] = useState<DashboardPanel | null>(null);


  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  // Hydrate lesson plans + live data on the client only (avoids SSR mismatch)
  useEffect(() => {
    setPlans(loadLessonPlans());
    const u2 = subscribeLessonPlans(() => setPlans(loadLessonPlans()));
    setSessions(loadSessions().map((s) => ({ ...s })));
    setLiveSessions(loadSessions());
    setClubs(loadClubs());
    const u3 = subscribeSessions(() => {
      setLiveSessions(loadSessions());
      setSessions(loadSessions().map((s) => ({ ...s })));
    });
    const u4 = subscribeClubs(() => setClubs(loadClubs()));
    const u5 = subscribeAvailability(() => setAvailTick((n) => n + 1));
    setClubReports(loadClubReports());
    const u6 = subscribeClubReports(() => setClubReports(loadClubReports()));
    const u7 = subscribeCourses(() => setAvailTick((n) => n + 1));
    return () => { u2(); u3(); u4(); u5(); u6(); u7(); };
  }, []);

  // If we arrived with ?report=<id>, auto-open Step 1 for that session
  // (or Step 2 if we've already been through Step 1). We clear the search
  // so refresh doesn't re-open the modal after cancel.
  useEffect(() => {
    if (!reportId) return;
    const s =
      sessions.find((x) => x.id === reportId) ??
      (liveSessions.find((x) => x.id === reportId) as unknown as Session | undefined);
    if (s && !evaluating && !editing) { setOpenPanel(null); setEvaluating(s); }
    navigate({ to: "/teacher", search: {} as never, replace: true });
  }, [reportId, sessions, liveSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-lock overdue sessions: flip to completed-without-report
  useEffect(() => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.status !== "scheduled") return s;
        const end = +new Date(s.date_time) + s.duration_minutes * 60_000;
        if (now > end + REPORT_WINDOW_MS) {
          return { ...s, status: "completed", _noReport: true };
        }
        return s;
      }),
    );
  }, [now]);

  if (!user) return null;
  const students = studentsOfTeacher(user.id);
  const mySessions = sessions.filter((s) => s.teacher_id === user.id);
  const upcoming = mySessions.filter((s) => s.status === "scheduled").sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));
  const recent = mySessions.filter((s) => s.status !== "scheduled").slice(0, 5);
  // Real count of unplanned sessions (no cap) vs. the 3 items shown in the modal.
  const toPlanAll = upcoming.filter((s) => !plans[s.id]);
  const toPlan = toPlanAll.slice(0, 3);
  // Only sessions whose start time has already passed can be reported/completed.
  const awaitingCompletion = upcoming.filter((s) => now >= +new Date(s.date_time));

  // ---- Real-data derivations (cards, Needs Attention, Recent Activity) ----
  const teacherUser = USERS.find((u) => u.id === user.id && u.role === "teacher") ?? null;
  const myLive = liveSessions.filter((s) => s.teacher_id === user.id);
  const in7d = now + 7 * 24 * 3600_000;
  const upcomingLiveStatuses = new Set(["scheduled", "ready", "rescheduled", "rearranged", "delayed"]);
  // Count every active session (Scheduled + Ready + rescheduled/rearranged/
  // delayed) inside the next 7 days. We union both data sources so the
  // number matches what "Plan your upcoming Sessions" / "Complete your
  // sessions" actually show: `mySessions` is the freshly-seeded in-memory
  // mirror, `liveSessions` is the persisted store. A single event may exist
  // in both — dedupe by id so groups still count as one session.
  const inactiveForCount = new Set(["cancelled", "completed", "absent", "no_show"]);
  const upcoming7dIds = new Set<string>();
  for (const s of mySessions) {
    const t = +new Date(s.date_time);
    if (inactiveForCount.has(s.status)) continue;
    if (t < now || t > in7d) continue;
    upcoming7dIds.add(s.id);
  }
  for (const s of myLive) {
    const t = +new Date(s.date_time);
    if (inactiveForCount.has(s.status)) continue;
    if (t < now || t > in7d) continue;
    upcoming7dIds.add(s.id);
  }
  const upcoming7dCount = upcoming7dIds.size;
  const thirtyAgo = now - 30 * 24 * 3600_000;
  const ratedLast30 = myLive.filter(
    (s) =>
      typeof s.student_rating === "number" &&
      (s.review_status ?? "pending") !== "discarded" &&
      +new Date(s.date_time) >= thirtyAgo,
  );
  const avgRating30 =
    ratedLast30.length === 0
      ? null
      : Math.round(
          (ratedLast30.reduce((a, s) => a + (s.student_rating ?? 0), 0) / ratedLast30.length) * 10,
        ) / 10;

  // KPI/Performance card
  const kpis = teacherUser ? computeTeacherKpis(teacherUser, getBonusThreshold()) : null;
  const KPI_GOOD = 85;
  const KPI_CRITICAL = 70;
  const signals = kpis
    ? [
        kpis.connectionPunctuality, kpis.planningPunctuality,
        kpis.completionRate, kpis.ratingNormalized, kpis.cancellationScore,
        kpis.responsiveness,
      ]
    : [];
  const belowTarget = signals.filter((v) => v < KPI_GOOD).length;
  const anyCritical = signals.some((v) => v < KPI_CRITICAL);
  const warningLevel: "none" | "yellow" | "red" =
    belowTarget === 0 ? "none" : belowTarget >= 2 || anyCritical ? "red" : "yellow";
  const strikes = teacherUser ? activeStrikeCount(teacherUser.id) : 0;
  const sessionsTaught = mySessions.filter((s) => s.status === "completed").length;
  const ratingGlow =
    avgRating30 == null ? CRIMSON
    : avgRating30 >= 4.0 ? GREEN
    : avgRating30 >= 3.5 ? YELLOW
    : avgRating30 >= 2.5 ? ORANGE
    : CRIMSON;
  const compositeScore = kpis?.composite ?? 0;
  const performanceGlow =
    compositeScore >= 90 ? GREEN
    : compositeScore >= 75 ? YELLOW
    : compositeScore >= 60 ? ORANGE
    : CRIMSON;


  // ---- Club events (Book Clubs / Insights / Spotlight) closure state ----
  // Reuse the shared calendar adapter so the enrolled-student roster is
  // sourced from the same place Calendar shows it — no parallel query.
  const allTeacherEvents: CalendarEvent[] = user
    ? teacherCalendarEvents(user.id, {
        studentNameOf: (id) => userById(id)?.name,
        cohortNameOf: (cohortId) => {
          const templates = loadWorkshops();
          for (const t of templates) {
            const c = t.cohorts.find((c) => c.id === cohortId);
            if (c) return `${t.name} · ${c.name}`;
          }
          return "Workshop";
        },
      })
    : [];
  const pendingClubEvents = allTeacherEvents.filter((ev) => {
    if (ev.kind !== "book_club" && ev.kind !== "insight" && ev.kind !== "spotlight") return false;
    const end = +new Date(ev.date) + ev.duration_minutes * 60_000;
    if (end > now) return false;
    if (clubReports[ev.id]) return false;
    if (ev.status === "cancelled") return false;
    return true;
  });
  const kindToReportType = (k: CalendarEvent["kind"]): "book" | "insight" | "spotlight" =>
    k === "book_club" ? "book" : k === "spotlight" ? "spotlight" : "insight";
  const openClubReport = (ev: CalendarEvent) => {
    setReportingClub({
      id: ev.id,
      type: kindToReportType(ev.kind),
      title: ev.title,
      date: ev.date,
      enrolled_names: ev.enrolled_names ?? [],
    });
  };

  // Opens the Session Report modal for a session listed in "Needs Your
  // Attention". Those items come from the live store, so we fall back to it
  // when the legacy in-memory mirror doesn't have the id. The panel is closed
  // so two modals never stay mounted on top of each other.
  const openSessionReport = (id: string) => {
    const s =
      sessions.find((x) => x.id === id) ??
      (myLive.find((x) => x.id === id) as unknown as Session | undefined);
    if (!s) return;
    setOpenPanel(null);
    setEvaluating(s);
  };

  // ---- Needs Your Attention items ----
  type AttentionChip = { label: string; color: string };
  type AttentionItem = { id: string; icon: LucideIcon; text: string; tone: "warning" | "danger" | "info"; iconClassName?: string; iconWrapClassName?: string; chip?: AttentionChip; cta?: { label: string; to?: string; onClick?: () => void; search?: Record<string, string> } };
  const attention: AttentionItem[] = [];

  // (a) Sessions past their end with no report submitted.
  const missingReports = myLive.filter((s) => {
    const end = +new Date(s.date_time) + s.duration_minutes * 60_000;
    if (end > now) return false;
    if (s.report_submitted_at) return false;
    if (["absent", "cancelled", "no_show", "completed"].includes(s.status)) {
      return s.status === "completed" && !s.report_submitted_at;
    }
    return true;
  });
  for (const s of missingReports.slice(0, 3)) {
    const end = +new Date(s.date_time) + s.duration_minutes * 60_000;
    const deadline = end + REPORT_WINDOW_MS;
    const overdue = now > deadline;
    const who = s.group_id ? groupById(s.group_id)?.name ?? "Group" : userById(s.student_id)?.name ?? "Session";
    const remainingMs = deadline - now;
    const H = 3_600_000;
    let icon: LucideIcon = FileEdit;
    let iconClassName = "text-emerald-600";
    let iconWrapClassName: string | undefined;
    if (overdue) {
      icon = AlertCircle;
      iconClassName = "text-red-600 animate-report-glow";
    } else if (remainingMs < 2 * H) {
      iconClassName = "text-red-600";
    } else if (remainingMs < 12 * H) {
      iconClassName = "text-amber-500";
    }
    attention.push({
      id: `report-${s.id}`,
      icon,
      iconClassName,
      iconWrapClassName,
      tone: overdue ? "danger" : "warning",
      text: overdue
        ? `Session Report overdue — ${who} (${fmt(s.date_time)})`
        : `Session Report pending — ${who} (${fmt(s.date_time)})`,
      cta: { label: overdue ? "Open Report" : "Fill Report", onClick: () => openSessionReport(s.id) },
    });
  }

  // (a2) Club Reports pending / overdue — mirror the Session Report visuals
  //     with the requested 12h/2h thresholds and add a kind chip.
  for (const ev of pendingClubEvents.slice(0, 5)) {
    const end = +new Date(ev.date) + ev.duration_minutes * 60_000;
    const deadline = end + REPORT_WINDOW_MS;
    const overdue = now > deadline;
    const remainingMs = deadline - now;
    const H = 3_600_000;
    let icon: LucideIcon = FileEdit;
    let iconClassName = "text-emerald-600";
    if (overdue) {
      icon = AlertCircle;
      iconClassName = "text-red-600 animate-report-glow";
    } else if (remainingMs < 2 * H) {
      iconClassName = "text-red-600";
    } else if (remainingMs < 12 * H) {
      iconClassName = "text-amber-500";
    }
    const meta = EVENT_KIND_META[ev.kind];
    attention.push({
      id: `clubreport-${ev.id}`,
      icon,
      iconClassName,
      tone: overdue ? "danger" : "warning",
      chip: { label: meta.label, color: meta.color },
      text: overdue
        ? `Club Report overdue — ${ev.title} (${fmt(ev.date)})`
        : `Club Report pending — ${ev.title} (${fmt(ev.date)})`,
      cta: { label: overdue ? "Open Report" : "Fill Report", onClick: () => { setOpenPanel(null); openClubReport(ev); } },
    });
  }

  // (b) 2/3 strikes warning.
  if (strikes === 2) {
    attention.push({
      id: "strikes-2",
      icon: AlertTriangle,
      tone: "danger",
      text: "You are at 2/3 Strikes (6 months). One more Cancellation / No-Show will trigger an automatic Freeze.",
      cta: { label: "View Balance", to: "/teacher/financial" },
    });
  }

  // (c) Pending availability change request.
  const myPending = listChangeRequests("pending").find((r) => r.teacherId === user.id);
  if (myPending) {
    attention.push({
      id: "avail-pending",
      icon: CalendarDays,
      tone: "info",
      text: "Your Availability Change Request is pending admin review.",
      cta: { label: "View", to: "/teacher/availability" },
    });
  }
  void availTick; // ensure re-render when availability updates

  // (d) Available (unclaimed) upcoming clubs that fit teacher's availability.
  const openClubs = clubs.filter((c) => {
    if (c.teacher_id) return false;
    if (c.status === "completed" || c.status === "cancelled") return false;
    if (+new Date(c.date) < now) return false;
    return isTeacherAvailableAt(user.id, c.date, c.duration_minutes ?? 60);
  });
  for (const c of openClubs.slice(0, 2)) {
    attention.push({
      id: `club-${c.id}`,
      icon: SparklesIcon,
      tone: "info",
      text: `Club needs a teacher: "${c.title}" — matches your availability.`,
      cta: { label: "View Available Clubs", to: "/teacher/clubs", search: { highlight: c.id } },
    });
  }

  // (e) Flagged reviews (1-2★) in last 7 days.
  const sevenAgo = now - 7 * 24 * 3600_000;
  const flagged = myLive.filter(
    (s) =>
      typeof s.student_rating === "number" &&
      (s.student_rating as number) <= 2 &&
      (s.review_status ?? "pending") !== "discarded" &&
      +new Date(s.date_time) >= sevenAgo,
  );
  for (const s of flagged.slice(0, 2)) {
    const st = userById(s.student_id);
    attention.push({
      id: `flag-${s.id}`,
      icon: Star,
      tone: "danger",
      text: `Low rating (${s.student_rating}★) from ${st?.name ?? "a student"} — review their card.`,
      cta: { label: "Open Student", to: "/teacher/students", search: st ? { student: st.id } : undefined },
    });
  }

  // ---- Quick Actions (visibility mirrors nav) ----
  const hasVipStudent = USERS.some(
    (u) => u.role === "student" && u.product === "vip" &&
      ASSIGNMENTS.some((a) => a.teacher_id === user.id && a.student_id === u.id),
  );

  // ---- Recent Activity (real data) ----
  const recentLive = [...myLive]
    .filter((s) => !upcomingLiveStatuses.has(s.status))
    .sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time))
    .slice(0, 6);

  // ---- My Recent Feedback (real data, last 7 days) ----
  const recentFeedback = [...myLive]
    .filter(
      (s) =>
        typeof s.student_rating === "number" &&
        +new Date(s.date_time) >= sevenAgo,
    )
    .sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time))
    .slice(0, 10);


  // ---- Recent Activity: Club Reports (Insight / Book Club / Spotlight) ----
  // Each submitted Club Report renders as its own row so the activity feed
  // stays complete without any Performance-Session-only assumptions.
  const eventById = new Map(allTeacherEvents.map((e) => [e.id, e]));
  const clubReportOriginLabel: Record<string, string> = {
    insight: "Insight",
    book: "Book Club",
    spotlight: "Spotlight Session",
  };
  const recentClubReports = Object.values(clubReports)
    .filter((r) => r.teacher_id === user.id)
    .sort((a, b) => +new Date(b.submitted_at) - +new Date(a.submitted_at))
    .slice(0, 6);

  const handleSubmit = (
    sessionId: string,
    attendance: "present" | "delayed" | "absent",
    perf: PerformanceRating,
    subskills: Record<string, number>,
    absentCause?: "student" | "teacher",
    subStatus?: AttendanceSubStatus | null,
    reportComments?: string,
  ) => {
    if (!user) return;
    const session = sessions.find((s) => s.id === sessionId);
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      const status: SessionStatus = attendance === "absent" ? "absent" : "completed";
      return { ...s, status, _noReport: false };
    }));
    submitSessionReport({
      sessionId,
      teacherId: user.id,
      studentId: session?.student_id ?? "",
      attendance,
      absentCause,
      subStatus: subStatus ?? null,
      subskills,
      reportComments,
    });
    const plan = getLessonPlan(sessionId);
    if (plan?.vip_unit_id) {
      if (attendance !== "absent") markVipUnitDone(plan.vip_unit_id, sessionId);
      else clearVipUnitDoneForSession(sessionId);
    }
    if (plan?.tailored_unit_id) {
      if (attendance !== "absent") markTailoredUnitDone(plan.tailored_unit_id, sessionId);
      else clearTailoredUnitDoneForSession(sessionId);
    }
    if (attendance !== "absent") savePerformance(sessionId, perf);
    setEditing(null);
  };

  const handleSavePlan = (plan: LessonPlan) => {
    saveLessonPlan(plan);
    // Promote the shared session record to Ready so both the teacher and
    // student calendars reflect the plan being locked in.
    updateSession(plan.session_id, { status: "ready" as any });
    setPlans((prev) => ({ ...prev, [plan.session_id]: plan }));
    setPlanning(null);
  };

  return (
    <div className="space-y-10">
      <header>
        <div className="text-sm text-muted-foreground">Good day,</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black">{user.name}</h1>
          <Pill>{rankLabel(user)}</Pill>
          <span className="ml-auto"><Pill>{sessionsTaught} sessions taught</Pill></span>
        </div>


      </header>

      {!hydrated ? (
        <SkeletonStatCards count={4} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" />
      ) : (
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

        <Link to="/teacher/students" className="block cursor-pointer">
          <HeroStatCard className="!items-start border border-border bg-card">
            <div className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl bg-transparent">
              <img src={studentsIconAsset.url} alt="" className="h-[52px] w-[52px]" />
            </div>
            <div className="relative w-full">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Assigned Students
              </div>
              <div className="mt-2 text-5xl font-bold leading-none text-foreground">
                <AnimatedNumber value={students.length} />
              </div>

            </div>
          </HeroStatCard>
        </Link>
        <Link to="/teacher/calendar" className="block cursor-pointer">
          <HeroStatCard className="!items-start border border-border bg-card">
            <div className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl bg-transparent">
              <img src={upcomingIconAsset.url} alt="" className="h-[52px] w-[52px]" />
            </div>
            <div className="relative w-full">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Upcoming Sessions
              </div>
              <div className="mt-2 text-5xl font-bold leading-none text-foreground">

                <AnimatedNumber value={upcoming7dCount} />
              </div>
              <div className="mt-2 text-xs font-medium text-muted-foreground">next 7 days</div>
            </div>
          </HeroStatCard>
        </Link>
        <button type="button" onClick={() => setShowRatingTrend(true)} className="block cursor-pointer text-left">
          <HeroStatCard
            className="verbo-focus-pulse !items-start border border-border bg-card"
            style={{ ["--verbo-focus-pulse-color" as any]: ratingGlow } as React.CSSProperties}
          >
            <div className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl bg-transparent">
              <img src={starIconAsset.url} alt="" className="h-[52px] w-[52px]" />
            </div>
            <div className="relative w-full">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Avg Rating
              </div>
              <div className="mt-2 text-5xl font-bold leading-none text-foreground">
                {avgRating30 != null ? `${avgRating30.toFixed(1)}★` : "—"}
              </div>
              <div className="mt-2 text-xs font-medium text-muted-foreground">last 30 days · view trend</div>
            </div>
          </HeroStatCard>
        </button>
        <Link to="/teacher/financial" className="group block">
          <HeroStatCard
            className="verbo-focus-pulse !items-start border border-border bg-card"
            style={{ ["--verbo-focus-pulse-color" as any]: performanceGlow } as React.CSSProperties}
          >
            <div className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl bg-transparent">
              <img src={performanceIconAsset.url} alt="" className="h-[52px] w-[52px]" />
            </div>
            <div className="relative w-full">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Performance
              </div>
              <div className="mt-2 text-6xl font-bold leading-none text-foreground">
                <AnimatedNumber value={kpis?.composite ?? 0} suffix="%" />
                {kpis?.onboarding && (
                  <span className="ml-2 rounded-full bg-white/85 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                    Onboarding
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs font-medium text-muted-foreground">
                Composite Score · view balance
              </div>
            </div>

          </HeroStatCard>
        </Link>

      </section>
      )}



      {/* Compressed action cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenPanel("attention")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenPanel("attention"); } }}
          className="block cursor-pointer text-left"
        >
          <HeroStatCard
            className={`card-gradient-crimson !min-h-[92px] !py-4${attention.length > 0 ? " verbo-focus-pulse" : ""}`}
            style={attention.length > 0 ? ({ ["--verbo-focus-pulse-color" as any]: CRIMSON } as React.CSSProperties) : undefined}
          >
            <div className="relative flex w-full items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.75)" }}>
                  Action Required
                </div>
                <div className="mt-1 text-xl font-semibold leading-tight text-white">Needs Your Attention</div>
                <div className="mt-1 text-xs font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {attention.length === 0 ? "You're all caught up" : `${attention.length} item${attention.length === 1 ? "" : "s"} need review`}
                </div>
              </div>
              <img src={alertIconAsset.url} alt="" aria-hidden className="h-[31px] w-[31px] shrink-0" />
            </div>
          </HeroStatCard>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenPanel("plan")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenPanel("plan"); } }}
          className="block cursor-pointer text-left"
        >
          <HeroStatCard className="card-gradient-violet !min-h-[92px] !py-4">
            <div className="relative flex w-full items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.75)" }}>
                  Lesson Planning
                </div>
                <div className="mt-1 text-xl font-semibold leading-tight text-white">Plan Your Upcoming Sessions</div>
                <div className="mt-1 text-xs font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {toPlanAll.length} session{toPlanAll.length === 1 ? "" : "s"} to plan
                </div>
              </div>
              <img src={planIconAsset.url} alt="" aria-hidden className="h-[31px] w-[31px] shrink-0" />
            </div>
          </HeroStatCard>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenPanel("complete")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenPanel("complete"); } }}
          className="block cursor-pointer text-left"
        >
          <HeroStatCard className="card-gradient-lime !min-h-[92px] !py-4">
            <div className="relative flex w-full items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.75)" }}>
                  Session Reports
                </div>
                <div className="mt-1 text-xl font-semibold leading-tight text-white">Complete Your Sessions</div>
                <div className="mt-1 text-xs font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                  {awaitingCompletion.length + pendingClubEvents.length} session{awaitingCompletion.length + pendingClubEvents.length === 1 ? "" : "s"} awaiting completion
                </div>
              </div>
              <img src={completeIconAsset.url} alt="" aria-hidden className="h-[31px] w-[31px] shrink-0" />
            </div>
          </HeroStatCard>
        </div>
      </section>

      {openPanel === "attention" && (
        <AccentModal
          background={CRIMSON_BG}
          iconTint={CRIMSON}
          icon={AlertTriangle}
          eyebrow="Needs Your Attention"
          title="Needs Your Attention"
          maxWidth="max-w-2xl"
          onClose={() => setOpenPanel(null)}
        >
          <div className="max-h-[65vh] overflow-y-auto p-4">
        <Card className="!p-0">

          {attention.length === 0 ? (
            <div className="flex items-center gap-2 px-6 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((it) => {
                const Icon = it.icon;
                const tone =
                  it.tone === "danger" ? "text-destructive"
                  : it.tone === "warning" ? "text-amber-600"
                  : "text-accent";
                const glyphClass = it.iconClassName ?? tone;
                return (
                  <li key={it.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary ${it.iconWrapClassName ?? ""}`}>
                      <Icon className={`h-4 w-4 ${glyphClass}`} />
                    </div>
                    <div className="min-w-0 flex-1 text-sm text-foreground">
                      {it.chip && (
                        <span
                          className="mr-2 inline-flex items-center rounded-full px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-white"
                          style={{ background: it.chip.color }}
                        >
                          {it.chip.label}
                        </span>
                      )}
                      {it.text}
                    </div>
                    {it.cta && (
                      it.cta.to ? (
                        <a
                          href={it.cta.to + (it.cta.search ? `?${new URLSearchParams(it.cta.search).toString()}` : "")}
                          onClick={(e) => { e.preventDefault(); navigate({ to: it.cta!.to as any, search: (it.cta!.search ?? {}) as never }); }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          {it.cta.label} <ChevronRight className="h-3 w-3" />
                        </a>
                      ) : (
                        <button
                          onClick={it.cta.onClick}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                        >
                          {it.cta.label} <ChevronRight className="h-3 w-3" />
                        </button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
          </div>
          <AccentModalFooter accent={CRIMSON}>
            <GhostButton onClick={() => setOpenPanel(null)}>Close</GhostButton>
          </AccentModalFooter>
        </AccentModal>
      )}

      {openPanel === "plan" && (
        <AccentModal
          background={VIOLET_BG}
          iconTint={VIOLET}
          icon={CalendarClock}
          eyebrow="Plan Your Upcoming Sessions"
          title="Plan Your Upcoming Sessions"
          maxWidth="max-w-2xl"
          onClose={() => setOpenPanel(null)}
        >
          <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4">

            {toPlan.length === 0 && (
              <Card><p className="text-sm text-muted-foreground">No sessions to plan right now.</p></Card>
            )}
            {toPlan.map((s) => {
              const student = userById(s.student_id);
              const planned = Boolean(plans[s.id]);
              return (
                <Card key={s.id} className="flex items-center justify-between gap-3 !p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><CalendarClock className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      {(() => {
                        const lv = student ? computeCurrentProgress(student.id, student.product, student.contracted_levels ?? [], availTick)?.levelName : null;
                        return (
                          <div className="truncate text-sm font-medium text-foreground">{student?.name}{lv ? <span className="text-muted-foreground"> · {lv}</span> : null}</div>
                        );
                      })()}
                      <div className="text-xs text-muted-foreground">{fmt(s.date_time)}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {planned && <Pill tone="success">Planned</Pill>}
                    <GhostButton onClick={() => setPlanning(s)}>{planned ? "Review" : "Plan"}</GhostButton>
                  </div>
                </Card>
              );
            })}
          </div>
          <AccentModalFooter accent={VIOLET}>
            <GhostButton onClick={() => setOpenPanel(null)}>Close</GhostButton>
          </AccentModalFooter>
        </AccentModal>
      )}

      {openPanel === "complete" && (
        <AccentModal
          background={GREEN_BG}
          iconTint={GREEN}
          icon={CheckCircle2}
          eyebrow="Complete Your Sessions"
          title="Complete Your Sessions"
          maxWidth="max-w-2xl"
          onClose={() => setOpenPanel(null)}
        >
          <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4">

            {awaitingCompletion.length === 0 && pendingClubEvents.length === 0 && (
              <Card><p className="text-sm text-muted-foreground">No sessions awaiting completion.</p></Card>
            )}
            {awaitingCompletion.map((s) => {
              const student = userById(s.student_id);
              const start = +new Date(s.date_time);
              const end = start + s.duration_minutes * 60_000;
              const isActive = now >= start && now <= end;
              const sessionPassed = now >= start;
              const deadline = end + REPORT_WINDOW_MS;
              const msLeft = deadline - now;
              const overdue = sessionPassed && msLeft <= 0;
              const showReportControls = sessionPassed;

              return (
                <Card key={s.id} className="flex flex-col gap-3 !p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><CalendarClock className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      {(() => {
                        const lv = student ? computeCurrentProgress(student.id, student.product, student.contracted_levels ?? [], availTick)?.levelName : null;
                        return (
                          <div className="truncate text-sm font-medium text-foreground">{student?.name}{lv ? <span className="text-muted-foreground"> · {lv}</span> : null}</div>
                        );
                      })()}
                      <div className="text-xs text-muted-foreground">{fmt(s.date_time)} · {s.duration_minutes} min</div>
                    </div>
                    {isActive && <Pill tone="success">Live now</Pill>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {showReportControls && !overdue && (
                      <span className="mr-auto text-xs font-medium text-muted-foreground tabular-nums">
                        Time left: {formatCountdown(msLeft)}
                      </span>
                    )}
                    {isActive && s.teams_link && (
                      <a
                        href={s.teams_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
                        style={{ backgroundColor: "#5fca16" }}
                      >
                        <Video className="h-4 w-4" /> Join Live Session
                      </a>
                    )}
                    {showReportControls && (
                      overdue ? (
                        <button
                          disabled
                          className="inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed"
                        >
                          <Lock className="h-4 w-4" /> Overdue (Locked)
                        </button>
                      ) : (
                        <PrimaryButton accentColor={GREEN} onClick={() => setEvaluating(s)}>
                          <FileEdit className="h-4 w-4" /> Fill session report
                        </PrimaryButton>
                      )
                    )}
                  </div>
                </Card>
              );
            })}
            {pendingClubEvents.map((ev) => {
              const meta = EVENT_KIND_META[ev.kind];
              return (
                <Card key={`club-${ev.id}`} className="flex flex-col gap-3 !p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <SparklesIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white"
                          style={{ background: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">{ev.title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{fmt(ev.date)} · {ev.duration_minutes} min</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <PrimaryButton accentColor={GREEN} onClick={() => openClubReport(ev)}>
                      <FileEdit className="h-4 w-4" /> Fill Report
                    </PrimaryButton>
                  </div>
                </Card>
              );
            })}
          </div>
          <AccentModalFooter accent={GREEN}>
            <GhostButton onClick={() => setOpenPanel(null)}>Close</GhostButton>
          </AccentModalFooter>
        </AccentModal>
      )}


      <section>
        <SectionTitle>Quick Actions</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction to="/teacher/availability" iconSrc={availabilityIconAsset.url} label="My Availability" />
          <QuickAction to="/teacher/clubs" iconSrc={clubsIconAsset.url} label="Available Clubs" />
          <QuickAction to="/teacher/financial" iconSrc={balanceIconAsset.url} label="My Balance" />
          {hasVipStudent && (
            <QuickAction to="/teacher/vip" icon={GraduationCap} label="Course Builder VIP" />
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Recent Activity</SectionTitle>
        <Card className="!p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-6 py-3 font-medium">Student / Group</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Origin</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {recentLive.length === 0 && recentClubReports.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-6 text-center text-sm text-muted-foreground">No recent sessions.</td></tr>
              )}
              {recentLive.map((s) => {
                const group = s.group_id ? groupById(s.group_id) : null;
                const student = userById(s.student_id);
                const label =
                  s.status === "completed" ? "Completed"
                  : s.status === "absent" ? "Absent"
                  : s.status === "cancelled" ? "Cancelled"
                  : s.status === "no_show" ? "No-show"
                  : s.status === "delayed" ? "Delayed"
                  : s.status.charAt(0).toUpperCase() + s.status.slice(1);
                const tone =
                  s.status === "completed" ? "success"
                  : s.status === "absent" || s.status === "no_show" ? "danger"
                  : s.status === "delayed" ? "warning"
                  : "default";
                // Performance Sessions origin: workshop → Workshop, spotlight → Spotlight Session,
                // and any other value (including course or missing) is the regular 1:1 performance session.
                const origin = s.origin === "workshop" ? "Workshop" : s.origin === "spotlight" ? "Spotlight Session" : "Performance Session";

                return (
                  <tr
                    key={s.id}
                    onClick={() => setViewing(s)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-secondary/40 last:border-0"
                  >
                    <td className="px-6 py-4 text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {group && (
                          <span className="inline-flex h-5 items-center rounded-md bg-accent/15 px-1.5 text-[10px] font-bold text-accent">
                            G · {group.name}
                          </span>
                        )}
                        {group ? group.name : student?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{fmt(s.date_time)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{origin}</span>
                    </td>
                    <td className="px-6 py-4"><Pill tone={tone as any}>{label}</Pill></td>
                    <td className="px-6 py-4 text-muted-foreground">{s.student_rating ? `${s.student_rating}★` : "—"}</td>
                  </tr>
                );
              })}
              {recentClubReports.map((r) => {
                const ev = eventById.get(r.event_id);
                const title = ev?.title ?? "Club event";
                const dateISO = ev?.date ?? r.submitted_at;
                const originLabel = clubReportOriginLabel[r.event_type] ?? "Club";
                return (
                  <tr
                    key={`clubreport-${r.event_id}`}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-6 py-4 text-foreground">{title}</td>
                    <td className="px-6 py-4 text-muted-foreground">{fmt(dateISO)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{originLabel}</span>
                    </td>
                    <td className="px-6 py-4"><Pill tone="success">Completed</Pill></td>
                    <td className="px-6 py-4 text-muted-foreground">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle>My Recent Feedback</SectionTitle>
          <span className="text-xs font-medium text-muted-foreground">
            What students said · last 7 days
          </span>
        </div>

        {recentFeedback.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            No feedback in the last 7 days.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentFeedback.map((s, i) => {
              const student = userById(s.student_id);
              const status = s.review_status ?? "pending";
              const resolved = status === "reviewed" || status === "discarded";
              const rating = s.student_rating ?? 0;
              const accent = rating >= 4 ? GREEN : rating >= 3 ? YELLOW : CRIMSON;
              const initials = (student?.name ?? "—")
                .split(" ")
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase();
              return (
                <article
                  key={`feedback-${s.id}`}
                  className="verbo-fb-card verbo-td-in relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-border bg-card p-5"
                  style={{ animationDelay: `${Math.min(i, 8) * 36}ms` }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
                    style={{ background: accent, opacity: 0.85 }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-3 -top-6 select-none font-serif text-[110px] leading-none text-foreground/[0.04]"
                  >
                    &rdquo;
                  </span>

                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                      style={{ background: accent }}
                    >
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {student?.name ?? "—"}
                      </div>
                      <div className="truncate text-[11px] font-medium text-muted-foreground">
                        {fmt(s.date_time)}
                      </div>
                    </div>
                    <span className="ml-auto flex shrink-0 items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, k) => (
                        <Star
                          key={k}
                          className={`h-3.5 w-3.5 ${k < rating ? "fill-current text-amber-500" : "text-muted-foreground/25"}`}
                        />
                      ))}
                    </span>
                  </div>

                  <p
                    className={`relative min-h-[48px] text-[15px] leading-snug ${s.student_comment ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    style={s.student_comment ? { letterSpacing: "-0.01em" } : undefined}
                  >
                    {s.student_comment ? `“${s.student_comment}”` : "No written comment"}
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {rating}/5 rating
                    </span>
                    {resolved ? (
                      <Pill tone={status === "reviewed" ? "success" : "muted"}>
                        {status === "reviewed" ? "Resolved" : "Discarded"}
                      </Pill>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">Pending review</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>


      {evaluating && (

        <PerformanceEvaluationModal
          session={evaluating as unknown as Session}
          onClose={() => setEvaluating(null)}
          onContinue={(perf, subskills) => {
            setEditing({ session: evaluating, perf, subskills });
            setEvaluating(null);
          }}
        />
      )}
      {editing && (
        <ReportModal
          session={editing.session as unknown as Session}
          perf={editing.perf}
          subskills={editing.subskills}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
        />
      )}
      {planning && (
        <PlanModal
          session={planning as ExtSession}
          existing={plans[planning.id]}
          onClose={() => setPlanning(null)}
          onSave={handleSavePlan}
        />
      )}
      {viewing && (
        <SessionDetailsModal
          session={viewing}
          plan={plans[viewing.id]}
          title={
            viewing.group_id ? (groupById(viewing.group_id)?.name ?? "Group Session")
            : userById(viewing.student_id)?.name ?? "Session"
          }
          mode={viewing.status === "completed" || viewing.status === "absent" ? "completed" : "ready"}
          coverageNote={getCoverageNoteForStudent(viewing.student_id)}
          onClose={() => setViewing(null)}
        />
      )}
      {reportingClub && user && (
        <ClubReportModal
          event={reportingClub}
          teacherId={user.id}
          onClose={() => setReportingClub(null)}
        />
      )}
      {showRatingTrend && user && (
        <RatingTrendModal
          teacherId={user.id}
          sessions={liveSessions}
          onClose={() => setShowRatingTrend(false)}
        />
      )}
    </div>
  );
}

function QuickAction({ to, icon: Icon, iconSrc, label }: { to: string; icon?: LucideIcon; iconSrc?: string; label: string }) {
  return (
    <Link
      to={to as any}
      className="group flex items-center gap-4 rounded-2xl bg-card px-5 py-5 shadow-[0_8px_20px_-8px_rgba(243,137,52,0.18)] transition-shadow duration-200 hover:shadow-floating verbo-card-hover"
    >
      {iconSrc ? (
        <img src={iconSrc} alt="" aria-hidden className="h-12 w-12 shrink-0 object-contain" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          {Icon ? <Icon className="h-6 w-6" /> : null}
        </div>
      )}
      <div className="min-w-0 text-sm font-semibold text-foreground">{label}</div>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}


function formatCountdown(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

type EntryType = "New word" | "Pronunciation" | "Mistake" | "Tip" | "Other";
interface Entry { id: string; type: EntryType; term: string; explanation: string }
const ENTRY_TYPES: EntryType[] = ["New word", "Pronunciation", "Mistake", "Tip", "Other"];
const MIN_ENTRIES = 6;
const MAX_ENTRIES = 10;

const ENTRY_PLACEHOLDERS: Record<EntryType, { term: string; explanation: string }> = {
  "New word": { term: "New word…", explanation: "Definition or example of use…" },
  "Mistake": { term: "Student's mistake…", explanation: "Correct form…" },
  "Pronunciation": { term: "Target word/phrase…", explanation: "Phonetic guide or sound correction…" },
  "Tip": { term: "Focus area…", explanation: "Practical advice…" },
  "Other": { term: "Topic/Concept…", explanation: "Additional notes…" },
};

function makeEntry(): Entry {
  return { id: Math.random().toString(36).slice(2), type: "New word", term: "", explanation: "" };
}

type Attendance = "present" | "delayed" | "absent";
function ReportModal({ session, perf, subskills, onClose, onSubmit }: {
  session: Session;
  perf: PerformanceRating;
  subskills: Record<string, number>;
  onClose: () => void;
  onSubmit: (id: string, attendance: Attendance, perf: PerformanceRating, subskills: Record<string, number>, absentCause?: "student" | "teacher", subStatus?: AttendanceSubStatus | null, reportComments?: string) => void;
}) {
  const student = userById(session.student_id);
  const [attendance, setAttendance] = useState<Attendance>("present");
  const [attendanceTouched, setAttendanceTouched] = useState(false);
  const [absentCause, setAbsentCause] = useState<"student" | "teacher">("student");
  // Optional sub-status. `null` means plain Absent — DOES affect metrics.
  // AW/AI/AV all skip the metric penalty (justified). Locked past month end.
  const [absentSub, setAbsentSub] = useState<AttendanceSubStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [studentNote, setStudentNote] = useState("");
  const [entries, setEntries] = useState<Entry[]>(() => Array.from({ length: MIN_ENTRIES }, makeEntry));
  const [submitted, setSubmitted] = useState(false);
  const justificationOpen = isJustificationWindowOpen(session.date_time);

  const bgFor = (opt: Attendance) => opt === "present" ? "#22c55e" : opt === "absent" ? "#ef4444" : "#f38934";

  const filledCount = entries.filter((e) => e.term.trim().length > 0 && e.explanation.trim().length > 0).length;
  const isAbsent = attendance === "absent";
  const notesFilled = notes.trim().length > 0;
  const canSubmit = isAbsent
    ? notesFilled
    : filledCount >= MIN_ENTRIES && filledCount <= MAX_ENTRIES && notesFilled;

  const addEntry = () => setEntries((p) => (p.length >= MAX_ENTRIES ? p : [...p, makeEntry()]));
  const updateEntry = (id: string, patch: Partial<Entry>) =>
    setEntries((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEntry = (id: string) => setEntries((p) => p.filter((e) => e.id !== id));

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSubmitted(true);
    onSubmit(session.id, attendance, perf, subskills, isAbsent ? absentCause : undefined, isAbsent ? absentSub : null, isAbsent ? undefined : (studentNote.trim() || undefined));
  };

  const headerBg = attendanceTouched ? bgFor(attendance) : "#01304a";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating">
        <div className="shrink-0">
        <AccentModalHeader
          background={headerBg}
          iconTint={headerBg}
          icon={ClipboardCheck}
          eyebrow={submitted ? "Final report preview" : "Session report"}
          title={student?.name ?? "Session report"}
          watermark={{ type: "icon", icon: ClipboardCheck }}
          onClose={onClose}
        />
        </div>
        <div className="report-modal-scroll flex-1 overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground">{fmt(session.date_time)}</p>


        {submitted ? (
          <ReportPreview
            studentName={student?.name ?? ""}
            dateLabel={fmt(session.date_time)}
            status={attendance === "absent" ? "absent" : attendance === "delayed" ? "delayed" : "completed"}
            notes={notes}
            entries={entries
              .filter((e) => e.term.trim().length > 0 && e.explanation.trim().length > 0)
              .map((e) => ({ id: e.id, type: e.type, content: `${e.term.trim()} — ${e.explanation.trim()}` }))}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="mt-6">
              <label className="text-xs font-medium text-foreground">Attendance</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["present", "absent", "delayed"] as Attendance[]).map((opt) => {
                  const selected = attendance === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => { setAttendance(opt); setAttendanceTouched(true); }}
                      style={selected ? { backgroundColor: bgFor(opt) } : undefined}
                      className={`rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                        selected ? "border-transparent text-white" : "border-border text-foreground hover:bg-secondary"
                      }`}
                    >
                      {opt === "present" ? "Present" : opt === "delayed" ? "Delayed" : "Absent"}
                    </button>
                  );
                })}
              </div>
              {attendance === "delayed" && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  "Delayed" is not a session status: the session still ends as <strong>Completed</strong>
                  with a late-attendance marker used for KPIs.
                </p>
              )}
            </div>

            {isAbsent ? (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground">Absent cause <span className="text-red-600">*</span></label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["student", "teacher"] as const).map((cause) => (
                      <button
                        key={cause}
                        onClick={() => setAbsentCause(cause)}
                        className={`rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                          absentCause === cause
                            ? "border-transparent bg-[#01304a] text-white"
                            : "border-border text-foreground hover:bg-secondary"
                        }`}
                      >
                        {cause}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Reuses the same sub-cause from Admin &gt; Sessions. Only absences with Student cause
                    penalize the student's attendance.
                  </p>
                </div>
                {absentCause === "student" && (
                  <div>
                    <label className="text-xs font-medium text-foreground">Justification (optional)</label>
                    <select
                      value={absentSub ?? ""}
                      onChange={(e) => setAbsentSub((e.target.value || null) as AttendanceSubStatus | null)}
                      disabled={!justificationOpen}
                      className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                    >
                      <option value="">Absent (no justification — affects attendance metrics)</option>
                      <option value="absent_work">{SUB_STATUS_META.absent_work.label} (no metric penalty)</option>
                      <option value="absent_illness">{SUB_STATUS_META.absent_illness.label} (no metric penalty)</option>
                      <option value="absent_vacation">{SUB_STATUS_META.absent_vacation.label} (no metric penalty)</option>
                    </select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {justificationOpen
                        ? "Justifications remove the metric penalty. 3+ Absent Illness in the same period auto-flag the student for Admin review."
                        : "Justification window closed (past month end). Only Admin can add or change a justification now."}
                    </p>
                  </div>
                )}
                <div>
                <label className="text-xs font-medium text-foreground">Teacher's comments <span className="text-muted-foreground">(required)</span></label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Justification, follow-up plan, communication with the student…"
                  className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                </div>
              </div>
            ) : (
              <>
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Pedagogical entries</label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {filledCount} / {MIN_ENTRIES}–{MAX_ENTRIES} filled
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {entries.map((e) => (
                      <div key={e.id} className="flex items-start gap-2">
                        <select
                          value={e.type}
                          onChange={(ev) => updateEntry(e.id, { type: ev.target.value as EntryType })}
                          className="h-[42px] w-[150px] shrink-0 rounded-lg border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {ENTRY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <div className="flex flex-1 gap-2">
                          <input
                            value={e.term}
                            onChange={(ev) => updateEntry(e.id, { term: ev.target.value })}
                            placeholder={ENTRY_PLACEHOLDERS[e.type].term}
                            className="h-[42px] min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <input
                            value={e.explanation}
                            onChange={(ev) => updateEntry(e.id, { explanation: ev.target.value })}
                            placeholder={ENTRY_PLACEHOLDERS[e.type].explanation}
                            className="h-[42px] min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                        <button
                          onClick={() => removeEntry(e.id)}
                          disabled={entries.length <= 1}
                          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addEntry}
                    disabled={entries.length >= MAX_ENTRIES}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-4 w-4" /> Add new entry
                  </button>
                </div>

                <div className="mt-5">
                  <label className="text-xs font-medium text-foreground">Class notes <span className="text-red-600">*</span> <span className="text-muted-foreground">(required)</span></label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Topics covered, student performance, homework…"
                    className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="mt-5">
                  <label className="text-xs font-medium text-foreground">Note for the student <span className="text-muted-foreground">(optional)</span></label>
                  <textarea
                    value={studentNote}
                    onChange={(e) => setStudentNote(e.target.value)}
                    rows={3}
                    placeholder="A short comment or tip the student will see on their dashboard…"
                    className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Shown to the student in their Quick Review Dock. Leave empty to skip.
                  </p>
                </div>
              </>
            )}

            <div className="mt-6 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {isAbsent
                  ? (notesFilled ? "Ready to submit." : "Comments required to submit.")
                  : filledCount < MIN_ENTRIES
                  ? `Add ${MIN_ENTRIES - filledCount} more entr${MIN_ENTRIES - filledCount === 1 ? "y" : "ies"} to submit.`
                  : !notesFilled
                  ? "Class notes are required to submit."
                  : "Ready to submit."}
              </p>
              <div className="flex gap-2">
                <GhostButton onClick={onClose}>Cancel</GhostButton>
                <PrimaryButton onClick={handleSubmit} disabled={!canSubmit}>Submit report</PrimaryButton>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>

  );
}

function ReportPreview({ studentName, dateLabel, status, notes, entries, onClose }: {
  studentName: string; dateLabel: string; status: SessionStatus; notes: string; entries: { id: string; type: EntryType; content: string }[]; onClose: () => void;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <span>Report successfully compiled and shared with the student in their dashboard.</span>
      </div>

      <div className="rounded-xl border border-border bg-background p-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#01304a" }}>Verbo Language Solutions</div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Final Session Report</h3>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{dateLabel}</div>
            <div className="mt-0.5 capitalize">Status: <span className="font-medium text-foreground">{status === "completed" ? "Completed" : status}</span></div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Student</div>
            <div className="mt-0.5 font-medium text-foreground">{studentName}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Entries</div>
            <div className="mt-0.5 font-medium text-foreground">{entries.length}</div>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium w-[140px]">Type</th>
                  <th className="px-3 py-2 font-medium">Content</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#f3893420", color: "#01304a" }}>{e.type}</span>
                    </td>
                    <td className="px-3 py-2 text-foreground">{e.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {notes.trim().length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Teacher's comments</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{notes}</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <GhostButton onClick={onClose}>Close</GhostButton>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-sm font-medium text-muted-foreground opacity-70"
        >
          <Download className="h-4 w-4" /> Download PDF
        </button>
      </div>
    </div>
  );
}


// ============================================================
// New two-tier Performance Evaluation system
// ============================================================

type BaseKey = SharedBaseKey;

interface SubSkillDef { name: string; base: BaseKey }
interface MacroSkillDef {
  key: "Speaking" | "Writing" | "Listening" | "Reading";
  icon: LucideIcon;
  subs: SubSkillDef[];
}

// Sourced from the shared taxonomy so the Session Report, the student
// dashboard "Linguistic Asset Performance" widget, and the teacher
// "Overall Skills" summary all stay perfectly in sync.
const MACRO_SKILLS: MacroSkillDef[] = SHARED_MACRO_SKILLS as unknown as MacroSkillDef[];

// Scores keyed by `${macroKey}::${subName}` → 0-100 number or null (skipped).
type ScoresMap = Record<string, number | null>;

function subKey(macro: string, sub: string) {
  return `${macro}::${sub}`;
}

function scoreColorClasses(value: number) {
  if (value < 50) return "text-red-600 bg-red-50 border-red-200";
  if (value < 60) return "text-orange-600 bg-orange-50 border-orange-200";
  if (value < 70) return "text-amber-600 bg-amber-50 border-amber-200";
  if (value < 80) return "text-lime-600 bg-lime-50 border-lime-200";
  if (value < 90) return "text-emerald-500 bg-emerald-50 border-emerald-200";
  return "text-emerald-700 bg-emerald-100 border-emerald-300";
}

function sliderAccent(value: number) {
  if (value < 50) return "#dc2626";
  if (value < 60) return "#ea580c";
  if (value < 70) return "#d97706";
  if (value < 80) return "#65a30d";
  if (value < 90) return "#10b981";
  return "#047857";
}

function macroOverall(macro: MacroSkillDef, scores: ScoresMap): number | null {
  const vals: number[] = [];
  for (const s of macro.subs) {
    const v = scores[subKey(macro.key, s.name)];
    if (typeof v === "number") vals.push(v);
  }
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function macroRatedCount(macro: MacroSkillDef, scores: ScoresMap): number {
  return macro.subs.reduce((acc, s) => acc + (typeof scores[subKey(macro.key, s.name)] === "number" ? 1 : 0), 0);
}

/** Map 0-100 sub-skill scores → legacy PerformanceRating (0-5 per base dim, avg of evaluated). */
function buildPerformanceRating(scores: ScoresMap): PerformanceRating {
  const buckets: Record<BaseKey, number[]> = { fluency: [], vocabulary: [], confidence: [], grammar: [] };
  for (const m of MACRO_SKILLS) {
    for (const s of m.subs) {
      const v = scores[subKey(m.key, s.name)];
      if (typeof v === "number") buckets[s.base].push(v);
    }
  }
  const toStars = (arr: number[]) => arr.length === 0 ? 0 : Math.max(0, Math.min(5, (arr.reduce((a, b) => a + b, 0) / arr.length) / 20));
  return {
    fluency: toStars(buckets.fluency),
    vocabulary: toStars(buckets.vocabulary),
    confidence: toStars(buckets.confidence),
    grammar: toStars(buckets.grammar),
  };
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
        --
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${scoreColorClasses(value)}`}>
      {value}%
    </span>
  );
}

function PerformanceEvaluationModal({
  session,
  onClose,
  onContinue,
}: {
  session: Session;
  onClose: () => void;
  onContinue: (perf: PerformanceRating, subskills: Record<string, number>) => void;
}) {
  const student = userById(session.student_id);
  const [scores, setScores] = useState<ScoresMap>({});
  const [activeMacro, setActiveMacro] = useState<MacroSkillDef | null>(null);

  const handleContinue = () => {
    // Raw per-subskill map (0-100) — this is the record that gets written
    // to performance-store via saveSubskillEvaluation, feeding the exact
    // same data source consumed by the student's "Linguistic Asset
    // Performance" widget and the teacher's "Overall Skills" summary.
    const rawSubskills: Record<string, number> = {};
    for (const m of MACRO_SKILLS) {
      for (const s of m.subs) {
        const v = scores[subKey(m.key, s.name)];
        if (typeof v === "number") {
          rawSubskills[sharedSkillKey(m.key as any, s.name)] = v;
        }
      }
    }
    onContinue(buildPerformanceRating(scores), rawSubskills);
  };

  return (
    <AccentModal
      maxWidth="max-w-2xl"
      background="linear-gradient(135deg, #01304a 0%, #024366 100%)"
      iconTint="#01304a"
      icon={Gauge}
      eyebrow="Step 1 of 2"
      title="Student Performance Evaluation"
      watermark={{ type: "icon", icon: Gauge }}
      onClose={onClose}
    >
      <div className="p-8 pt-6">
        <div className=" rounded-lg border border-border bg-secondary/40 p-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Student</div>
              <div className="mt-0.5 font-medium text-foreground">{student?.name}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Session Details</div>
              <div className="mt-0.5 font-medium text-foreground">{fmt(session.date_time)}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {MACRO_SKILLS.map((m) => {
            const rated = macroRatedCount(m, scores);
            const overall = macroOverall(m, scores);
            const Icon = m.icon;
            const statusLabel = rated === 0 ? "Skipped" : `${rated} of ${m.subs.length} rated`;
            return (
              <button
                key={m.key}
                onClick={() => setActiveMacro(m)}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-[#01304a]/30 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(1, 48, 74, 0.06)", color: "#01304a" }}>
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.7} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: "#01304a" }}>{m.key}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-medium ${rated === 0 ? "text-slate-400" : "text-muted-foreground"}`}>
                    {statusLabel}
                  </span>
                  <ScoreBadge value={overall} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            onClick={handleContinue}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#f38934" }}
          >
            Confirm & Continue
          </button>
        </div>
      </div>

      {activeMacro && (
        <SubSkillModal
          macro={activeMacro}
          scores={scores}
          onChange={setScores}
          onClose={() => setActiveMacro(null)}
        />
      )}
    </AccentModal>
  );
}

function SubSkillModal({
  macro,
  scores,
  onChange,
  onClose,
}: {
  macro: MacroSkillDef;
  scores: ScoresMap;
  onChange: (next: ScoresMap) => void;
  onClose: () => void;
}) {
  const Icon = macro.icon;

  const setSub = (name: string, value: number | null) => {
    const next = { ...scores };
    const k = subKey(macro.key, name);
    if (value === null) delete next[k];
    else next[k] = value;
    onChange(next);
  };

  return (
    <AccentModal
      maxWidth="max-w-xl"
      zClass="z-[60]"
      background="linear-gradient(135deg, #024366 0%, #01304a 100%)"
      iconTint="#01304a"
      icon={Icon}
      eyebrow="Tier 2 evaluation"
      title={`${macro.key} Session Evaluation`}
      watermark={{ type: "icon", icon: Icon }}
      onClose={onClose}
    >
      <div className="max-h-[70vh] overflow-y-auto p-8 pt-6">
        <div className="space-y-4">
          {macro.subs.map((s) => {
            const v = scores[subKey(macro.key, s.name)];
            const active = typeof v === "number";
            const accent = active ? sliderAccent(v as number) : "#cbd5e1";
            return (
              <div key={s.name} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold" style={{ color: active ? "#01304a" : "#94a3b8" }}>
                    {s.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {active ? (
                      <>
                        <ScoreBadge value={v as number} />
                        <button
                          onClick={() => setSub(s.name, null)}
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label={`Reset ${s.name}`}
                          title="Reset to Skipped"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        Skipped
                      </span>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={active ? (v as number) : 0}
                  onChange={(e) => setSub(s.name, Number(e.currentTarget.value))}
                  onClick={(e) => {
                    if (!active) setSub(s.name, Number((e.currentTarget as HTMLInputElement).value));
                  }}
                  className="mt-3 w-full cursor-pointer appearance-none rounded-full"
                  style={{
                    height: 6,
                    background: active
                      ? `linear-gradient(to right, ${accent} 0%, ${accent} ${v as number}%, #e2e8f0 ${v as number}%, #e2e8f0 100%)`
                      : "#e2e8f0",
                    accentColor: accent,
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex items-center justify-end">
          <button
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-soft transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#01304a" }}
          >
            Ready
          </button>
        </div>
      </div>
    </AccentModal>
  );
}

