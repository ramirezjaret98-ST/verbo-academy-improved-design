import { createFileRoute } from "@tanstack/react-router";
import experiencesClubs from "@/assets/experiences-clubs.png.asset.json";
import teamsLogo from "@/assets/teams-logo.webp.asset.json";
import verbotGif from "@/assets/Verbot_1.gif.asset.json";
import verbotEmocionado from "@/assets/Verbot_emocionado.svg.asset.json";
import verbotMotivado from "@/assets/Verbot_motivado.svg.asset.json";
import verbotGuau from "@/assets/Verbot_guau.svg.asset.json";
import verbotEmoji from "@/assets/Verbot_emoji.svg.asset.json";
import verbotMolesto from "@/assets/Verbot_molesto.svg.asset.json";
import verbotEnojado from "@/assets/Verbot_enojado.svg.asset.json";
import verbotFurioso from "@/assets/Verbot_furioso.svg.asset.json";
import verbotStageZero from "@/assets/stage_0_verbot.svg.asset.json";

import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { userById } from "@/lib/mock-data";
import { hydrateTeachers } from "@/lib/teacher-model";
import { effectiveSessionCounts, groupOfStudent } from "@/lib/groups-store";
import { subscribeSessions, getSessionsSnapshot, getServerSessionsSnapshot, submitStudentRating, studentAttendance, type ExtSession, type ExtSessionStatus } from "@/lib/sessions-store";
import {
  getPerformanceSnapshot,
  getServerPerformanceSnapshot,
  subscribePerformance,
  type PerformanceRating,
} from "@/lib/performance-store";
import { loadCourses, subscribeCourses, PRODUCT_META, computeCurrentProgress, resolvePlanTopic } from "@/lib/product-courses-store";
import { getLessonPlan, subscribeLessonPlans, type LessonPlan } from "@/lib/lesson-plans-store";
import { unitsForStudent } from "@/lib/vip-courses-store";
import { tailoredUnitsForStudent } from "@/lib/tailored-content-store";
import { subscribeVipUnits, subscribeVipUnitCompletion } from "@/lib/vip-courses-store";
import { useComputedMacros } from "@/components/verbo/PerformanceAnalytics";
import { AccentModalHeader, AnimatedNumber, GhostButton, HeroStatCard, InfoStatRow, Pill, PhotoPlaceholder, PrimaryButton, SectionTitle, StatRing, SuccessButton } from "@/components/verbo/ui";
import { SkeletonStatCards, useHydrated } from "@/components/verbo/skeletons";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,

  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,

  Download,
  Medal,
  NotebookPen,
  ShieldAlert,
  Sparkles,
  Star,
  Users,
  Video,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  loadBadges as loadProfileBadges,
  subscribeBadges as subscribeProfileBadges,
  isBadgeEarned,
  buildProfileBadgeContext,
  type BadgeDef as ProfileBadgeDef,
} from "@/lib/profile-badges-store";
import {
  loadEquippedBadgeIds,
  subscribeEquippedBadges,
} from "@/lib/equipped-profile-badges-store";
import {
  loadBadges as loadChallengeBadges,
  subscribeBadges as subscribeChallengeBadges,
  isBadgeEarned as isChallengeBadgeEarned,
  type BadgeDef as ChallengeBadgeDef,
} from "@/lib/badges-store";
import { isBadgeManuallyGranted } from "@/lib/badge-override-store";
import {
  loadEquippedChallengeBadgeIds,
  subscribeEquippedChallengeBadges,
} from "@/lib/equipped-challenge-badges-store";
import { loadChallenges } from "@/lib/challenges-store";
import { loadSeasons } from "@/lib/flash-challenges-store";
import { loadClubs, type Club } from "@/lib/clubs-store";
import { isBooked } from "@/lib/club-bookings-store";
import { ClubReservationModal } from "@/components/verbo/ClubReservationModal";
import { EVENT_KIND_META, CALENDAR_STATUS_META, calendarEventTheme } from "@/lib/calendar-events";
import { RatingModal } from "@/components/verbo/RatingModal";
import { ReportConductModal } from "@/components/verbo/ReportConductModal";
import { CantAttendRouter, RescheduleRequestModal } from "@/components/verbo/CancelSessionFlow";
import micIconAsset from "@/assets/yellow-mic.svg.asset.json";
import pencilIconAsset from "@/assets/pencil-animation.svg.asset.json";
import soundWavesIconAsset from "@/assets/sound-waves.svg.asset.json";
import bookIconAsset from "@/assets/book-icon.svg.asset.json";
import { useAvatar } from "@/lib/avatar-store";
import { ProfilePeekCard } from "@/components/verbo/ProfilePeekCard";

const MACRO_ICON_ASSETS: Record<string, string> = {
  Speaking: micIconAsset.url,
  Writing: pencilIconAsset.url,
  Listening: soundWavesIconAsset.url,
  Reading: bookIconAsset.url,
};



export const Route = createFileRoute("/student/")({
  component: StudentDashboard,
});

/**
 * Teacher/host avatar: shows the uploaded profile photo when the staff member
 * has one (avatar-store), otherwise falls back to their initial.
 */
