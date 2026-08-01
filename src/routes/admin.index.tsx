import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { USERS, SESSIONS, type User, type Session } from "@/lib/mock-data";
import { Card, PrimaryButton, GhostButton, AnimatedNumber, AccentModal } from "@/components/verbo/ui";
import { SkeletonStatCards, useHydrated } from "@/components/verbo/skeletons";

import { hydrateStudents } from "@/lib/students-store";
import { nextPaymentDate, daysUntil, MAX_INSIGHT_STRIKES, getProduct } from "@/lib/student-model";
import { computeTeacherKpis } from "@/lib/teacher-kpis";
import { pendingReviews } from "@/lib/teacher-model";
import { monthlySnapshot } from "@/lib/teacher-kpi-history-store";
import { loadClubs, subscribeClubs, upcomingCreatedClubs, loadReleaseRequests } from "@/lib/clubs-store";
import { loadSessions } from "@/lib/sessions-store";
import { activeStrikeCount } from "@/lib/strikes-store";
import { loadConductReports } from "@/lib/conduct-reports-store";
import { loadContentIssueReports } from "@/lib/content-issue-reports-store";
import { listChangeRequests } from "@/lib/availability-store";
import { loadFinancialIssues } from "@/lib/financial-issues-store";
import {
  useAnnouncements, activeAnnouncements, publishAnnouncement, endAnnouncement,
  ANNOUNCEMENT_MAX, type Audience,
} from "@/lib/announcements-store";
import {
  UserPlus, CalendarPlus, Sparkles, BarChart3, X, CreditCard, Lock,
  Star, TrendingDown, Users2, Megaphone, ChevronRight, CheckCircle2,
  GraduationCap, CalendarClock, Layers, TrendingUp, AlertTriangle, Eye,
  UserX, Bug, ShieldAlert, Wallet, CalendarCheck, Flag, Snowflake,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/admin/")({ component: Overview });

// Composite-score early-warning threshold (distinct from the 85% bonus gate).
const ALERT_COMPOSITE = 70;

// Identity palette (already used across the app) + urgency window.
const CRIMSON = "#b52904";
const CRIMSON_BG = "linear-gradient(150deg, #c2410c 0%, #b52904 55%, #760137 100%)";
const AMBER_BG = "linear-gradient(150deg, #f59e0b 0%, #d97706 55%, #b45309 100%)";
const RED = "#dc2626";
const GOLD = "#d97706";
const TEAL = "#3ebbad";
const ORCHID = "#a34ac0";
const NAVY_DEEP = "#01304a";
const EIGHT_H = 8 * 60 * 60 * 1000;

/** Same time-intensity ladder Session Report uses on the Teacher Dashboard. */
function timeAccent(ms: number): { color: string; glow: boolean } {
  const hours = ms / 3_600_000;
  if (hours < 1) return { color: RED, glow: true };
  if (hours < 4) return { color: RED, glow: false };
  return { color: GOLD, glow: false };
}

function countdownLabel(ms: number): string {
  if (ms < 0) return "Overdue";
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m left`;
  if (hours < 48) return `${Math.round(hours)}h left`;
  return `${Math.round(hours / 24)}d left`;
}

// Persistence keys — hydrate teacher overrides the same way KPIs/Teachers do.
const T_PROFILE_KEY = "verbo:teacher-profile-overrides";
const T_REGISTERED_KEY = "verbo:registered-teachers";
const T_REVIEW_KEY = "verbo:session-review-overrides";
function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

function computeNextPayment(u: User): Date | null {
  if (u.next_payment) return new Date(u.next_payment);
  if (!u.payment_day) return null;
  return nextPaymentDate(u.payment_day, new Date(u.cycle_start || Date.now()));
}

function Overview() {
  const navigate = useNavigate();
  const hydrated = useHydrated();
  const [, forceTick] = useState(0);

  const [metricsOpen, setMetricsOpen] = useState(false);
  const [panel, setPanel] = useState<null | "urgent" | "watch">(null);

  useEffect(() => {
    // Hydrate the SAME overrides the Students/Teachers/KPIs pages use so the
    // snapshots read identical data (no duplicate source of truth).
    hydrateStudents();
    const overrides = readLS<Record<string, Partial<User>>>(T_PROFILE_KEY, {});
    USERS.forEach((u) => { if (overrides[u.id]) Object.assign(u, overrides[u.id]); });
    readLS<User[]>(T_REGISTERED_KEY, []).forEach((u) => {
      if (!USERS.find((x) => x.id === u.id)) USERS.push(u);
    });
    const reviews = readLS<Record<string, Partial<Session>>>(T_REVIEW_KEY, {});
    SESSIONS.forEach((s) => { if (reviews[s.id]) Object.assign(s, reviews[s.id]); });
    forceTick((n) => n + 1);
    const unsub = subscribeClubs(() => forceTick((n) => n + 1));
    return unsub;
  }, []);

  const students = USERS.filter((u) => u.role === "student");
  const teachers = USERS.filter((u) => u.role === "teacher");
  const scheduled = SESSIONS.filter((s) => s.status === "scheduled").length;

  const teacherRows = useMemo(
    () => teachers.map((t) => ({ t, kpis: computeTeacherKpis(t), pending: pendingReviews(t.id).length })),
    [teachers],
  );
  const avgComposite = teacherRows.length
    ? Math.round(teacherRows.reduce((a, r) => a + r.kpis.composite, 0) / teacherRows.length)
    : 0;

  // ---- Students snapshot ----------------------------------------------------
  const paymentAlerts = students
    .map((s) => ({ s, next: computeNextPayment(s) }))
    .filter((x) => x.next && daysUntil(x.next) <= 3)
    .sort((a, b) => (a.next && b.next ? daysUntil(a.next) - daysUntil(b.next) : 0));

  const blockedInsights = students.filter((s) => (s.insights_strikes ?? 0) >= MAX_INSIGHT_STRIKES);

  // ---- Teachers snapshot ----------------------------------------------------
  const needsReview = teacherRows.filter((r) => r.pending > 0);
  const lowComposite = teacherRows
    .filter((r) => r.kpis.composite < ALERT_COMPOSITE)
    .sort((a, b) => a.kpis.composite - b.kpis.composite);
  

  // ---- Urgency derivation (visual grouping only, no new persisted data) -----
  const now = Date.now();
  const nameOf = (id?: string) => USERS.find((u) => u.id === id)?.name ?? "Unknown";
  const urgentItems: UrgencyItem[] = [];
  const watchItems: UrgencyItem[] = [];

  // 1 — Sessions needing a substitute (split by the 8h window).
  for (const s of loadSessions().filter((x) => x.needs_substitute)) {
    const ms = +new Date(s.date_time) - now;
    const base = {
      id: `sub:${s.id}`,
      icon: UserX,
      title: `Substitute needed — ${nameOf(s.student_id)}`,
      meta: new Date(s.date_time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      badge: countdownLabel(ms),
      ctaLabel: "Sessions",
      onClick: () => navigate({ to: "/admin/sessions" }),
    };
    if (ms <= EIGHT_H) {
      const t = timeAccent(ms);
      urgentItems.push({ ...base, accent: t.color, glow: t.glow });
    } else {
      watchItems.push({ ...base, accent: NAVY_DEEP });
    }
  }

  // 2 — Clubs at risk: no teacher assigned (upcomingCreatedClubs) or a pending
  //     release request from the assigned teacher.
  const releaseClubIds = new Set(loadReleaseRequests().map((r) => r.club_id));
  const allClubs = loadClubs();
  const atRiskClubs = [
    ...upcomingCreatedClubs(allClubs),
    ...allClubs.filter(
      (c) => c.teacher_id && releaseClubIds.has(c.id) && c.status !== "completed" && c.status !== "cancelled",
    ),
  ];
  for (const c of atRiskClubs) {
    const ms = +new Date(c.date) - now;
    const base = {
      id: `club:${c.id}`,
      icon: Users2,
      title: c.title,
      meta: `${!c.teacher_id ? "No teacher assigned" : "Release requested"} · ${new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      badge: countdownLabel(ms),
      ctaLabel: "Clubs",
      onClick: () => navigate({ to: "/admin/clubs" }),
    };
    if (ms <= EIGHT_H) {
      const t = timeAccent(ms);
      urgentItems.push({ ...base, accent: t.color, glow: t.glow });
    } else {
      watchItems.push({ ...base, accent: NAVY_DEEP });
    }
  }

  // 3 — Teachers auto-frozen by 3 active strikes.
  for (const t of teachers) {
    if (activeStrikeCount(t.id) < 3) continue;
    urgentItems.push({
      id: `strikes:${t.id}`,
      icon: Snowflake,
      accent: CRIMSON,
      title: `${t.name} auto-frozen`,
      meta: "3 unjustified cancellations",
      badge: "3 strikes",
      ctaLabel: "Teachers",
      onClick: () => navigate({ to: "/admin/teachers", search: { teacher: t.id } }),
    });
  }

  // 4 — Unresolved conduct reports (teacher or student targets).
  for (const r of loadConductReports().filter((x) => x.status === "pending")) {
    urgentItems.push({
      id: `conduct:${r.id}`,
      icon: ShieldAlert,
      accent: "#b52904",
      title: `Conduct report — ${nameOf(r.target_id)}`,
      meta: `${nameOf(r.reporter_id)} · ${r.category}`,
      badge: r.target_type === "teacher" ? "Teacher" : "Student",
      ctaLabel: "Review",
      onClick: () => navigate({ to: "/admin/conduct-reports" }),
    });
  }

  // 5 — Unresolved technical / content issues.
  for (const r of loadContentIssueReports().filter((x) => x.status === "pending")) {
    urgentItems.push({
      id: `issue:${r.id}`,
      icon: Bug,
      accent: ORCHID,
      title: `${r.issueType} — ${r.entityTitle}`,
      meta: `${nameOf(r.studentId)} · ${r.entityType}`,
      badge: "Bug",
      ctaLabel: "Issues",
      onClick: () => navigate({ to: "/admin/content-issue-reports" }),
    });
  }

  // ---- Worth a Look --------------------------------------------------------
  for (const { s, next } of paymentAlerts) {
    const d = next ? daysUntil(next) : 0;
    watchItems.push({
      id: `pay:${s.id}`,
      icon: CreditCard,
      accent: d < 0 ? RED : GOLD,
      title: s.name,
      meta: `Payment ${next!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      badge: d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `In ${d}d`,
      ctaLabel: "Student",
      onClick: () => navigate({ to: "/admin/students", search: { student: s.id } }),
    });
  }
  for (const s of blockedInsights) {
    watchItems.push({
      id: `blocked:${s.id}`,
      icon: Lock,
      accent: RED,
      title: s.name,
      meta: `Insights blocked · ${s.insights_strikes ?? 0}/${MAX_INSIGHT_STRIKES} strikes`,
      badge: "Blocked",
      ctaLabel: "Student",
      onClick: () => navigate({ to: "/admin/students", search: { student: s.id } }),
    });
  }
  for (const { t, pending } of needsReview) {
    watchItems.push({
      id: `review:${t.id}`,
      icon: Star,
      accent: GOLD,
      title: t.name,
      meta: "Low ratings needing review",
      badge: `${pending} pending`,
      ctaLabel: "Teacher",
      onClick: () => navigate({ to: "/admin/teachers", search: { teacher: t.id } }),
    });
  }
  for (const { t, kpis } of lowComposite) {
    watchItems.push({
      id: `composite:${t.id}`,
      icon: TrendingDown,
      accent: GOLD,
      title: t.name,
      meta: `Composite below ${ALERT_COMPOSITE}%`,
      badge: `${kpis.composite}%`,
      ctaLabel: "KPIs",
      onClick: () => navigate({ to: "/admin/kpis", search: { teacher: t.id } }),
    });
  }
  for (const r of listChangeRequests("pending")) {
    watchItems.push({
      id: `avail:${r.id}`,
      icon: CalendarCheck,
      accent: TEAL,
      title: `${nameOf(r.teacherId)} — availability change`,
      meta: r.reason || "Pending approval",
      badge: "Pending",
      ctaLabel: "Teachers",
      onClick: () => navigate({ to: "/admin/teachers", search: { teacher: r.teacherId } }),
    });
  }
  for (const i of loadFinancialIssues()) {
    watchItems.push({
      id: `fin:${i.id}`,
      icon: Wallet,
      accent: TEAL,
      title: `${nameOf(i.teacher_id)} — financial issue`,
      meta: i.text ? i.text.slice(0, 90) : "Reported by teacher",
      badge: "Financial",
      ctaLabel: "Money Lab",
      onClick: () => navigate({ to: "/admin/financial/money-lab" }),
    });
  }
  for (const st of USERS) {
    for (const sub of st.challenge_submissions ?? []) {
      if (sub.status !== "rejected") continue;
      watchItems.push({
        id: `challenge:${st.id}:${sub.challenge_id}`,
        icon: Flag,
        accent: ORCHID,
        title: `${st.name} — challenge flagged`,
        meta: sub.challenge_id,
        badge: "Rejected",
        ctaLabel: "Challenges",
        onClick: () => navigate({ to: "/admin/challenges" }),
      });
    }
  }


  const quickActions = [
    { label: "Register Student", icon: UserPlus, color: TEAL, onClick: () => navigate({ to: "/admin/students", search: { new: true } }) },
    { label: "Register Teacher", icon: GraduationCap, color: ORCHID, onClick: () => navigate({ to: "/admin/teachers" }) },
    { label: "Schedule Sessions", icon: CalendarPlus, color: NAVY_DEEP, onClick: () => navigate({ to: "/admin/sessions" }) },
    { label: "Create Club Event", icon: Sparkles, color: GOLD, onClick: () => navigate({ to: "/admin/clubs", search: { new: true } }) },
    { label: "View Metrics", icon: BarChart3, color: "#5fca16", onClick: () => setMetricsOpen(true) },
  ] as const;

  const summaryCards = [
    { label: "Students", value: students.length, icon: Users2, color: TEAL },
    { label: "Teachers", value: teachers.length, icon: GraduationCap, color: ORCHID },
    { label: "Sessions scheduled", value: scheduled, icon: CalendarClock, color: NAVY_DEEP },
    {
      label: "Active levels",
      value: new Set(students.flatMap((s) => s.contracted_levels ?? [])).size,
      icon: Layers,
      color: GOLD,
    },
    {
      label: "Avg composite",
      value: avgComposite,
      suffix: "%",
      icon: TrendingUp,
      color: avgComposite < 60 ? RED : avgComposite < ALERT_COMPOSITE ? GOLD : "#94a3b8",
      alert: avgComposite < ALERT_COMPOSITE,
    },
  ] as const;

  return (
    <div className="space-y-10">
      {/* Header + quick actions share one calm band */}
      <header className="verbo-admin-section" style={{ "--verbo-admin-i": 0 } as React.CSSProperties}>
        <div className="flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Overview</p>
            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground">Admin</h1>
            <p className="mt-1.5 text-sm font-light text-muted-foreground">Operational snapshot across the platform.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  className="verbo-quick-action group inline-flex items-center gap-2 rounded-full border bg-card py-1.5 pl-1.5 pr-4 text-sm font-medium text-foreground"
                  style={{ "--qa": a.color } as React.CSSProperties}
                >
                  <span
                    className="verbo-quick-action__chip flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    aria-hidden
                  >
                    <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
                  </span>
                  <span className="whitespace-nowrap tracking-[-0.01em]">{a.label}</span>
                </button>
              );
            })}
          </div>

        </div>
      </header>

      {/* Priority — two equal, quiet cards; urgency reads through the accent rule */}
      <div className="verbo-admin-section grid gap-4 md:grid-cols-2" style={{ "--verbo-admin-i": 1 } as React.CSSProperties}>
        {([
          {
            key: "urgent" as const,
            eyebrow: "Action required",
            title: "Needs immediate action",
            count: urgentItems.length,
            empty: "All caught up",
            body: `${urgentItems.length} item${urgentItems.length === 1 ? "" : "s"} need immediate action`,
            icon: AlertTriangle,
            accent: CRIMSON,
          },
          {
            key: "watch" as const,
            eyebrow: "Secondary",
            title: "Worth a look",
            count: watchItems.length,
            empty: "Nothing pending review",
            body: `${watchItems.length} item${watchItems.length === 1 ? "" : "s"} to review when you can`,
            icon: Eye,
            accent: GOLD,
          },
        ]).map((c) => {
          const Icon = c.icon;
          const live = c.count > 0;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setPanel(c.key)}
              className="verbo-admin-press verbo-admin-lift group relative flex items-center gap-5 overflow-hidden rounded-2xl border border-border bg-card px-5 py-5 text-left"
            >
              <span
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: live ? c.accent : "color-mix(in oklab, var(--navy-700) 14%, transparent)" }}
                aria-hidden
              />
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: live
                    ? `color-mix(in oklab, ${c.accent} 10%, transparent)`
                    : "color-mix(in oklab, var(--navy-700) 5%, transparent)",
                  color: live ? c.accent : "#94a3b8",
                }}
                aria-hidden
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {c.eyebrow}
                </span>
                <span className="mt-1 block truncate text-base font-semibold tracking-[-0.01em] text-foreground">
                  {c.title}
                </span>
                <span className="mt-0.5 block truncate text-xs font-light text-muted-foreground">
                  {c.count === 0 ? c.empty : c.body}
                </span>
              </span>

              <span
                className="shrink-0 text-3xl font-semibold tabular-nums tracking-[-0.02em]"
                style={{ color: live ? c.accent : "#cbd5e1" }}
              >
                {c.count}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {/* Summary — one flat, scannable strip */}
      {!hydrated ? (
        <SkeletonStatCards count={5} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" />
      ) : (
        <div
          className="verbo-admin-section grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          style={{ "--verbo-admin-i": 2 } as React.CSSProperties}
        >
          {summaryCards.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="verbo-admin-lift relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {m.label}
                  </div>
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: m.color }} aria-hidden />
                </div>
                <div className="mt-4 text-4xl font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
                  <AnimatedNumber value={m.value} suffix={"suffix" in m ? m.suffix : undefined} />
                </div>
                {"alert" in m && m.alert ? (
                  <div className="mt-2 text-[11px] font-medium" style={{ color: m.color }}>
                    Below target
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}





      {/* 3 — Urgency modals */}
      {panel === "urgent" && (
        <AccentModal
          background={CRIMSON_BG}
          iconTint={CRIMSON}
          icon={AlertTriangle}
          eyebrow="Action Required"
          title="Needs Immediate Action"
          maxWidth="max-w-3xl"
          onClose={() => setPanel(null)}
        >
          <div className="max-h-[65vh] overflow-y-auto p-4">
            <UrgencyList items={urgentItems} empty="All caught up — nothing urgent right now." />
          </div>
        </AccentModal>
      )}

      {panel === "watch" && (
        <AccentModal
          background={AMBER_BG}
          iconTint="#b45309"
          icon={Eye}
          eyebrow="Secondary"
          title="Worth a Look"
          maxWidth="max-w-3xl"
          onClose={() => setPanel(null)}
        >
          <div className="max-h-[65vh] overflow-y-auto p-4">
            <UrgencyList items={watchItems} empty="Nothing pending review." />
          </div>
        </AccentModal>
      )}


      {/* 5 — Announcements */}
      <AnnouncementsSection />

      {metricsOpen && (
        <MetricsModal students={students} teacherRows={teacherRows} onClose={() => setMetricsOpen(false)} />
      )}
    </div>
  );
}

// ===========================================================================
// Urgency building blocks
// ===========================================================================
export type UrgencyItem = {
  id: string;
  icon: LucideIcon;
  accent: string;
  title: string;
  meta: string;
  badge: string;
  ctaLabel: string;
  onClick: () => void;
  /** Highest time intensity (<1h or overdue) — pulsing glow on the icon chip. */
  glow?: boolean;
};

function UrgencyRow({ item }: { item: UrgencyItem }) {
  const Icon = item.icon;
  return (
    <button
      onClick={item.onClick}
      className="group flex w-full items-stretch overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:bg-secondary/40"
    >
      <span className="w-1.5 shrink-0" style={{ background: item.accent }} aria-hidden />
      <span className="flex flex-1 items-center gap-3 py-3 pl-3 pr-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.glow ? "animate-report-glow" : ""}`}
          style={{ background: `${item.accent}1f` }}
        >
          <Icon className="h-4 w-4" style={{ color: item.accent }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${item.accent}1f`, color: item.accent }}
        >
          {item.badge}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors group-hover:bg-secondary">
          {item.ctaLabel} <ChevronRight className="h-3 w-3" />
        </span>
      </span>
    </button>
  );
}

function UrgencyList({ items, empty }: { items: UrgencyItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CheckCircle2 className="mb-2 h-8 w-8 text-success" />
        <p className="text-sm font-medium text-foreground">{empty}</p>
      </div>
    );
  }
  return <div className="space-y-2">{items.map((it) => <UrgencyRow key={it.id} item={it} />)}</div>;
}


// ===========================================================================
// 5 — Announcements section
// ===========================================================================
function AnnouncementsSection() {
  useAnnouncements(); // subscribe for live updates
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [expires, setExpires] = useState("");

  const list = activeAnnouncements();

  const publish = () => {
    if (!message.trim()) return;
    publishAnnouncement(message, audience, expires || undefined);
    setMessage("");
    setAudience("all");
    setExpires("");
  };

  const audienceLabel: Record<Audience, string> = { all: "All", students: "Students only", teachers: "Teachers only" };

  return (
    <section className="verbo-admin-section" style={{ "--verbo-admin-i": 3 } as React.CSSProperties}>
      <div className="mb-4 flex items-center gap-3 border-b border-border/70 pb-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background"
          style={{ color: "#f38934" }}
          aria-hidden
        >
          <Megaphone className="h-4 w-4" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Comms</p>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">Announcements</h2>
        </div>
        <span className="ml-auto text-xs font-light text-muted-foreground">{list.length} active</span>
      </div>
      <Card className="!p-0">

        {/* Composer */}
        <div className="space-y-4 border-b border-border p-6">
          <div>
            <textarea
              value={message}
              maxLength={ANNOUNCEMENT_MAX}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Write an announcement for your students or teachers…"
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{message.length}/{ANNOUNCEMENT_MAX}</div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Audience
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All</option>
                  <option value="students">Students only</option>
                  <option value="teachers">Teachers only</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Expiration (optional)
                <input
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
            <PrimaryButton onClick={publish} disabled={!message.trim()}>
              <Megaphone className="h-4 w-4" /> Publish Announcement
            </PrimaryButton>
          </div>
        </div>

        {/* Active list */}
        <div className="p-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active announcements ({list.length})
          </div>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No active announcements.</p>
          ) : (
            <div className="space-y-2">
              {list.map((a) => (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{a.message}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">{audienceLabel[a.audience]}</span>
                      <span>Published {new Date(a.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      <span>{a.expires_at ? `Expires ${new Date(a.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "No expiration"}</span>
                    </div>
                  </div>
                  <GhostButton className="!px-3 !py-1.5 text-xs" onClick={() => endAnnouncement(a.id)}>
                    <X className="h-3.5 w-3.5" /> End
                  </GhostButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

// ===========================================================================
// 4 — Metrics modal
// ===========================================================================
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BRAND = "#f38934";
const NAVY = "#02466b";
const PIE_COLORS = ["#02466b", "#f38934", "#22c55e", "#a855f7"];

function last12Labels(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(MONTHS[d.getMonth()]);
  }
  return out;
}

// Build the same 12-month window as labels(), but with YYYY-MM keys so we can
// bucket real events by month and reuse them across every chart.
function last12MonthKeys(): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTHS[d.getMonth()],
    });
  }
  return out;
}

