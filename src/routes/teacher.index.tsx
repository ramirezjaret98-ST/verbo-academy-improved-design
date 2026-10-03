Warning: truncated output (original token count: 26592)
Total output lines: 2170

import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { TeacherScheduleAttention, useTeacherScheduleAttention } from "@/components/verbo/TeacherScheduleAttention";
import { USERS, studentsOfTeacher, userById, type Session, type SessionStatus } from "@/lib/mock-data";
import { assignedStudentIdsFor, hydrateAssignments, subscribeAssignments } from "@/lib/assignments-store";
import { hydrateStudents, subscribeStudents } from "@/lib/students-store";
import { notifySuccess } from "@/lib/notify";
import { Gauge } from "lucide-react";
import { AccentModal, AccentModalHeader, AccentModalFooter, AnimatedNumber, Card, GhostButton, HeroStatCard, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import { SkeletonStatCards, useHydrated } from "@/components/verbo/skeletons";

import { rankLabel } from "@/lib/staff-profile-store";
import alertIconAsset from "@/assets/Alert.svg";
import planIconAsset from "@/assets/plan.svg";
import completeIconAsset from "@/assets/complete.svg";

import { CalendarClock, ClipboardCheck, FileEdit, X, Lock, Plus, Trash2, Download, CheckCircle2, Mic, PenLine, Ear, BookOpen, ChevronRight, Video, Star, AlertTriangle, AlertCircle, Trophy, CalendarDays, Users, Wallet, Sparkles as SparklesIcon, GraduationCap, type LucideIcon } from "lucide-react";
import { savePerformance, type PerformanceRating } from "@/lib/performance-store";
import { MACRO_SKILLS as SHARED_MACRO_SKILLS, skillKey as sharedSkillKey, type BaseKey as SharedBaseKey } from "@/lib/skills-taxonomy";
import { submitSessionReport, updateSession, loadSessions, subscribeSessions, notifySessionEvent, logSessionConnect, SUB_STATUS_META, isJustificationWindowOpen, type ExtSession, type AttendanceSubStatus } from "@/lib/sessions-store";
import { PlanModal } from "@/components/verbo/PlanModal";
import { ReorderLessonPlansModal } from "@/components/verbo/ReorderLessonPlansModal";
import { downloadSessionReportPdf, sessionReportPdfBlob, sessionReportFileName } from "@/lib/session-report-pdf";
import { downloadCollaborationPdf, downloadKpiSummaryPdf } from "@/lib/simple-docs-pdf";
import { uploadContentFile } from "@/lib/content-uploads";
import { legacyToUuid } from "@/lib/user-id-bridge";
import { supabase } from "@/integrations/supabase/client";

import { subscribeCourses, computeCurrentProgress } from "@/lib/product-courses-store";
import { loadLessonPlans, saveLessonPlan, subscribeLessonPlans, getLessonPlan, type LessonPlan } from "@/lib/lesson-plans-store";
import { markVipUnitDone, clearVipUnitDoneForSession } from "@/lib/vip-courses-store";
import { markTailoredUnitDone, clearTailoredUnitDoneForSession } from "@/lib/tailored-content-store";
import { computeTeacherKpis, getBonusThreshold } from "@/lib/teacher-kpis";
import { avgRating, hydrateTeachers, subscribeTeachers } from "@/lib/teacher-model";
import { activeStrikeCount } from "@/lib/strikes-store";
import { listChangeRequests, isTeacherAvailableAt, subscribeAvailability } from "@/lib/availability-store";
import { loadClubs, subscribeClubs, type Club } from "@/lib/clubs-store";
import { groupById } from "@/lib/groups-store";
import { SessionDetailsModal } from "@/components/verbo/SessionDetailsModal";
import { teacherCalendarEvents, EVENT_KIND_META, type CalendarEvent } from "@/lib/calendar-events";
import { loadWorkshops } from "@/lib/workshops-store";
import { loadClubReports, subscribeClubReports, type ClubReport } from "@/lib/club-reports-store";
import { ClubReportModal, type ClubReportEventInput } from "@/components/verbo/ClubReportModal";
import { subscribeBookings } from "@/lib/club-bookings-store";
import { RatingTrendModal } from "@/components/verbo/RatingTrendModal";
import { getCoverageNoteForStudent } from "@/lib/coverage-notes-store";
import studentsIconAsset from "@/assets/students_assigned.svg";
import upcomingIconAsset from "@/assets/Upcoming_sessions.svg";
import starIconAsset from "@/assets/Star.svg";
import performanceIconAsset from "@/assets/performance.svg";
import availabilityIconAsset from "@/assets/availability.svg";
import tailoredIconAsset from "@/assets/vip-tailored.svg";

import clubsIconAsset from "@/assets/clubs.svg";
import balanceIconAsset from "@/assets/balance.svg";

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
  const [reordering, setReordering] = useState<ExtSession | null>(null);
  
  const [plans, setPlans] = useState<Record<string, LessonPlan>>({});
  // Live-synced canonical sessions (used by summary cards, Needs Your
  // Attention, and Recent Activity). Everything else in the dashboard
  // still reads the legacy `sessions` mirror so the report/plan flows
  // keep their local mutation model.
  const [liveSessions, setLiveSessions] = useState<ExtSession[]>(() =>
    typeof window === "undefined" ? [] : loadSessions()
  );
  const scheduleAttention = useTeacherScheduleAttention(user?.id, liveSessions);
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
    hydrateAssignments();
    const u8 = subscribeAssignments(() => setAvailTick((n) => n + 1));
    hydrateStudents();
    const u9 = subscribeStudents(() => setAvailTick((n) => n + 1));
    // Bug fix (2026-08-13): a REAL (non-seed) teacher account's own USERS
    // entry (keyed by legacy_id) is only ever pushed by hydrateTeachers() —
    // and this route never called it. Every consumer of `teacherUser` below
    // (KPI/Performance card, strikes) silently stayed null forever for any
    // teacher created after the auth migration (e.g. via admin-create-user),
    // even though their sessions/data were all correct in the DB. Same root
    // cause as the "My Balance" page — see teacher.financial.tsx.
    hydrateTeachers();
    const u10 = subscribeTeachers(() => setAvailTick((n) => n + 1));
    const u11 = subscribeBookings(() => setAvailTick((n) => n + 1));
    return () => { u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10(); u11(); };
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
  // 2026-08-22 fix: this used to derive from `upcoming` (status === "scheduled"
  // only), so a session that already had a lesson plan saved — status flips to
  // "ready" the moment a plan is saved, well before class — silently fell out
  // of "Complete Your Sessions" the instant it passed its start time, with no
  // report ever filled. Teachers now save lesson plans ahead of time far more
  // consistently (the lesson_plan_ready email nudges them to), so this was
  // hiding real, common cases, not just an edge case. Sessions still awaiting
  // a plan (truly "scheduled") and sessions that already have one ("ready")
  // both belong here — either way, once the class has happened, a report is
  // still owed. See fix_report_modal_completar_sesiones_planificadas_2026-08-22
  // for the incident this surfaced from (Ericka Escamilla's sessions).
  const awaitingCompletion = mySessions.filter(
    (s) => (s.status === "scheduled" || s.status === "ready") && now >= +new Date(s.date_time),
  );

  // ---- Real-data derivations (cards, Needs Attention, Recent Activity) ----
  const teacherUser = USERS.find((u) => u.id === user.id && u.role === "teacher") ?? null;
  const myLive = liveSessions.filter((s) => s.teacher_id === user.id);
  const in7d = now + 7 * 24 * 3600_000;
  const upcomingLiveStatuses = new Set(["scheduled", "ready", "rescheduled", "rearranged", "delayed", "pending_reschedule"]);
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

  // Simple branded documents (2026-08-20) — teacher's own collaboration
  // letter + performance summary, on-demand client-side, same pattern as
  // the session report download elsewhere in this file.
  const [downloadingTeacherDoc, setDownloadingTeacherDoc] = useState<"collab" | "kpi" | null>(null);
  async function handleDownloadCollaboration() {
    if (!teacherUser) return;
    setDownloadingTeacherDoc("collab");
    try {
      await downloadCollaborationPdf({
        id: teacherUser.id,
        name: teacherUser.name,
        email: teacherUser.email,
        hireDate: teacherUser.hire_date,
      });
    } catch (err) {
      console.error("[TeacherDashboard] failed to generate collaboration PDF", err);
    } finally {
      setDownloadingTeacherDoc(null);
    }
  }
  async function handleDownloadKpiSummary() {
    if (!teacherUser || !kpis) return;
    setDownloadingTeacherDoc("kpi");
    try {
      await downloadKpiSummaryPdf({
        teacher: { id: teacherUser.id, name: teacherUser.name, email: teacherUser.email },
        period: new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" }),
        kpis,
        activeStudentCount: students.length,
      });
    } catch (err) {
      console.error("[TeacherDashboard] failed to generate KPI summary PDF", err);
    } finally {
      setDownloadingTeacherDoc(null);
    }
  }
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
  const ratingGlow = ratingScaleColor(avgRating30);

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
      enrolled_students: ev.enrolled_students ?? [],
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
  const myAssignedIds = assignedStudentIdsFor(user.id);
  const hasVipStudent = USERS.some(
    (u) => u.role === "student" && u.product === "vip" && myAssignedIds.includes(u.id),
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
    notes?: string,
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
      notes,
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
    if (attendance !== "absent") savePerformance(sessionId, session?.student_id ?? "", user.id, perf);
    setEditing(null);
    notifySuccess("Session report submitted.");
  };

  const handleSavePlan = (plan: LessonPlan) => {
    saveLessonPlan(plan);
    // Promote the shared session record to Ready so both the teacher and
    // student calendars reflect the plan being locked in.
    updateSession(plan.session_id, { status: "ready" as any });
    setPlans((prev) => ({ ...prev, [plan.session_id]: plan }));
    setPlanning(null);
    notifySuccess("Lesson plan saved.");
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <TeacherScheduleAttention attention={scheduleAttention} />
      <header className="verbo-td-in grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Good day,</div>
          <h1
            className="mt-1.5 truncate text-2xl font-semibold text-foreground sm:text-4xl"
            style={{ letterSpacing: "-0.02em", lineHeight: 1.05 }}
          >
            {user.name}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5">
          {/* Tier: solid navy badge — the single highest-signal credential on this page */}
          <span className="verbo-hdr-chip inline-flex items-center gap-1.5 rounded-full bg-primary py-1.5 pl-2 pr-3.5 text-primary-foreground shadow-[0_8px_20px_-12px_rgba(11,31,59,0.9)]">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-foreground/15">
              <Trophy className="h-3 w-3" />
            </span>
            <span className="text-[12px] font-bold tracking-[0.01em]">{rankLabel(user)}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">tier</span>
          </span>
          {/* Sessions taught: number-forward stat chip so the figure reads before the label */}
          <span className="verbo-hdr-chip inline-flex items-baseline gap-1.5 rounded-full border border-border bg-card py-1.5 pl-3.5 pr-3.5">
            <span className="text-[15px] font-bold tabular-nums leading-none text-foreground">{sessionsTaught}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">sessions taught</span>
          </span>
        </div>

      </header>

      {!hydrated ? (
        <SkeletonStatCards count={4} className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4" />
      ) : (
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">

        <Link to="/teacher/students" clas…11592 tokens truncated…ap-2">
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
  studentName: string; dateLabel: string; status: SessionStatus; notes: string; entries: { id: string; type: EntryType; term: string; explanation: string }[]; onClose: () => void;
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
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Session Report</h3>
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
                  <th className="px-3 py-2 font-medium w-[120px]">Type</th>
                  <th className="px-3 py-2 font-medium w-[200px]">Word / Phrase</th>
                  <th className="px-3 py-2 font-medium">Definition / Note</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#f3893420", color: "#01304a" }}>{e.type}</span>
                    </td>
                    <td className="px-3 py-2 align-top font-medium text-foreground">{e.term}</td>
                    <td className="px-3 py-2 text-foreground">{e.explanation}</td>
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
          onClick={() => downloadSessionReportPdf({ studentName, dateLabel, status, notes, entries })}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
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

// Exported alongside ReportModal above, same reason (Admin > Calendar reuse).
export function PerformanceEvaluationModal({
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

  // Sub-skills the teacher chose to focus on when planning this session
  // (PlanModal), if any — purely a visual hint here: it never pre-fills a
  // score (there's no such thing as a score nobody actually observed) and
  // never restricts which sub-skills can still be rated. Jaret's call
  // 2026-09-16: "solo una marca visual", no auto-opening any macro-skill.
  const plannedKeys = new Set(getLessonPlan(String(session.id))?.focus_subskills ?? []);
  const macroHasPlanned = (m: MacroSkillDef) =>
    m.subs.some((s) => plannedKeys.has(sharedSkillKey(m.key as any, s.name)));

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
                className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-left transition-[border-color,box-shadow] duration-200 ease-out hover:border-[#01304a]/30 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(1, 48, 74, 0.06)", color: "#01304a" }}>
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.7} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: "#01304a" }}>{m.key}</span>
                    {macroHasPlanned(m) && (
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: "#f38934" }}
                        title="The teacher planned to focus on at least one sub-skill here"
                      >
                        Planned
                      </span>
                    )}
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
          plannedKeys={plannedKeys}
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
  plannedKeys,
}: {
  macro: MacroSkillDef;
  scores: ScoresMap;
  onChange: (next: ScoresMap) => void;
  onClose: () => void;
  /** Sub-skill keys ("Macro:Sub") the teacher chose at planning time — shows
   *  a "Planned" tag next to the matching sub-skills here. Optional so this
   *  component still works if ever called without a lesson plan in scope. */
  plannedKeys?: Set<string>;
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
            const isPlanned = plannedKeys?.has(sharedSkillKey(macro.key as any, s.name)) ?? false;
            return (
              <div key={s.name} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: active ? "#01304a" : "#94a3b8" }}>
                    {s.name}
                    {isPlanned && (
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: "#f38934" }}
                        title="The teacher planned to focus on this sub-skill"
                      >
                        Planned
                      </span>
                    )}
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


/**
 * Continuous red → orange → amber → green ramp for a 0-100 score.
 * Shared visual language with the KPI dashboard.
 */
function scoreScaleColor(pct: number) {
  const stops: [number, [number, number, number]][] = [
    [0, [220, 38, 38]],    // red
    [45, [234, 88, 12]],   // orange
    [65, [245, 158, 11]],  // amber
    [82, [163, 191, 24]],  // yellow-green
    [100, [63, 143, 16]],  // green
  ];
  const v = Math.max(0, Math.min(100, pct));
  let a = stops[0]!;
  let b = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i]![0] && v <= stops[i + 1]![0]) {
      a = stops[i]!;
      b = stops[i + 1]!;
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const t = (v - a[0]) / span;
  const ch = (i: number) => Math.round(a[1][i]! + (b[1][i]! - a[1][i]!) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** 0-5 star rating mapped onto the same continuous ramp. */
function ratingScaleColor(rating: number | null | undefined) {
  if (rating == null) return "#94a3b8";
  return scoreScaleColor(Math.max(0, Math.min(100, (rating / 5) * 100)));
}

