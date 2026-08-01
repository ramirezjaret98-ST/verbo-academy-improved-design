import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { USERS, SESSIONS, type User, type Session } from "@/lib/mock-data";
import { avgRating, pendingReviews } from "@/lib/teacher-model";
import {
  computeTeacherKpis, ratingBand, ratingHistory,
  getBonusThreshold, setBonusThreshold,
} from "@/lib/teacher-kpis";
import { MetricCard, SectionTitle, HeroStatCard, AnimatedNumber, AccentModal, AccentModalFooter, GhostButton } from "@/components/verbo/ui";
import { teacherTier } from "@/lib/teacher-tiers";
import { FlaggedRow } from "@/routes/admin.teachers";
import { BonusBadge } from "@/components/verbo/BonusBadge";
import { KpiOverrideModal } from "@/components/verbo/KpiOverrideModal";
import { useAuth } from "@/lib/auth";
import { getAdminType } from "@/lib/admin-roles";
import {
  useKpiOverrides, overridesForMonth, type KpiMetric,
} from "@/lib/teacher-kpi-overrides-store";
import { monthKeyOf } from "@/lib/teacher-kpi-history-store";
import {
  Star, AlertTriangle, TrendingUp, ClipboardList, SlidersHorizontal, Pencil, ShieldCheck, X,
  CalendarClock, GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/admin/kpis")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): { teacher?: string } => ({
    teacher: typeof s.teacher === "string" ? s.teacher : undefined,
  }),
});

// Persistence keys shared with the Teachers view (apply the same overrides so
// KPIs reflect edits made there).
const PROFILE_KEY = "verbo:teacher-profile-overrides";
const REGISTERED_KEY = "verbo:registered-teachers";
const REVIEW_KEY = "verbo:session-review-overrides";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

function write(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* noop */ }
}

/** Solid pill colors per teacher tier (visual only). */
const TIER_COLORS: Record<string, { bg: string; fg: string }> = {
  Rising: { bg: "#01304a", fg: "#ffffff" },
  Established: { bg: "#3ebbad", fg: "#0b2b28" },
  Distinguished: { bg: "#7e22ce", fg: "#ffffff" },
  Signature: { bg: "#d97706", fg: "#ffffff" },
};

const REVIEW_PULSE = "#dc2626";