function TeacherAvatar({
  userId,
  name,
  className = "h-9 w-9",
}: {
  userId?: string;
  name?: string;
  className?: string;
}) {
  const avatar = useAvatar(userId);
  const inner = avatar ? (
    <img
      src={avatar}
      alt={name ?? "Teacher"}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  ) : (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#01304a] text-sm font-semibold text-white ${className}`}
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


/** Section heading with a colored icon circle (Class Details modal). */
function SectionHeadIcon({ icon, circleClass = "", label }: { icon: React.ReactNode; circleClass?: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-border ${circleClass}`}>{icon}</span>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h4>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function dayKeyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayKey(iso: string) {
  return dayKeyOf(new Date(iso));
}

function PremiumCard({ children, className = "", hover = false, style }: { children: React.ReactNode; className?: string; hover?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={style} className={`rounded-3xl border border-border p-6 verbo-card ${hover ? "verbo-card-hover" : ""} ${className}`}>
      {children}
    </div>
  );
}

const ProgressRing = StatRing;

const SKILL_COLORS: Record<string, string> = {
  Speaking: "#f38934",
  Writing: "#7e22ce",
  Listening: "#01304a",
  Reading: "oklch(0.6 0.104 185)",
};

// Attendance theme scale — color, background gradient and Verbot expression
// for each band. First band whose `min` is <= pct wins.
const ATTENDANCE_THEME = [
  { min: 95, gradient: ["#16a34a", "#15803d"], verbot: "emocionado" },
  { min: 85, gradient: ["#7ee02d", "#3ea008"], verbot: "motivado" },
  { min: 75, gradient: ["#c9e02d", "#9dbb0a"], verbot: "guau" },
  { min: 65, gradient: ["#fde047", "#eab308"], verbot: "emoji" },
  { min: 55, gradient: ["#fbbf24", "#d97706"], verbot: "molesto" },
  { min: 45, gradient: ["#fb923c", "#c2410c"], verbot: "enojado" },
  { min: 30, gradient: ["#f87171", "#b91c1c"], verbot: "furioso" },
  { min: 0, gradient: ["#c2410c", "#760137"], verbot: "triste" },
] as const;

type AttendanceTheme = (typeof ATTENDANCE_THEME)[number];

function attendanceThemeFor(pct: number): AttendanceTheme {
  return ATTENDANCE_THEME.find((t) => pct >= t.min) ?? ATTENDANCE_THEME[ATTENDANCE_THEME.length - 1];
}

/** Verbot expression artwork by band name. */
const VERBOT_EXPRESSIONS: Record<string, string> = {
  emocionado: verbotEmocionado.url,
  motivado: verbotMotivado.url,
  guau: verbotGuau.url,
  emoji: verbotEmoji.url,
  molesto: verbotMolesto.url,
  enojado: verbotEnojado.url,
  furioso: verbotFurioso.url,
  // No "triste" artwork uploaded yet — reuse the closest expression.
  triste: verbotFurioso.url,
};


const ATTENDANCE_SCORES: Record<string, number> = {
  completed: 100,
  delayed: 65,
  absent: 0,
  no_show: 0,
};


function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const sessions = useSyncExternalStore(
    subscribeSessions,
    getSessionsSnapshot,
    getServerSessionsSnapshot,
  );
  const performance = useSyncExternalStore(
    subscribePerformance,
    getPerformanceSnapshot,
    getServerPerformanceSnapshot,
  );
  // Real macro-skill scoring, scoped to this student (single source of
  // truth shared with Student > Performance and Teacher > Mis Alumnos).
  const macros = useComputedMacros(user?.id ?? "");
  const hydrated = useHydrated();
  const [classDetail, setClassDetail] = useState<ExtSession | null>(null);

  const [clubCardModal, setClubCardModal] = useState<Club | null>(null);

  const [plansRev, setPlansRev] = useState(0);
  useEffect(() => subscribeLessonPlans(() => setPlansRev((r) => r + 1)), []);
  // Refresh teacher profile fields (ProfilePeekCard for this student's teacher).
  useEffect(() => { hydrateTeachers(); }, []);

  // Shared "Can't Attend" flow (same real logic as Live Sessions).
  const [cantAttendFor, setCantAttendFor] = useState<ExtSession | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<ExtSession | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [coursesRev, setCoursesRev] = useState(0);
  useEffect(() => subscribeCourses(() => setCoursesRev((r) => r + 1)), []);
  useEffect(() => subscribeVipUnits(() => setCoursesRev((r) => r + 1)), []);
  useEffect(() => subscribeVipUnitCompletion(() => setCoursesRev((r) => r + 1)), []);

  if (!user) return null;

  const mySessions = sessions.filter((s) => s.student_id === user.id);
  const upcoming = mySessions
    .filter((s) => {
      const isUpcomingStatus = s.status === "scheduled" || s.status === "rescheduled" || s.status === "ready";
      if (!isUpcomingStatus) return false;
      const endsAt = +new Date(s.date_time) + s.duration_minutes * 60_000;
      return endsAt >= Date.now();
    })
    .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));

  const history = mySessions
    .filter((s) => !["scheduled", "rescheduled", "ready"].includes(s.status))
    .sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time));

  // Level Progress + Current Course — mirror Learning Path (/student/courses)
  // for GO/Enterprise/International and My Course (/student/my-course) for VIP.
  // The legacy LEVELS catalog / user.current_level are no longer used here.
  const progress = computeCurrentProgress(user.id, user.product, user.contracted_levels ?? [], coursesRev);
  const levelProgress = progress?.progressPct ?? 0;
  const currentUnitTitle = progress?.currentUnitTitle ?? null;
  const currentLevelName = progress?.levelName ?? null;

  // Product label — VIP lives outside PRODUCT_META, handle it literally.
  const productLabel = user.product === "vip"
    ? "VIP"
    : (user.product && (user.product === "enterprise" || user.product === "go" || user.product === "international")
        ? PRODUCT_META[user.product].label
        : undefined);

  // Ordinal position of current level within contracted levels ("2/3").
  const contractedLevels = user.contracted_levels ?? [];
  const currentLevelIdx = currentLevelName ? contractedLevels.indexOf(currentLevelName) : -1;
  const currentLevelRingLabel =
    currentLevelIdx >= 0 && contractedLevels.length > 0 ? (
      <>
        <AnimatedNumber value={currentLevelIdx + 1} />/{contractedLevels.length}
      </>
    ) : (
      ""
    );



  // Overall Attendance — shared helper (studentAttendance) so Admin, Teacher
  // and Student always show the exact same % for a given student.
  const { pct: attendancePct } = studentAttendance(mySessions, user);
  const attendanceTheme = attendanceThemeFor(attendancePct);
  const attendanceVerbot = VERBOT_EXPRESSIONS[attendanceTheme.verbot];

  const gradeable = history.filter((s) => s.status in ATTENDANCE_SCORES);


  // Trend: last 30 days vs the 31–60 day window. No data → no arrow.
  const attendanceTrend: "up" | "down" | null = (() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const avg = (from: number, to: number) => {
      const scores = gradeable
        .filter((s) => {
          const age = now - +new Date(s.date_time);
          return age >= from && age < to;
        })
        .map((s) => ATTENDANCE_SCORES[s.status]);
      if (scores.length === 0) return null;
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };
    const recent = avg(0, 30 * day);
    const previous = avg(30 * day, 60 * day);
    if (recent === null || previous === null) return null;
    return recent >= previous ? "up" : "down";
  })();

  const openLevels = () => {
    if (!progress) return;
    if (progress.isVip) {
      navigate({ to: "/student/my-course" });
    } else {
      navigate({ to: "/student/courses" });
    }
  };

  const openCurrentLevel = () => {
    if (!progress) return;
    if (progress.isVip) {
      navigate({ to: "/student/my-course" });
    } else {
      navigate({ to: "/student/courses", search: { levelId: progress.levelId } });
    }
  };


  // Quick Review Dock — real teacher notes (report_comments) from completed
  // sessions. No synthetic tips. Empty state kept when no session has one.
  const recentFeedback = useMemo(() => {
    return history
      .filter((s) => typeof s.report_comments === "string" && s.report_comments.trim().length > 0)
      .slice(0, 3)
      .map((s) => ({
        id: s.id,
        teacher: userById(s.teacher_id)?.name ?? "Teacher",
        date: new Date(s.date_time).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        tip: (s.report_comments ?? "").trim(),
      }));
  }, [history]);


  // Rating popup logic (untouched)
  const [ratingSession, setRatingSession] = useState<ExtSession | null>(null);
  const [handled, setHandled] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("verbo:rated-sessions");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const persistHandled = (next: Set<string>) => {
    setHandled(next);
    try { localStorage.setItem("verbo:rated-sessions", JSON.stringify([...next])); } catch { /* noop */ }
  };

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const s of upcoming) {
        if (handled.has(s.id)) continue;
        const start = +new Date(s.date_time);
        const end = start + s.duration_minutes * 60_000;
        const triggerAt = end - 10 * 60_000;
        if (now >= triggerAt && now <= end) { setRatingSession(s); return; }
      }
      setRatingSession(null);
    };
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [upcoming, handled]);

  const handleSubmit = (rating: number, note: string) => {
    if (!ratingSession) return;
    submitStudentRating(ratingSession.id, rating, note ? note : undefined);
    persistHandled(new Set(handled).add(ratingSession.id));
    setRatingSession(null);
  };

  const handleClose = () => {
    if (!ratingSession) return;
    persistHandled(new Set(handled).add(ratingSession.id));
    setRatingSession(null);
  };


  // Status badge — colors come from the shared status palette so the Dashboard
  // pill matches the calendar, workshop badges and admin tables exactly.
  const statusBadgeClass =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide capitalize";
  const statusBadgeStyle = (status: string): React.CSSProperties => {
    const key = (status === "rearranged" ? "rescheduled" : status) as ExtSessionStatus;
    const meta = CALENDAR_STATUS_META[key] ?? CALENDAR_STATUS_META.scheduled;
    return {
      backgroundColor: meta.color,
      color: key === "scheduled" ? "#01304a" : "#ffffff",
      borderColor: meta.borderColor ?? meta.color,
    };
  };


  // Dynamic welcome line — first matching condition wins.
  const welcomeLine = (() => {
    const now = Date.now();
    const soon = upcoming.find((s) => {
      const dt = +new Date(s.date_time);
      return dt >= now && dt - now <= 48 * 60 * 60 * 1000;
    });
    if (soon) {
      const t = userById(soon.teacher_id)?.name?.split(" ")[0] ?? "your teacher";
      return `Your next session with ${t} is ${fmtDay(soon.date_time)} at ${fmtTime(soon.date_time)}.`;
    }
    if (levelProgress >= 80) return "You're close to leveling up to your next stage — keep going.";
    if (attendancePct >= 90) return `Your ${attendancePct}% attendance is paying off. Keep it up.`;
    return "Every session brings you closer to fluency.";
  })();

  return (
    <div className="space-y-10">
      <header className="verbo-fade-up motion-reduce:animate-none flex flex-wrap items-center justify-between gap-4" style={{ animationDelay: "0ms" }}>
        <div className="flex items-center gap-3">
          <img
            src={verbotGif.url}
            alt="Verbo mascot"
            className="h-24 w-auto shrink-0"
          />
          <div className="pl-3">
            <div className="text-sm text-muted-foreground">Welcome back</div>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "#01304a" }}>
                {user.name.split(" ")[0]}
              </h1>
              <FeaturedBadgeStrip user={user} />
              {user.access_plan === "Elite" && <Pill tone="elite">Elite</Pill>}
              {productLabel && <Pill tone="muted">{productLabel}</Pill>}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{welcomeLine}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user.product_type === "performance" && (() => {
            const c = effectiveSessionCounts(user.id, { hired: user.hired_sessions, remaining: user.remaining_sessions });
            const grp = groupOfStudent(user.id);
            return (
              <div
                className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                title={grp ? "Shared with your group" : undefined}
              >
                {c.remaining} of {c.hired} sessions remaining
                {grp && <span className="ml-1 font-normal text-muted-foreground">· group</span>}
              </div>
            );
          })()}
          <button className="verbo-report-btn" onClick={() => setReportOpen(true)} aria-label="Report" title="Report">
            <span className="sign"><ShieldAlert className="h-4 w-4" /></span>
            <span className="text">Report</span>
          </button>
        </div>
      </header>

      {/* KPI Metrics with circular SVG progress — Level Progress is the hero */}
      {!hydrated ? (
        <SkeletonStatCards count={3} className="grid gap-4 md:grid-cols-[1fr_1.6fr_1fr]" />
      ) : (
      <section
        className="verbo-fade-up motion-reduce:animate-none grid gap-4 md:grid-cols-[1fr_1.6fr_1fr]"
        style={{ animationDelay: "60ms" }}
      >

        {/* Current Level */}
        <div
          className="relative cursor-pointer transition-transform duration-200 hover:scale-[1.01]"
          role="button"
          tabIndex={0}
          onClick={openLevels}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLevels(); }
          }}
        >
          <HeroStatCard
            className="card-gradient-navy"
            decorative={
              <div
                className="pointer-events-none absolute -right-8 -top-10 h-[140px] w-[140px] rounded-3xl"
                style={{ background: "rgba(255,255,255,0.08)", transform: "rotate(14deg)" }}
                aria-hidden
              />
            }
          >
            <div className="relative flex w-full items-center justify-between gap-4">
              <div className="pr-2">
                <div className="text-xs font-medium uppercase tracking-wider text-white/60">Current Level</div>
                <div
                  className="mt-3 text-3xl font-semibold text-white"
                  style={{ letterSpacing: "-0.02em", lineHeight: 1.05 }}
                >
                  {currentLevelName ?? "—"}
                </div>
                <div className="mt-1 text-xs text-white/60">{productLabel}</div>

              </div>
              <StatRing
                value={levelProgress}
                label={currentLevelRingLabel}
                trackColor="rgba(255,255,255,0.25)"
                progressColor="#ffffff"
                textColor="#ffffff"
              />
            </div>
          </HeroStatCard>
        </div>

        {/* Level Progress — hero */}
        <div
          className="relative cursor-pointer transition-transform duration-200 hover:scale-[1.01]"
          role="button"
          tabIndex={0}
          onClick={openCurrentLevel}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCurrentLevel(); }
          }}
        >
          <HeroStatCard
            className="card-gradient-orange"
            decorative={
              <div
                className="pointer-events-none absolute -right-8 -top-10 h-[140px] w-[140px] rounded-3xl"
                style={{ background: "rgba(1,48,74,0.06)", transform: "rotate(14deg)" }}
                aria-hidden
              />
            }
          >
            <div className="relative flex w-full items-center justify-between gap-5">
              <div className="pr-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(1,48,74,0.8)" }}>Level Progress</div>
                <div className="mt-3 flex items-baseline gap-1">
                  <AnimatedNumber
                    value={levelProgress}
                    className="text-6xl font-bold leading-[1.05] tracking-[-0.03em] text-white"
                  />

                  <span className="text-2xl font-semibold text-white/75" style={{ letterSpacing: "-0.01em" }}>%</span>
                </div>

                <div className="mt-1.5 text-xs font-semibold" style={{ color: "rgba(1,48,74,0.8)" }}>of {currentLevelName ?? "—"}</div>
              </div>
              <StatRing
                value={levelProgress}
                size={104}
                stroke={9}
                trackColor="rgba(1,48,74,0.18)"
                progressColor="#01304a"
                textColor="#01304a"
              />
            </div>
          </HeroStatCard>
        </div>

        {/* Overall Attendance — replaced by a welcome card until the student
         *  has their first counted session (0% would misrepresent a newcomer). */}
        {gradeable.length === 0 ? (
        <div className="relative">
          <HeroStatCard
            style={{
              background: "linear-gradient(135deg, #01304a 0%, #002233 100%)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
            }}
            decorative={
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]" aria-hidden>
                <img
                  src={verbotStageZero.url}
                  alt=""
                  aria-hidden
                  className="absolute -top-4 right-0 h-[150%] w-auto select-none object-contain opacity-[0.08]"
                  style={{ filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.28))" }}
                />
              </div>
            }
          >
            <div className="relative flex w-full items-start justify-between gap-4">
              <div className="pr-2">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.6)" }}>
                  Overall Attendance
                </div>
                <div
                  className="mt-3 max-w-[13ch] text-3xl font-bold leading-[1.1] tracking-[-0.02em]"
                  style={{ color: "#ffffff" }}
                >
                  Ready to get the ball rolling?
                </div>
                <div className="mt-2 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
                  starts with your first session
                </div>
              </div>
            </div>
          </HeroStatCard>
        </div>
        ) : (
        <div className="relative">
          <HeroStatCard

            style={{
              /* Soft wash of the attendance band instead of a full-bleed
               *  saturated fill: the band colour still reads, but the card
               *  stops competing with Level Progress for attention. */
              background: `linear-gradient(135deg, color-mix(in oklab, ${attendanceTheme.gradient[0]} 14%, #ffffff) 0%, color-mix(in oklab, ${attendanceTheme.gradient[1]} 26%, #ffffff) 100%)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${attendanceTheme.gradient[1]} 28%, transparent)`,
            }}
            decorative={
              /* Verbot expression for the current attendance band — zoomed and
               *  anchored top-right so the head/shoulders expression reads. */
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]" aria-hidden>
                <img
                  src={attendanceVerbot}
                  alt=""
                  aria-hidden
                  className="absolute -top-4 right-0 h-[150%] w-auto select-none object-contain"
                  style={{
                    opacity: 1,
                    filter: "drop-shadow(0 12px 20px rgba(1,48,74,0.18))",
                  }}
                />
              </div>
            }
          >
            <div className="relative flex w-full items-start justify-between gap-4">
              <div className="pr-2">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(1,48,74,0.7)" }}>Overall Attendance</div>
                <div
                  className="mt-3 flex items-baseline gap-1"
                  style={{ color: `color-mix(in oklab, ${attendanceTheme.gradient[1]} 58%, #01304a)` }}
                >
                  <AnimatedNumber
                    value={attendancePct}
                    className="text-6xl font-bold leading-[1.05] tracking-[-0.03em]"
                  />
                  <span className="text-2xl font-semibold opacity-70" style={{ letterSpacing: "-0.01em" }}>
                    %
                  </span>
                </div>

                <div className="mt-1.5 text-xs font-semibold" style={{ color: "rgba(1,48,74,0.7)" }}>last 90 days</div>
              </div>
              {attendanceTrend === "up" && <ArrowUp className="h-5 w-5 shrink-0" style={{ color: `color-mix(in oklab, ${attendanceTheme.gradient[1]} 58%, #01304a)` }} aria-label="Attendance trending up" />}
              {attendanceTrend === "down" && <ArrowDown className="h-5 w-5 shrink-0" style={{ color: `color-mix(in oklab, ${attendanceTheme.gradient[1]} 58%, #01304a)` }} aria-label="Attendance trending down" />}
            </div>

          </HeroStatCard>
        </div>
        )}


      </section>
      )}


      {/* Linguistic Asset Performance — replaces Performance Metrics + Quote of the Week */}
      <section className="verbo-fade-up motion-reduce:animate-none" style={{ animationDelay: "120ms" }}>
        <PremiumCard>
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold tracking-tight" style={{ color: "#01304a" }}>
              Linguistic Asset Performance
            </h3>
            <Link
              to="/student/performance"
              className="inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:opacity-80"
              style={{ color: "#01304a" }}
            >
              View Detailed Analytics <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {macros.map((m) => {
              const Icon = m.icon;
              const iconAsset = MACRO_ICON_ASSETS[m.key];
              const color = SKILL_COLORS[m.key] ?? "#01304a";
              const pct = m.overall === null ? 0 : m.overall;
              return (
                <div
                  key={m.key}
                  className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-white/60 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {iconAsset ? (
                      <img src={iconAsset} alt="" aria-hidden className="h-20 w-20 object-contain" />
                    ) : (
                      <Icon className="h-5 w-5" strokeWidth={2} style={{ color }} />
                    )}

                    <div className="min-w-0">
                      <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{m.key}</div>
                      <div className="text-base font-semibold tabular-nums" style={{ color: "#01304a" }}>
                        {m.overall === null ? "--" : <AnimatedNumber value={m.overall} suffix="%" />}
                      </div>
                    </div>
                  </div>
                  <div
                    className="h-[3px] w-full overflow-hidden rounded-full"
                    style={{ background: `color-mix(in oklab, ${color} 12%, transparent)` }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </PremiumCard>
      </section>

      {/* Two-column productivity layout */}
      <section className="grid gap-6 lg:grid-cols-[1.85fr_1fr]">
        {/* LEFT COLUMN ~65% */}
        <div className="verbo-fade-up motion-reduce:animate-none space-y-8" style={{ animationDelay: "180ms" }}>
          {/* Current Course */}
          <div>
            <SectionTitle>Current Course</SectionTitle>
            <PremiumCard hover className="group verbo-card-hover relative flex flex-col items-start justify-between gap-6 overflow-hidden md:flex-row md:items-center">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{ background: "radial-gradient(circle at top right, var(--orange-500), transparent 65%)" }}
                aria-hidden
              />
              <div className="relative flex items-start gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--navy-700)_14%,transparent)] bg-background shadow-[0_1px_2px_color-mix(in_oklab,var(--navy-700)_8%,transparent)] transition-transform duration-200 ease-out group-hover:scale-[1.03]"
                  style={{ color: "#01304a" }}
                  aria-hidden
                >
                  <BookOpen className="h-5 w-5" strokeWidth={1.5} />
                </div>

                <div>
                  <Pill tone="muted">{currentLevelName ?? "Learning Path"}</Pill>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight" style={{ color: "#01304a" }}>
                    {currentUnitTitle ?? "No unit available yet"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pick up exactly where you left off. Video, materials and practice activities included.
                  </p>
                </div>
              </div>
              <PrimaryButton
                className="verbo-btn-glow"
                disabled={!progress || (!progress.isVip && !progress.currentUnitId)}
                onClick={() => {
                  if (!progress) return;
                  if (progress.isVip) {
                    navigate({ to: "/student/my-course" });
                  } else if (progress.levelId && progress.currentUnitId) {
                    navigate({
                      to: "/student/courses",
                      search: { levelId: progress.levelId, unitId: progress.currentUnitId },
                    });
                  }
                }}
              >
                Continue unit <ArrowRight className="h-4 w-4" />
              </PrimaryButton>
            </PremiumCard>
          </div>



          {/* Upcoming Sessions — week strip + selected day session */}
          {(() => {
            const today = new Date();
            const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const week = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(weekStart);
              d.setDate(weekStart.getDate() + i);
              return d;
            });
            const sessionsForDay = (d: Date) =>
              upcoming
                .filter((s) => dayKey(s.date_time) === dayKeyOf(d))
                .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));
            const visibleClubs = loadClubs().filter(
              (c) => (c.type === "insight" || c.type === "book") && c.status !== "cancelled",
            );
            const clubsForDay = (d: Date) =>
              visibleClubs
                .filter((c) => dayKey(c.date) === dayKeyOf(d))
                .sort((a, b) => +new Date(a.date) - +new Date(b.date));
            const sessionForDay = (d: Date) => sessionsForDay(d)[0];
            const clubForDay = (d: Date) => clubsForDay(d)[0];
            const CLASS_COLOR = "#cb6ce6";
            const CLUB_COLOR = "#ffc802";
            const SPOTLIGHT_COLOR = "#b2ece3";
            const isImminentSession = (s: ExtSession) => {
              const ms = +new Date(s.date_time) - Date.now();
              return ms > 0 && ms <= 60 * 60 * 1000;
            };
            const defaultDay = week.find((d) => sessionForDay(d)) ?? today;
            const activeDay = selectedDay ?? dayKeyOf(defaultDay);
            const active = week.find((d) => dayKeyOf(d) === activeDay);
            type DayEvent =
              | { kind: "session"; start: number; session: ExtSession }
              | { kind: "club"; start: number; club: ReturnType<typeof loadClubs>[number] };
            const dayEvents: DayEvent[] = active
              ? [
                  ...sessionsForDay(active).map((s) => ({
                    kind: "session" as const,
                    start: +new Date(s.date_time),
                    session: s,
                  })),
                  ...clubsForDay(active).map((c) => ({
                    kind: "club" as const,
                    start: +new Date(c.date),
                    club: c,
                  })),
                ].sort((a, b) => a.start - b.start)
              : [];



            return (
              <div>
                <SectionTitle>Upcoming Sessions</SectionTitle>
                <PremiumCard>
                <div className="grid grid-cols-7 gap-2">

                  {week.map((d) => {
                    const key = dayKeyOf(d);
                    const ds = sessionForDay(d);
                    const dc = clubForDay(d);
                    const isActive = key === activeDay;
                    const tokens: string[] = [];
                    if (ds) tokens.push(ds.origin === "spotlight" ? SPOTLIGHT_COLOR : CLASS_COLOR);
                    if (dc) tokens.push(CLUB_COLOR);
                    const multi = `linear-gradient(135deg, ${tokens.join(", ")})`;
                    const cellBg = tokens.length === 0
                      ? undefined
                      : tokens.length === 1
                        ? `color-mix(in srgb, ${tokens[0]} 18%, white)`
                        : `linear-gradient(135deg, ${tokens.map((t) => `color-mix(in srgb, ${t} 22%, white)`).join(", ")})`;
                    const dotBg = tokens.length === 0
                      ? "transparent"
                      : tokens.length === 1
                        ? tokens[0]
                        : multi;
                    const dsImminent = !!ds && isImminentSession(ds);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDay(key)}
                        className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 transition-transform duration-200 active:scale-[0.97] ${
                          isActive
                            ? "shadow-card text-white"
                            : "border border-border bg-white text-foreground hover:-translate-y-0.5"
                        }`}
                        style={
                          isActive
                            ? { backgroundColor: "var(--calendar-accent)" }
                            : cellBg
                              ? { background: cellBg }
                              : undefined
                        }

                      >
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isActive ? "text-white/70" : "text-muted-foreground"}`}>
                          {d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                        </span>
                        <span className="text-lg font-bold leading-none">{d.getDate()}</span>
                        <span
                          className={`verbo-status-dot ${dsImminent ? "verbo-live-pulse" : ""}`}
                          style={{ background: dsImminent ? "var(--green-500)" : dotBg }}
                          aria-hidden
                        />
                      </button>
                    );
                  })}

                </div>

                <div className="mt-6">
                  {dayEvents.length === 0 ? (
                    <div className="max-w-xl mx-auto w-full rounded-2xl border border-[var(--navy-100)] bg-[var(--navy-50)] p-6 text-sm text-muted-foreground">
                      No upcoming sessions scheduled.
                    </div>
                  ) : (
                    <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
                      {dayEvents.map((ev) => {
                        if (ev.kind === "session") {
                          const s = ev.session;
                          const teacher = userById(s.teacher_id);
                          const plan = getLessonPlan(s.id);
                          const imminent = isImminentSession(s);
                          const stripeColor =
                            s.origin === "spotlight"
                              ? EVENT_KIND_META.spotlight.color
                              : EVENT_KIND_META.class.color;
                          return (
                            <div
                              key={`s-${s.id}`}
                              className="relative w-full overflow-hidden rounded-2xl border border-[var(--navy-200)]/40 bg-[var(--navy-50)] shadow-elevated verbo-card-hover"
                            >
                              <div className="absolute inset-x-0 top-0 z-10 h-px" style={{ background: stripeColor }} />
                              <img
                                src={teamsLogo.url}
                                alt=""
                                aria-hidden
                                className="pointer-events-none absolute -right-3 top-1/2 z-0 h-[155%] w-auto -translate-y-1/2 select-none object-contain opacity-[0.05]"
                              />
                              <div className="relative z-10 p-3">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                    <div className="relative">
                                     <TeacherAvatar userId={teacher?.id} name={teacher?.name} />

                                      {imminent && (
                                        <span
                                          className="verbo-status-dot verbo-live-pulse absolute -right-0.5 -top-0.5"
                                          style={{ background: "var(--green-500)" }}
                                          aria-label="Starts within the next hour"
                                        />
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Teacher</div>
                                      <div className="text-sm font-semibold" style={{ color: "#01304a" }}>{teacher?.name ?? "—"}</div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    title="Session Details"
                                    aria-label="Session Details"
                                    onClick={() => setClassDetail(s)}
                                    className="group flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-primary/10 active:scale-[0.97]"
                                  >
                                    <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" style={{ color: "#01304a" }} />
                                  </button>
                                </div>

                                <div className="mt-3">
                                  <div className="text-base font-bold tracking-tight" style={{ color: "#01304a" }}>
                                    {plan?.title || "Live English Session"}
                                  </div>
                                  <div className="mt-0.5 text-sm text-muted-foreground">
                                    {currentUnitTitle ?? "—"}
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <img src={teamsLogo.url} alt="Microsoft Teams" className="h-5 w-5 shrink-0 object-contain" />
                                    <span>Microsoft Teams Meeting · {fmt(s.date_time)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      title="Can't attend"
                                      aria-label="Can't attend"
                                      onClick={() => setCantAttendFor(s)}
                                      className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-soft transition-opacity hover:opacity-90 active:scale-[0.97]"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Connect"
                                      aria-label="Connect"
                                      onClick={() => window.open(s.teams_link, "_blank")}
                                      className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-success-foreground shadow-soft transition-opacity hover:opacity-90 active:scale-[0.97]"
                                    >
                                      <Video className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const club = ev.club;
                        const clubHost = club.teacher_id ? userById(club.teacher_id)?.name : undefined;
                        const clubBooked = isBooked(user.id, club.id);
                        const start = +new Date(club.date);
                        const now = Date.now();
                        const clubConnectOpen =
                          now >= start - 5 * 60 * 1000 && now <= start + club.duration_minutes * 60 * 1000;
                        const stripeColor =
                          club.type === "book" ? EVENT_KIND_META.book_club.color : EVENT_KIND_META.insight.color;
                          return (
                            <div
                              key={`c-${club.id}`}
                              className="relative w-full overflow-hidden rounded-2xl border border-[var(--navy-200)]/40 bg-[var(--navy-50)] shadow-elevated verbo-card-hover"
                            >
                              <div className="absolute inset-x-0 top-0 z-10 h-px" style={{ background: stripeColor }} />
                              <img
                                src={teamsLogo.url}
                                alt=""
                                aria-hidden
                                className="pointer-events-none absolute -right-3 top-1/2 z-0 h-[155%] w-auto -translate-y-1/2 select-none object-contain opacity-[0.05]"
                              />
                              <div className="relative z-10 p-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <TeacherAvatar userId={club.teacher_id ?? undefined} name={clubHost ?? "Verbo Team"} />
                                  <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Host</div>
                                    <div className="text-sm font-semibold" style={{ color: "#01304a" }}>{clubHost ?? "Verbo Team"}</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  title="Session Details"
                                  aria-label="Session Details"
                                  onClick={() => setClubCardModal(club)}
                                  className="group flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-colors hover:bg-primary/10 active:scale-[0.97]"
                                >
                                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" style={{ color: "#01304a" }} />
                                </button>
                              </div>

                              <div className="mt-3">
                                <div className="text-base font-bold tracking-tight" style={{ color: "#01304a" }}>
                                  {club.title}
                                </div>
                                <div className="mt-0.5 text-sm text-muted-foreground">
                                  {club.type === "book" ? "Book Club" : "Verbo Insight"}
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <img src={teamsLogo.url} alt="Microsoft Teams" className="h-5 w-5 shrink-0 object-contain" />
                                  <span>Microsoft Teams Meeting · {fmt(club.date)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {clubBooked ? (
                                    <button
                                      type="button"
                                      title={clubConnectOpen ? "Connect" : "Activates 5 minutes before the club starts."}
                                      aria-label="Connect"
                                      disabled={!clubConnectOpen}
                                      onClick={() => { if (clubConnectOpen && club.link) window.open(club.link, "_blank"); }}
                                      className={`flex h-8 w-8 items-center justify-center rounded-full shadow-soft transition-opacity active:scale-[0.97] ${
                                        clubConnectOpen
                                          ? "bg-success text-success-foreground hover:opacity-90"
                                          : "cursor-not-allowed bg-secondary text-muted-foreground"
                                      }`}
                                    >
                                      <Video className="h-4 w-4" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setClubCardModal(club)}
                                      className="inline-flex items-center gap-1.5 rounded-full bg-[#01304a] px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition-opacity hover:opacity-90 active:scale-[0.97]"
                                    >
                                      Reserve seat <ArrowRight className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>

                </PremiumCard>
              </div>

            );
          })()}

        </div>

        {/* RIGHT SIDEBAR ~35% */}
        <aside className="verbo-fade-up motion-reduce:animate-none space-y-6" style={{ animationDelay: "240ms" }}>
          {/* Verbo Experiences */}
          <PremiumCard hover className="group card-gradient-violet relative overflow-visible">
            <img
              src={experiencesClubs.url}
              alt="Two students laughing together during a live conversation club"
              className="shadow-elevated pointer-events-none absolute right-2 top-[-28%] w-[48%] -rotate-6 rounded-2xl object-cover"
            />
            <div className="relative">

              <div className="flex items-center gap-2">
                <div
                  className="verbo-float flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white transition-transform duration-300 group-hover:scale-110"
                >
                  <Users className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold tracking-tight text-white">
                  Verbo Experiences
                </h3>
              </div>
              <p className="mt-3 max-w-[52%] text-xs leading-relaxed text-white/80">
                Join today's live conversation clubs and immerse yourself with peers across the network.
              </p>
              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2.5 text-sm font-semibold transition-transform duration-200 active:scale-[0.97]"
                style={{ color: "var(--violet-900)" }}
                onClick={() => navigate({ to: "/student/sessions", search: { focus: "clubs" } })}
              >
                <Sparkles className="h-3.5 w-3.5" /> View Active Clubs
              </button>
            </div>
          </PremiumCard>


          {/* Quick Review Dock */}
          <PremiumCard hover>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight" style={{ color: "#01304a" }}>
                Quick Review Dock
              </h3>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Latest</span>
            </div>
            {recentFeedback.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Notes from your teacher will show up here after your next session.
              </p>
            ) : (
              <ul className="space-y-3">
                {recentFeedback.map((f) => (
                  <li
                    key={f.id}
                    className="flex gap-3 rounded-lg border border-border/70 bg-white/70 p-3 transition-colors duration-200 hover:bg-secondary/60"
                  >
                    <div
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ backgroundColor: "#01304a" }}
                      aria-hidden
                    >
                      {(f.teacher ?? "?").trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span className="truncate">{f.teacher}</span>
                        <span className="shrink-0 pl-2">{f.date}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-foreground">{f.tip}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PremiumCard>
        </aside>
      </section>

      {/* History */}
      <section className="verbo-fade-up motion-reduce:animate-none" style={{ animationDelay: "300ms" }}>
        <SectionTitle>Session History</SectionTitle>
        <PremiumCard className="verbo-card-hover">
          <div className="hidden md:grid md:grid-cols-[1fr_1fr_110px_140px] gap-4 px-4 pb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div>Date</div>
            <div>Teacher</div>
            <div>Status</div>
            <div>Rating</div>
          </div>
          <div className="divide-y divide-border">
            {history.map((s) => {
              const teacher = userById(s.teacher_id);
              const teacherName = teacher?.name ?? "Teacher";
              
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setClassDetail(s)}
                  className="grid w-full grid-cols-1 items-center gap-4 rounded-xl px-4 py-4 text-left transition-all duration-150 ease-out hover:bg-secondary/40 active:scale-[0.97] md:grid-cols-[1fr_1fr_110px_140px]"
                >
                  <div className="truncate text-sm text-foreground">{fmt(s.date_time)}</div>
                  <div className="flex min-w-0 items-center gap-3">
                    <TeacherAvatar userId={teacher?.id} name={teacherName} className="h-10 w-10" />

                    <div className="truncate text-sm font-semibold" style={{ color: "#01304a" }}>{teacherName}</div>
                  </div>
                  <div className="md:justify-self-start">
                    <span className={statusBadgeClass} style={statusBadgeStyle(s.status)}>{s.status}</span>
                  </div>
                  <div className="md:justify-self-start">
                    {s.student_rating ? <RatingStarsCompact value={s.student_rating} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </button>

              );
            })}
          </div>
        </PremiumCard>
      </section>



      {ratingSession && (
        <RatingModal
          session={ratingSession as any}
          onSubmit={(rating, note) => handleSubmit(rating, note)}
          onClose={handleClose}
        />
      )}

      <ReportConductModal
        studentId={user.id}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      {/* Cancellation flow — shared with Live Sessions (real policy, quota
          and group handling live in CancelSessionFlow). */}
      {cantAttendFor && user && (
        <CantAttendRouter
          session={cantAttendFor}
          user={user}
          onClose={() => setCantAttendFor(null)}
          onReschedule={() => {
            const s = cantAttendFor;
            setCantAttendFor(null);
            setRescheduleFor(s);
          }}
        />
      )}
      {rescheduleFor && (
        <RescheduleRequestModal
          session={rescheduleFor}
          onClose={() => setRescheduleFor(null)}
        />
      )}


      {clubCardModal && (
        <ClubReservationModal
          club={clubCardModal}
          studentId={user.id}
          onClose={() => setClubCardModal(null)}
        />
      )}

      {/* Class Details Modal — unified view (replaces the old standalone
          "Session Performance Breakdown" popup and the row-level icons). */}
      {classDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4" onClick={() => setClassDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-hidden overflow-y-auto rounded-2xl bg-card shadow-floating">
          {(() => {

            const s = classDetail;
            const teacher = userById(s.teacher_id);
            const plan: LessonPlan | undefined = getLessonPlan(s.id);
            void plansRev; // re-render on lesson plan updates
            const rating = performance[s.id];
            const isAbsent = s.status === "absent";
            const cause = s.absent_cause;
            const absentMsg = cause === "student"
              ? "You marked yourself unavailable"
              : cause === "teacher"
              ? "Your teacher canceled this session"
              : null;
            // Resolve real curriculum topic when the plan links a unit.
            let topic: { levelName: string; unitTitle: string } | null = null;
            if (plan) {
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
            const hasRealPdf = !!s.report_pdf_url && s.report_pdf_url !== "/mock-report.pdf";
            const isUpcoming = s.status === "scheduled" || s.status === "rescheduled" || s.status === "ready";
            const d = new Date(s.date_time);
            // Single source of truth for the modal's colors: same palette as the
            // calendar pill for this session's real status.
            const theme = calendarEventTheme({
              kind: "class",
              status: s.status,
              sub_status: s.attendance_sub_status,
            } as any);
            const StatusIcon =
              s.status === "completed"
                ? CheckCircle2
                : s.status === "absent" || s.status === "no_show"
                ? XCircle
                : CalendarClock;
            const statusPill = (
              <span className={statusBadgeClass} style={statusBadgeStyle(s.status)}>{s.status}</span>
            );
            const headerBlock = (
              <div className="space-y-2">
                <InfoStatRow
                  items={[
                    {
                      icon: CalendarClock,
                      value: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
                      label: "Date",
                      tint: theme.solid,
                    },
                    {
                      icon: Clock,
                      value: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      label: "Time",
                      tint: theme.solid,
                    },
                    { icon: StatusIcon, value: statusPill, label: "Status", tint: theme.solid },
                  ]}
                />
                <div className="text-xs text-muted-foreground">with {teacher?.name ?? "Teacher"}</div>
                {isAbsent && absentMsg && (
                  <div className="text-xs text-muted-foreground">{absentMsg}.</div>
                )}
              </div>
            );


            if (isUpcoming) {
              return (
                <>
                  <AccentModalHeader
                    background={theme.background}
                    iconTint={theme.solid}
                    textTone={theme.textTone}
                    icon={CalendarClock}
                    eyebrow="UPCOMING SESSION"
                    title="Session Details"
                    watermark={{ type: "icon", icon: CalendarClock }}
                    onClose={() => setClassDetail(null)}
                  />
                  <div className="space-y-4 px-6 py-5">
                    <div className="vc-rise" style={{ animationDelay: "0.25s" }}>{headerBlock}</div>
                    <section className="vc-rise" style={{ animationDelay: "0.3s" }}>

                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        What we'll cover
                      </h4>
                      {plan ? (
                        <div className="mt-2 space-y-1 text-sm text-foreground">
                          <div><span className="text-muted-foreground">Type:</span> {plan.type}</div>
                          <div><span className="text-muted-foreground">Title:</span> {plan.title}</div>
                          {topic && (
                            <div className="text-muted-foreground">
                              {topic.levelName} — {topic.unitTitle}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Your teacher hasn't set today's topic yet.
                        </p>
                      )}
                    </section>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-secondary/30 px-6 py-4">
                    <GhostButton
                      onClick={() => { setClassDetail(null); setCantAttendFor(s); }}
                    >
                      <X className="h-3.5 w-3.5" /> Can't attend
                    </GhostButton>
                    <PrimaryButton
                      className="verbo-btn-glow"
                      style={{ backgroundColor: theme.solid, color: "#fff", boxShadow: `0 8px 20px -6px ${theme.solid}` }}
                      onClick={() => s.teams_link && window.open(s.teams_link, "_blank")}
                    >
                      <Video className="h-3.5 w-3.5" /> Connect
                    </PrimaryButton>
                  </div>
                </>
              );
            }
            return (
              <>
                <AccentModalHeader
                  background={theme.background}
                  iconTint={theme.solid}
                  textTone={theme.textTone}
                  icon={StatusIcon}
                  eyebrow={`${(CALENDAR_STATUS_META[s.status as keyof typeof CALENDAR_STATUS_META]?.label ?? "").toUpperCase()} SESSION`.trim() || "SESSION"}
                  title="Session Details"
                  watermark={{ type: "icon", icon: StatusIcon }}
                  onClose={() => setClassDetail(null)}
                />
                <div className="space-y-4 px-6 py-5">
                  <div className="vc-rise" style={{ animationDelay: "0.25s" }}>{headerBlock}</div>

                  {/* What we covered */}
                  <section className="vc-rise" style={{ animationDelay: "0.3s" }}>

                    <SectionHeadIcon
                      icon={<BookOpen className="h-4 w-4" style={{ color: "#01304a" }} />}
                      label="What we covered"
                    />
                    {plan ? (
                      <div className="mt-2 space-y-1 text-sm text-foreground">
                        <div><span className="text-muted-foreground">Type:</span> {plan.type}</div>
                        <div><span className="text-muted-foreground">Title:</span> {plan.title}</div>
                        {topic && (
                          <div className="text-muted-foreground">
                            {topic.levelName} — {topic.unitTitle}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No lesson plan was recorded for this session.
                      </p>
                    )}
                  </section>

                  {/* Teacher's notes */}
                  <section className="vc-rise" style={{ animationDelay: "0.35s" }}>

                    <SectionHeadIcon
                      icon={<NotebookPen className="h-4 w-4" style={{ color: "var(--orange-600)" }} />}
                      label="Teacher's notes"
                    />
                    {s.report_comments && s.report_comments.trim().length > 0 ? (
                      <p className="mt-2 text-sm leading-relaxed text-foreground">{s.report_comments.trim()}</p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No notes were left for this session.</p>
                    )}
                  </section>

                  {/* Your rating */}
                  <section className="vc-rise" style={{ animationDelay: "0.4s" }}>

                    <SectionHeadIcon
                      icon={<Star className="h-4 w-4" style={{ color: "var(--orange-600)" }} />}
                      label="Your rating"
                    />
                    {s.student_rating ? (
                      <div className="mt-2"><RatingStarsCompact value={s.student_rating} /></div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">You haven't rated this session.</p>
                    )}
                  </section>

                  {/* Performance breakdown */}
                  <section className="vc-rise" style={{ animationDelay: "0.45s" }}>
                    <SectionHeadIcon
                      icon={<Award className="h-4 w-4" style={{ color: "var(--violet-700)" }} />}
                      label="Performance breakdown"
                    />
                    {rating ? (
                      <div className="mt-2 space-y-3">
                        <PerfStars label="Fluency" value={rating.fluency} />
                        <PerfStars label="Vocabulary Range" value={rating.vocabulary} />
                        <PerfStars label="Confidence" value={rating.confidence} />
                        <PerfStars label="Grammar Accuracy" value={rating.grammar} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Your teacher hasn't logged a detailed performance rating for this session yet.
                      </p>
                    )}
                  </section>
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-secondary/30 px-6 py-4">
                  <GhostButton
                    disabled={!hasRealPdf}
                    title={!hasRealPdf ? "Coming soon" : undefined}
                    onClick={() => hasRealPdf && window.open(s.report_pdf_url!, "_blank")}
                  >
                    <Download className="h-3.5 w-3.5" /> Download report
                  </GhostButton>
                  <PrimaryButton
                    className="verbo-btn-glow"
                    style={{ backgroundColor: theme.solid, color: "#fff", boxShadow: `0 8px 20px -6px ${theme.solid}` }}
                    onClick={() => setClassDetail(null)}
                  >
                    Close
                  </PrimaryButton>
                </div>
              </>
            );
          })()}
          </div>
        </div>
      )}


    </div>
  );
}

function PerfStars({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={{ color: "#01304a" }}>{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          return (
            <Star
              key={n}
              className="h-4 w-4"
              style={{
                color: active ? "#f38934" : "#e5e7eb",
                fill: active ? "#f38934" : "transparent",
              }}
            />
          );
        })}
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">{value}/5</span>
      </div>
    </div>
  );
}

function RatingStarsCompact({ value }: { value: number }) {
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`Rating ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <Star
            key={n}
            className="h-3.5 w-3.5"
            style={{
              color: active ? "#f38934" : "#e5e7eb",
              fill: active ? "#f38934" : "transparent",
            }}
          />
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * FeaturedBadgeStrip — up to 3 equipped + earned badges in the dashboard
 * header: Challenge/Flash badges first (core + Lightning + Season), then
 * Profile badges to fill the remaining slots.
 * ------------------------------------------------------------------------ */
function FeaturedBadgeStrip({ user }: { user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const un1 = subscribeProfileBadges(bump);
    const un2 = subscribeEquippedBadges(bump);
    const un3 = subscribeCourses(bump);
    const un4 = subscribeEquippedChallengeBadges(bump);
    const un5 = subscribeChallengeBadges(bump);
    return () => { un1(); un2(); un3(); un4(); un5(); };
  }, []);

  type StripItem = { key: string; name: string; image?: string; icon: React.ReactNode };

  const items = useMemo(() => {
    void tick;
    const out: StripItem[] = [];

    // Challenge / Verbo Flash badges (core + Lightning + Season), equipped and earned.
    const equippedChallenge = loadEquippedChallengeBadgeIds(user.id);
    if (equippedChallenge.length > 0) {
      const done = user.completed_challenges ?? [];
      const map = new Map(loadChallenges().map((c) => [c.id, c]));
      const cats = new Set<string>();
      let premiumDone = false;
      for (const entry of done) {
        const ch = map.get(entry.challenge_id);
        if (!ch) continue;
        if (ch.category) cats.add(ch.category);
        if (ch.premium) premiumDone = true;
      }
      const ctx = {
        completedCount: done.length,
        longestStreak: user.longest_streak ?? 0,
        distinctCategories: cats.size,
        hasCompletedPremium: premiumDone,
      };
      const coreCatalog = loadChallengeBadges();
      const seasons = loadSeasons();
      for (const id of equippedChallenge) {
        if (id === "lightning") {
          if ((user.lightning_completions ?? 0) >= 1) {
            out.push({ key: "lightning", name: "Lightning Bolt", icon: <Zap className="h-5 w-5 text-white" /> });
          }
          continue;
        }
        if (id.startsWith("season-")) {
          const seasonId = id.slice("season-".length);
          const season = seasons.find((s) => s.id === seasonId);
          if (season && (user.season_completions?.[seasonId] ?? 0) >= 1) {
            out.push({ key: id, name: season.badge_name, icon: <Medal className="h-5 w-5 text-white" /> });
          }
          continue;
        }
        const hit = coreCatalog.find((b) => b.id === id);
        if (hit && (isChallengeBadgeEarned(hit, ctx) || isBadgeManuallyGranted(user.id, hit.id, "challenge"))) {
          out.push({
            key: id,
            name: hit.name,
            image: hit.image || undefined,
            icon: <Award className="h-5 w-5 text-white" />,
          });
        }
      }
    }

    // Profile badges, equipped and earned — fill remaining slots.
    if (out.length < 3) {
      const profileCatalog = loadProfileBadges();
      const profileCtx = buildProfileBadgeContext(user);
      const earnedProfile = new Set(profileCatalog.filter((b) => isBadgeEarned(b, profileCtx) || isBadgeManuallyGranted(user.id, b.id, "profile")).map((b) => b.id));
      const equippedProfile = loadEquippedBadgeIds(user.id);
      for (const id of equippedProfile) {
        if (out.length >= 3) break;
        if (!earnedProfile.has(id)) continue;
        const hit = profileCatalog.find((b) => b.id === id);
        if (hit) {
          out.push({
            key: `profile-${id}`,
            name: hit.name,
            image: hit.image || undefined,
            icon: <Award className="h-5 w-5 text-white" />,
          });
        }
      }
    }

    return out.slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tick]);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2">
      {items.map((it) => (
        <div
          key={it.key}
          title={`Equipped: ${it.name}`}
          className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full shadow-md ring-2 ring-background"
          style={{ background: "linear-gradient(135deg, #01304a, #0a4a6e)" }}
        >
          {it.image ? <img src={it.image} alt={it.name} className="h-full w-full object-cover" /> : it.icon}
        </div>
      ))}
    </div>
  );
}