function monthKeyOfISO(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function MetricsModal({ students, teacherRows, onClose }: {
  students: User[];
  teacherRows: { t: User; kpis: ReturnType<typeof computeTeacherKpis>; pending: number }[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"students" | "teachers">("students");
  const months = last12MonthKeys();
  const nowKey = months[months.length - 1].key;

  // ---- Enrollment: real new-student count per month via `member_since`. -----
  const enrollment = months.map(({ key, label }) => {
    const value = students.filter((s) => s.member_since && monthKeyOfISO(s.member_since) === key).length;
    return { month: label, value };
  });

  // ---- Dropouts: no per-student "left on" date exists in the model. Attribute
  //      every currently non-active student to the current month and leave the
  //      other months at 0. This is honest about the missing timestamp.
  const dropoutsTotal = students.filter((s) => s.status && s.status !== "active").length;
  const dropouts = months.map(({ key, label }) => ({
    month: label,
    value: key === nowKey ? dropoutsTotal : 0,
  }));

  // ---- Completions: real completed sessions per month via `date_time`. ------
  const completions = months.map(({ key, label }) => {
    const value = SESSIONS.filter(
      (s) => s.status === "completed" && monthKeyOfISO(s.date_time) === key,
    ).length;
    return { month: label, value };
  });

  // ---- Hours taught: sum duration_minutes of completed sessions / 60. ------
  const hoursTaught = months.map(({ key, label }) => {
    const mins = SESSIONS.filter(
      (s) => s.status === "completed" && monthKeyOfISO(s.date_time) === key,
    ).reduce((a, s) => a + (s.duration_minutes ?? 0), 0);
    return { month: label, value: Math.round(mins / 60) };
  });

  // ---- Active teachers: teacher_status !== "removed" AND hire_date <= EOM. -
  const activeTeachers = months.map(({ key, label }) => {
    const [y, m] = key.split("-").map(Number);
    const endOfMonth = new Date(y, m, 0, 23, 59, 59);
    const value = teacherRows.filter(({ t }) => {
      if (t.teacher_status === "removed") return false;
      if (!t.hire_date) return false;
      return new Date(t.hire_date).getTime() <= endOfMonth.getTime();
    }).length;
    return { month: label, value };
  });

  // ---- Composite trend: reuse the real per-month snapshot from the history
  //      store (has its own real-value persistence + documented fallback).
  const compositeTrend = months.map(({ key, label }) => {
    const eligible = teacherRows.filter(({ t }) => {
      if (t.teacher_status === "removed") return false;
      if (!t.hire_date) return false;
      const [y, m] = key.split("-").map(Number);
      return new Date(t.hire_date).getTime() <= new Date(y, m, 0, 23, 59, 59).getTime();
    });
    if (!eligible.length) return { month: label, value: 0 };
    const sum = eligible.reduce((a, { t }) => a + monthlySnapshot(t, key).composite, 0);
    return { month: label, value: Math.round(sum / eligible.length) };
  });

  const byProduct = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach((s) => {
      const key = s.product ?? "unknown";
      map[key] = (map[key] ?? 0) + 1;
    });
    return Object.entries(map).map(([id, value]) => ({
      name: getProduct(id as User["product"])?.name ?? "Unassigned",
      value,
    }));
  }, [students]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-card shadow-floating">
        <div className="flex items-center justify-between border-b border-border px-6 py-4" style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}>
          <div className="flex items-center gap-2 text-white">
            <BarChart3 className="h-5 w-5" />
            <h2 className="text-lg font-semibold tracking-tight">Platform metrics</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-1 border-b border-border px-6 pt-3">
          {(["students", "teachers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid gap-6 overflow-y-auto p-6 sm:grid-cols-2">
          {tab === "students" ? (
            <>
              <ChartCard title="Enrollment trend"><BarSeries data={enrollment} color={NAVY} /></ChartCard>
              <ChartCard title="Dropout trend"><LineSeries data={dropouts} color="#ef4444" /></ChartCard>
              <ChartCard title="Session completions"><BarSeries data={completions} color="#22c55e" /></ChartCard>
              <ChartCard title="Students by product">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byProduct} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} label>
                      {byProduct.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </>
          ) : (
            <>
              <ChartCard title="Active teachers trend"><LineSeries data={activeTeachers} color={NAVY} /></ChartCard>
              <ChartCard title="Avg composite score trend"><LineSeries data={compositeTrend} color={BRAND} domain={[0, 100]} /></ChartCard>
              <ChartCard title="Hours taught"><BarSeries data={hoursTaught} color="#22c55e" /></ChartCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">{title}</div>
      <div className="h-48 w-full">{children}</div>
    </div>
  );
}

function LineSeries({ data, color, domain }: { data: { month: string; value: number }[]; color: string; domain?: [number, number] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
        <YAxis domain={domain} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 2.5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarSeries({ data, color }: { data: { month: string; value: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12 }} cursor={{ fill: "var(--secondary)" }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