function Page() {
  const { teacher: focusTeacher } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const adminType = getAdminType(user);
  // Only super_admin and coordinator_ops may override KPIs — coordinator_fin
  // is intentionally excluded (separation of duties from the bonus payout).
  const canOverride = adminType === "super_admin" || adminType === "coordinator_ops";
  const canOverrideStreak = adminType === "super_admin";
  const admin = user
    ? { id: user.id, name: user.name, admin_type: adminType }
    : { id: "", name: "", admin_type: null };
  const overrides = useKpiOverrides(); // subscribe so badges/values refresh
  void overrides;
  const [, forceTick] = useState(0);
  const [threshold, setThreshold] = useState(85);
  const [onlyReview, setOnlyReview] = useState(false);
  const [chartFor, setChartFor] = useState<User | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<
    { teacher: User; metric: KpiMetric; currentValue: number } | null
  >(null);
  const [reviewTarget, setReviewTarget] = useState<User | null>(null);

  const markReviewed = (sessionId: string, note: string) => {
    const s = SESSIONS.find((x) => x.id === sessionId);
    if (s) { s.review_status = "reviewed"; s.review_note = note; }
    const reviews = read<Record<string, Partial<Session>>>(REVIEW_KEY, {});
    reviews[sessionId] = { review_status: "reviewed", review_note: note };
    write(REVIEW_KEY, reviews);
    forceTick((n) => n + 1);
  };

  const discardReview = (sessionId: string, note: string) => {
    const s = SESSIONS.find((x) => x.id === sessionId);
    if (s) { s.review_status = "discarded"; s.review_note = note; }
    const reviews = read<Record<string, Partial<Session>>>(REVIEW_KEY, {});
    reviews[sessionId] = { review_status: "discarded", review_note: note };
    write(REVIEW_KEY, reviews);
    forceTick((n) => n + 1);
  };


  useEffect(() => {
    // Hydrate teacher profile overrides + registered teachers + review overrides.
    const overrides = read<Record<string, Partial<User>>>(PROFILE_KEY, {});
    USERS.forEach((u) => { if (overrides[u.id]) Object.assign(u, overrides[u.id]); });
    read<User[]>(REGISTERED_KEY, []).forEach((u) => {
      if (!USERS.find((x) => x.id === u.id)) USERS.push(u);
    });
    const reviews = read<Record<string, Partial<Session>>>(REVIEW_KEY, {});
    SESSIONS.forEach((s) => { if (reviews[s.id]) Object.assign(s, reviews[s.id]); });
    setThreshold(getBonusThreshold());
    forceTick((n) => n + 1);
  }, []);

  // Deep-link from the Admin Overview snapshot — open the rating chart.
  useEffect(() => {
    if (focusTeacher) {
      const t = USERS.find((u) => u.id === focusTeacher && u.role === "teacher");
      if (t) setChartFor(t);
      navigate({ search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTeacher]);

  const teachers = USERS.filter((u) => u.role === "teacher");


  const rows = useMemo(
    () => teachers.map((t) => ({
      t,
      kpis: computeTeacherKpis(t, threshold),
      pending: pendingReviews(t.id).length,
    })),
    [teachers, threshold],
  );

  const visibleRows = onlyReview ? rows.filter((r) => r.pending > 0) : rows;

  const overallAvg = rows.length
    ? (rows.reduce((a, r) => a + (r.kpis.rating ?? 0), 0) / rows.filter((r) => r.kpis.rating != null).length || 0).toFixed(1)
    : "—";
  const avgComposite = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.kpis.composite, 0) / rows.length)
    : 0;

  const updateThreshold = (v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)));
    setThreshold(clamped);
    setBonusThreshold(clamped);
  };

  return (
    <div className="space-y-8">
      {/* Page header + controls share one responsive row */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 lg:flex lg:flex-wrap lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground sm:text-3xl">
            KPIs
          </h1>
          <p className="mt-2 max-w-xl text-sm font-light leading-relaxed text-muted-foreground">
            Punctuality, reliability and student ratings — with a composite score driving bonus eligibility.
          </p>
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-auto">
          <label
            className={`verbo-kpi-toggle inline-flex cursor-pointer select-none items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition ${
              onlyReview
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <input
              type="checkbox"
              checked={onlyReview}
              onChange={(e) => setOnlyReview(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-input accent-[#dc2626]"
            />
            Needs review only
            {onlyReview && <span className="tabular-nums opacity-70">({visibleRows.length})</span>}
          </label>

          <div className="verbo-kpi-toggle inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Bonus threshold
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => updateThreshold(Number(e.target.value))}
              className="w-11 bg-transparent text-right text-[13px] font-semibold tabular-nums text-foreground focus:outline-none"
            />
            <span className="text-[13px] font-light text-muted-foreground">%</span>
          </div>
        </div>
      </header>

      {/* Summary strip — hairlines and accents, no solid blocks */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { label: "Avg rating", hint: "all teachers", value: `${overallAvg}★`, icon: Star, color: "#01304a" },
            { label: "Sessions tracked", hint: "lifetime", value: SESSIONS.length, icon: CalendarClock, color: "#3ebbad" },
            { label: "Teachers", hint: "active roster", value: teachers.length, icon: GraduationCap, color: "#7e22ce" },
            { label: "Avg composite", hint: "across roster", value: avgComposite, suffix: "%", icon: TrendingUp, color: "#d97706" },
          ] as { label: string; hint: string; value: number | string; icon: LucideIcon; color: string; suffix?: string }[]
        ).map((m, i) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="verbo-kpi-stat group relative flex min-w-0 items-center gap-4 overflow-hidden rounded-2xl border border-border/80 bg-card px-4 py-4"
              style={{ ["--st" as string]: m.color, ["--verbo-card-i" as string]: i } as React.CSSProperties}
            >
              <span className="verbo-kpi-stat__rail" aria-hidden />
              <span className="verbo-kpi-stat__chip grid h-10 w-10 shrink-0 place-items-center rounded-full">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {m.label}
                </div>
                <div className="mt-1 font-display text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
                  {typeof m.value === "number" ? <AnimatedNumber value={m.value} suffix={m.suffix} /> : m.value}
                </div>
                <div className="mt-1 truncate text-[11px] font-light text-muted-foreground/80">{m.hint}</div>
              </div>
            </div>
          );
        })}
      </div>


      <section>
        <SectionTitle>Teacher performance</SectionTitle>
        {visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-12 text-center text-sm text-muted-foreground shadow-sm">
            No teachers to show with the current filter.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleRows.map(({ t, kpis, pending }) => (
              <TeacherKpiCard
                key={t.id}
                teacher={t}
                kpis={kpis}
                pending={pending}
                canOverride={canOverride}
                canOverrideStreak={canOverrideStreak}
                onOverride={(metric, currentValue) =>
                  setOverrideTarget({ teacher: t, metric, currentValue })
                }
                onOpenChart={() => setChartFor(t)}
                onOpenReviews={() => setReviewTarget(t)}
              />
            ))}
          </div>
        )}
      </section>

      {reviewTarget && (
        <PendingReviewsModal
          teacher={reviewTarget}
          canDiscard={canOverride}
          onMarkReviewed={markReviewed}
          onDiscardReview={discardReview}
          onClose={() => setReviewTarget(null)}
        />
      )}

      {chartFor && <RatingChartModal teacher={chartFor} onClose={() => setChartFor(null)} />}
      {overrideTarget && (
        <KpiOverrideModal
          teacher={overrideTarget.teacher}
          metric={overrideTarget.metric}
          currentValue={overrideTarget.currentValue}
          admin={admin}
          onClose={() => setOverrideTarget(null)}
          onSaved={() => forceTick((n) => n + 1)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// TEACHER CARD
// ===========================================================================
function TeacherKpiCard({
  teacher: t, kpis, pending, onOpenChart, onOpenReviews, canOverride, canOverrideStreak, onOverride,
}: {
  teacher: User;
  kpis: ReturnType<typeof computeTeacherKpis>;
  pending: number;
  onOpenChart: () => void;
  onOpenReviews: () => void;
  canOverride: boolean;
  canOverrideStreak: boolean;
  onOverride: (metric: KpiMetric, currentValue: number) => void;
}) {
  const monthOverrides = overridesForMonth(t.id, monthKeyOf(new Date()));
  const displayRating = monthOverrides.ratingNormalized
    ? Math.max(0, Math.min(5, Math.round((monthOverrides.ratingNormalized.new_value / 100) * 5 * 10) / 10))
    : kpis.rating;
  const band = ratingBand(displayRating);
  const streakValue = kpis.bonusStatus.kind === "eligible"
    ? 6
    : kpis.bonusStatus.kind === "streak"
      ? kpis.bonusStatus.streak
      : 0;

  const tier = teacherTier(t);
  const tierColor = TIER_COLORS[tier.name] ?? TIER_COLORS.Rising;
  const needsReview = pending > 0;

  return (
    <div
      className={`verbo-kpi-card group relative flex flex-col overflow-hidden rounded-[22px] border border-border/80 bg-card p-5 pl-6${needsReview ? " verbo-critical-glow cursor-pointer" : ""}`}
      style={{ ["--st" as string]: tierColor.bg, ["--verbo-card-i" as string]: index } as React.CSSProperties}
      onClick={needsReview ? onOpenReviews : undefined}
      role={needsReview ? "button" : undefined}
      title={needsReview ? `${pending} session${pending === 1 ? "" : "s"} needing review` : undefined}
    >
      <span className="verbo-kpi-card__rail" aria-hidden />

      {/* Identity — name leads, tier is a quiet tinted chip */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {t.name}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] font-light text-muted-foreground">{t.email}</div>
        </div>
        <span className="verbo-kpi-card__tier shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
          {tier.name}
        </span>
      </div>

      {/* Rating + bonus */}
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onOpenChart}
          className="verbo-kpi-rating inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
          style={{ ["--rt" as string]: ratingColor(displayRating) } as React.CSSProperties}
          title="View monthly rating trend"
        >
          <Star className="h-3 w-3 fill-current" />
          <span className="tabular-nums">{displayRating != null ? displayRating.toFixed(1) : "—"}</span>
          <span className="font-light opacity-70">{band.label}</span>
          <TrendingUp className="h-3 w-3" strokeWidth={2} />
        </button>

        {canOverride && (
          <button
            onClick={() => onOverride("ratingNormalized", kpis.ratingNormalized)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Manually adjust student rating"
            aria-label="Manually adjust student rating"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {monthOverrides.ratingNormalized && <AdjustedBadge override={monthOverrides.ratingNormalized} />}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <BonusBadge status={kpis.bonusStatus} size="sm" />
          {canOverrideStreak && (
            <button
              onClick={() => onOverride("bonusStreak", streakValue)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Manually adjust bonus streak (super-admin only)"
              aria-label="Manually adjust bonus streak"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {monthOverrides.bonusStreak && <AdjustedBadge override={monthOverrides.bonusStreak} />}
        </div>
      </div>

      {/* Composite score — the headline number */}
      <div
        className="mt-4 flex items-center gap-4 rounded-2xl border border-border/60 bg-background/50 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <CompositeRing value={kpis.composite} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Composite score
            </div>
            {canOverride && (
              <button
                onClick={() => onOverride("composite", kpis.composite)}
                className="-mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Manually adjust composite score"
                aria-label="Manually adjust composite score"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums"
              style={{ color: compositeColor(kpis.composite) }}
            >
              {kpis.composite}
              <span className="text-[18px] font-light opacity-60">%</span>
            </span>
            {kpis.onboarding && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
                Onboarding
              </span>
            )}
            {monthOverrides.composite && <AdjustedBadge override={monthOverrides.composite} />}
          </div>
          <div className="mt-1.5 text-[11px] font-light leading-tight text-muted-foreground">
            avg of 5 signals{kpis.penaltyState > 0 ? ` − ${kpis.penaltyState} responsiveness penalty` : ""}
          </div>
        </div>
      </div>

      {/* Signals */}
      <div className="mt-4 border-t border-border/60 pt-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
          Signals
        </div>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          <KpiTile label="Connection punctuality" value={kpis.connectionPunctuality} metric="connectionPunctuality" canOverride={canOverride} onOverride={onOverride} override={monthOverrides.connectionPunctuality} />
          <KpiTile label="Planning punctuality" value={kpis.planningPunctuality} metric="planningPunctuality" canOverride={canOverride} onOverride={onOverride} override={monthOverrides.planningPunctuality} />
          <KpiTile label="Session completion" value={kpis.completionRate} metric="completionRate" canOverride={canOverride} onOverride={onOverride} override={monthOverrides.completionRate} />
          <KpiTile label="Cancellations / no-shows" value={kpis.cancellationScore} sub={`${Math.min(3, kpis.activeStrikes)}/3 strikes · last 6 months`} metric="cancellationScore" canOverride={canOverride} onOverride={onOverride} override={monthOverrides.cancellationScore} />
          <KpiTile label="Reschedule responsiveness" value={kpis.responsiveness} sub={kpis.penaltyState > 0 ? `−${kpis.penaltyState} cumulative penalty this month` : "No penalty this month"} metric="responsiveness" canOverride={canOverride} onOverride={onOverride} override={monthOverrides.responsiveness} />
          <KpiTile label="Teacher-caused absence" value={kpis.teacherAbsenceRate} invert />
        </div>
      </div>

      {needsReview && (
        <div className="mt-4 flex items-center gap-2 border-t border-destructive/20 pt-3 text-[11.5px] font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
          {pending} session{pending === 1 ? "" : "s"} needing review
        </div>
      )}
    </div>


  );
}

function barColor(value: number, invert: boolean) {
  const good = invert ? value <= 5 : value >= 85;
  const mid = invert ? value <= 15 : value >= 70;
  if (good) return "#5fca16";
  if (mid) return "#f59e0b";
  return "#ef4444";
}

/** Same thresholds CompositeRing paints with. */
function compositeColor(value: number) {
  return value >= 85 ? "#5fca16" : value >= 70 ? "#f59e0b" : "#ef4444";
}



function AdjustedBadge({ override }: { override: { admin_name: string; created_at: string; previous_value: number; new_value: number; justification: string } }) {
  const when = new Date(override.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-purple-700"
      title={`Manually adjusted from ${override.previous_value}% to ${override.new_value}% by ${override.admin_name} on ${when} — "${override.justification}"`}
    >
      <ShieldCheck className="h-3 w-3" /> Manually adjusted
    </span>
  );
}

function KpiTile({
  label, value, invert = false, sub, metric, canOverride, onOverride, override,
}: {
  label: string;
  value: number;
  invert?: boolean;
  sub?: string;
  metric?: KpiMetric;
  canOverride?: boolean;
  onOverride?: (metric: KpiMetric, currentValue: number) => void;
  override?: { admin_name: string; created_at: string; previous_value: number; new_value: number; justification: string };
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-2.5" style={{ boxShadow: `0 0 14px -6px ${barColor(value, invert)}66` }}>
      <div className="flex items-start justify-between gap-1.5">
        <span className="min-w-0 text-[11px] leading-tight text-muted-foreground">{label}</span>
        {metric && canOverride && onOverride && (
          <button
            onClick={() => onOverride(metric, value)}
            className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title={`Manually adjust ${label}`}
            aria-label={`Manually adjust ${label}`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold text-white"
          style={{ backgroundColor: barColor(value, invert) }}
        >
          {value}%
        </span>
        {override && <AdjustedBadge override={override} />}
      </div>
      {sub && <div className="mt-1 text-[10px] leading-tight text-muted-foreground/70">{sub}</div>}
    </div>
  );
}

function CompositeRing({ value }: { value: number }) {
  const size = 60;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = compositeColor(value);
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--secondary)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
      />
    </svg>
  );
}

// ===========================================================================
// RATING TREND MODAL
// ===========================================================================
function RatingChartModal({ teacher: t, onClose }: { teacher: User; onClose: () => void }) {
  const data = useMemo(() => ratingHistory(t), [t]);
  const monthOverrides = overridesForMonth(t.id, monthKeyOf(new Date()));
  const rawRating = avgRating(t);
  const displayRating = monthOverrides.ratingNormalized
    ? Math.max(0, Math.min(5, Math.round((monthOverrides.ratingNormalized.new_value / 100) * 5 * 10) / 10))
    : rawRating;
  const band = ratingBand(displayRating);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-floating">
        <div className="flex items-start justify-between border-b border-border px-6 py-5" style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Rating trend · last 6 months</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">{t.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-6">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                  formatter={(v: number) => [`${v}★`, "Avg rating"]}
                />
                <Line type="monotone" dataKey="rating" stroke={band.dot} strokeWidth={2.5} dot={{ r: 4, fill: band.dot }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Current average: <span className="font-semibold" style={{ color: band.fg }}>{displayRating?.toFixed(1) ?? "—"}★ · {band.label}</span>
          </p>
          {monthOverrides.ratingNormalized && (
            <p className="mt-1 text-center text-[11px] text-muted-foreground">
              Raw avg: {rawRating?.toFixed(1) ?? "—"}★ · before manual adjustment
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// PENDING REVIEWS MODAL
// ===========================================================================
function PendingReviewsModal({
  teacher, canDiscard, onMarkReviewed, onDiscardReview, onClose,
}: {
  teacher: User;
  canDiscard: boolean;
  onMarkReviewed: (id: string, note: string) => void;
  onDiscardReview: (id: string, note: string) => void;
  onClose: () => void;
}) {
  const sessions = pendingReviews(teacher.id);
  return (
    <AccentModal
      background="linear-gradient(135deg, #01304a 0%, #02466b 100%)"
      iconTint="#ffffff"
      icon={ClipboardList}
      eyebrow="Sessions needing review"
      title={teacher.name}
      watermark={{ type: "icon", icon: ClipboardList }}
      maxWidth="max-w-lg"
      onClose={onClose}
    >
      <div className="max-h-[60vh] space-y-2.5 overflow-y-auto p-4">
        {sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sessions pending review.</p>
        ) : (
          sessions.map((s) => (
            <FlaggedRow
              key={s.id}
              session={s}
              onMarkReviewed={onMarkReviewed}
              onDiscardReview={onDiscardReview}
              canDiscard={canDiscard}
            />
          ))
        )}
      </div>
      <AccentModalFooter>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </AccentModalFooter>
    </AccentModal>
  );
}
