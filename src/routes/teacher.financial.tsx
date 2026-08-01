import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown,
  AlertTriangle, Star, MessageCircleWarning,
  Wifi, CalendarCheck2, ClipboardCheck, Smile, CalendarX2, RefreshCcwDot,
  GraduationCap, Scale, Medal, Wallet, TrendingUp, Info,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { USERS, userById } from "@/lib/mock-data";
import { loadSessions, subscribeSessions, type ExtSession } from "@/lib/sessions-store";
import { groupById } from "@/lib/groups-store";
import {
  avgRating,
} from "@/lib/teacher-model";
import { effectiveHourlyRate, teacherTier } from "@/lib/teacher-tiers";
import {
  computeTeacherKpis, ratingBand, getBonusThreshold,
} from "@/lib/teacher-kpis";
import { addFinancialIssue } from "@/lib/financial-issues-store";
import { Card, SectionTitle, Pill, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import { BonusBadge } from "@/components/verbo/BonusBadge";
import { overridesForMonth } from "@/lib/teacher-kpi-overrides-store";
import { monthKeyOf } from "@/lib/teacher-kpi-history-store";

export const Route = createFileRoute("/teacher/financial")({
  head: () => ({
    meta: [
      { title: "My Balance — Teacher" },
      { name: "description", content: "Your monthly payment summary — sessions, adjustments and bonus." },
    ],
  }),
  component: MyBalancePage,
});

// --- helpers ----------------------------------------------------------------
function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}
function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function labelOf(d: Date) { return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function sameMonth(iso: string | undefined, mkey: string) {
  if (!iso) return false;
  const d = new Date(iso); return monthKey(d) === mkey;
}

// Derive a short "Type" label from the free-text adjustment reason.
function adjustmentType(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("spotlight")) return "Spotlight Session";
  if (r.includes("club") && r.includes("release")) return "Club Release Penalty";
  if (r.includes("bonus")) return "Bonus";
  if (r.includes("penalty")) return "Penalty";
  return "Adjustment";
}

// KPI signal shape shared with the Performance card + badges.
type KpiSignal = { key: string; label: string; value: number; sub?: string };

const KPI_GOOD = 85;
const KPI_CRITICAL = 70;

function signalTone(v: number): "good" | "mid" | "bad" {
  if (v >= KPI_GOOD) return "good";
  if (v >= KPI_CRITICAL) return "mid";
  return "bad";
}
function signalColor(v: number) {
  const t = signalTone(v);
  return t === "good" ? "#22c55e" : t === "mid" ? "#f59e0b" : "#ef4444";
}

const KPI_ICONS: Record<string, typeof Wifi> = {
  connection: Wifi,
  planning: CalendarCheck2,
  completion: ClipboardCheck,
  rating: Smile,
  cancellation: CalendarX2,
  responsiveness: RefreshCcwDot,
};

/** One dedicated hue per money bucket so each block is instantly identifiable. */
const FIN = {
  sessions: { base: "#6d28d9", soft: "rgba(109,40,217,0.10)", ring: "rgba(109,40,217,0.28)", label: "Sessions Taught" },
  adjust:   { base: "#e11d48", soft: "rgba(225,29,72,0.10)",  ring: "rgba(225,29,72,0.28)",  label: "Adjustments" },
  bonus:    { base: "#d97706", soft: "rgba(217,119,6,0.10)",  ring: "rgba(217,119,6,0.28)",  label: "Bonus" },
  total:    { base: "#0d9488", soft: "rgba(13,148,136,0.10)", ring: "rgba(13,148,136,0.28)", label: "Total Earned" },
} as const;

// --- page -------------------------------------------------------------------
function MyBalancePage() {
  const { user } = useAuth();
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [viewMonth, setViewMonth] = useState<Date>(() => firstOfMonth(new Date()));
  const [expanded, setExpanded] = useState<Record<"sessions" | "adjustments" | "bonus", boolean>>({
    sessions: false, adjustments: false, bonus: false,
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  useEffect(() => subscribeSessions(bump), []);

  // Locate the live teacher record (auth user id).
  const teacher = useMemo(() => {
    if (!user) return null;
    return USERS.find((u) => u.id === user.id && u.role === "teacher") ?? null;
  }, [user]);

  const now = new Date();
  const currentMkey = monthKey(now);
  const mkey = monthKey(viewMonth);

  const rate = teacher ? effectiveHourlyRate(teacher) : 120;
  const tier = teacher ? teacherTier(teacher) : null;

  // ----- Sessions taught (this month) -----
  type SessionRow = {
    id: string;
    date: Date;
    name: string;
    isGroup: boolean;
    type: string;
    status: string;
    amount: number;
  };
  const sessionRows: SessionRow[] = useMemo(() => {
    if (!teacher) return [];
    return loadSessions()
      .filter((s) => s.teacher_id === teacher.id && sameMonth(s.date_time, mkey))
      .map((s: ExtSession) => {
        let name = "—";
        let isGroup = false;
        let type = "Individual";
        if (s.origin === "workshop") {
          type = "Workshop";
          name = s.workshop_topic || "Focus Workshop";
        } else if (s.group_id) {
          isGroup = true;
          type = "Group";
          name = groupById(s.group_id)?.name ?? "Group";
        } else {
          name = userById(s.student_id)?.name ?? "—";
        }
        const statusLabel =
          s.status === "completed" ? "Completed"
          : s.status === "absent" ? "Absent"
          : s.status === "delayed" ? "Delayed"
          : s.status === "no_show" ? "No-show"
          : s.status.charAt(0).toUpperCase() + s.status.slice(1);
        const amount = s.status === "completed"
          ? Math.round((s.duration_minutes / 60) * rate)
          : 0;
        return {
          id: s.id, date: new Date(s.date_time), name, isGroup, type,
          status: statusLabel, amount,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [teacher, mkey, rate]);

  // Standard Pay — derived from the very same rows the card counts, so the
  // amount and the session count can never contradict each other.
  const completedRows = sessionRows.filter((r) => r.status === "Completed");
  const sessionsCount = completedRows.length;
  const stdPay = completedRows.reduce((sum, r) => sum + r.amount, 0);

  // ----- Adjustments (this month) -----
  const adjustments = (teacher?.adjustments ?? []).filter((a) => sameMonth(a.date, mkey));
  const adjustmentsTotal = adjustments.reduce((s, a) => s + a.amount, 0);

  // ----- KPIs / Bonus -----
  const threshold = getBonusThreshold();
  const kpis = teacher ? computeTeacherKpis(teacher, threshold) : null;
  const rawRating = teacher ? avgRating(teacher) : null;
  const ratingOverride = teacher ? overridesForMonth(teacher.id, monthKeyOf(new Date())).ratingNormalized : undefined;
  const rating = ratingOverride
    ? Math.max(0, Math.min(5, Math.round((ratingOverride.new_value / 100) * 5 * 10) / 10))
    : rawRating;


  // A single "Bonus" adjustment already logged this month, if any.
  const bonusAdjustment = adjustments.find((a) => /bonus/i.test(a.reason));
  const bonusAmount = bonusAdjustment?.amount ?? 0;

  const totalEarned = stdPay + adjustmentsTotal;

  // ----- KPI signals (5) -----
  const signals: KpiSignal[] = kpis ? [
    { key: "connection",   label: "Connection punctuality",   value: kpis.connectionPunctuality },
    { key: "planning",     label: "Planning punctuality",     value: kpis.planningPunctuality },
    { key: "completion",   label: "Session completion rate",  value: kpis.completionRate },
    { key: "rating",       label: "Student rating",           value: kpis.ratingNormalized },
    { key: "cancellation", label: "Cancellations / No-Shows", value: kpis.cancellationScore,
      sub: `${Math.min(3, kpis.activeStrikes)}/3 (last 6 months)` },
    { key: "responsiveness", label: "Reschedule/Substitute Responsiveness", value: kpis.responsiveness,
      sub: kpis.penaltyState > 0 ? `−${kpis.penaltyState} cumulative penalty this month` : "No penalty this month" },
  ] : [];

  const belowTarget = signals.filter((s) => s.value < KPI_GOOD);
  const anyCritical = signals.some((s) => s.value < KPI_CRITICAL);
  const warningLevel: "none" | "yellow" | "red" =
    belowTarget.length === 0 ? "none"
    : (belowTarget.length >= 2 || anyCritical) ? "red"
    : "yellow";

  const band = ratingBand(rating);

  if (!teacher) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Loading your balance…
      </div>
    );
  }

  const toggle = (k: "sessions" | "adjustments" | "bonus") =>
    setExpanded((prev) => ({ ...prev, [k]: !prev[k] }));

  const buckets = [
    {
      key: "sessions" as const,
      c: FIN.sessions,
      icon: GraduationCap,
      value: stdPay,
      sub: `${sessionsCount} completed session${sessionsCount === 1 ? "" : "s"} · $${rate}/h`,
    },
    {
      key: "adjustments" as const,
      c: FIN.adjust,
      icon: Scale,
      value: adjustmentsTotal,
      sub: `${adjustments.length} adjustment${adjustments.length === 1 ? "" : "s"} this month`,
    },
    {
      key: "bonus" as const,
      c: FIN.bonus,
      icon: Medal,
      value: bonusAmount,
      sub: `Composite ${kpis?.composite ?? 0}% · ${rating != null ? rating.toFixed(1) + "★" : "—"}`,
    },
  ];

  const shares = (() => {
    const abs = buckets.map((b) => Math.abs(b.value));
    const sum = abs.reduce((a, b) => a + b, 0) || 1;
    return buckets.map((b, i) => ({ color: b.c.base, pct: (abs[i] / sum) * 100 }));
  })();

  return (
    <div className="space-y-7">
      {/* Header + month selector */}
      <header className="verbo-td-in grid grid-cols-1 gap-4 border-b border-border pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Payments · Teacher panel
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl" style={{ letterSpacing: "-0.02em", lineHeight: 1.05 }}>
              My Balance
            </h1>
            {tier && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: FIN.total.soft, color: FIN.total.base }}
              >
                <TrendingUp className="h-3.5 w-3.5" /> {tier.name} tier · ${rate} MXN/h
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Everything you earned this period, split by source. Tap any card to open its detail.
          </p>
        </div>

        <div className="flex items-center gap-1 justify-self-start rounded-2xl border border-border bg-card p-1.5 shadow-soft lg:justify-self-end">
          <button
            type="button" aria-label="Previous month"
            onClick={() => setViewMonth((d) => addMonths(d, -1))}
            className="verbo-td-press rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          ><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-[150px] px-2 text-center text-sm font-semibold tabular-nums text-foreground">{labelOf(viewMonth)}</div>
          <button
            type="button" aria-label="Next month"
            onClick={() => setViewMonth((d) => addMonths(d, 1))}
            className="verbo-td-press rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          ><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      {/* Status badges */}
      {(kpis || warningLevel !== "none") && (
        <div className="verbo-td-in flex flex-wrap items-center gap-2" style={{ animationDelay: "40ms" }}>
          {kpis && <BonusBadge status={kpis.bonusStatus} glow={kpis.bonusEligible} />}
          {warningLevel === "yellow" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> 1 KPI Below Target
            </span>
          )}
          {warningLevel === "red" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {belowTarget.length} KPIs Below Target
            </span>
          )}
        </div>
      )}

      {/* Total hero + composition */}
      <section
        className="verbo-td-in relative overflow-hidden rounded-[28px] border p-6 sm:p-7"
        style={{ borderColor: FIN.total.ring, background: `linear-gradient(135deg, ${FIN.total.soft}, transparent 65%)` }}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                style={{ background: FIN.total.soft, color: FIN.total.base }}
              >
                <Wallet className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Total earned · {labelOf(viewMonth)}
              </span>
            </div>
            <div
              className="mt-3 text-[44px] font-bold leading-none tabular-nums sm:text-[56px]"
              style={{ color: FIN.total.base, letterSpacing: "-0.03em" }}
            >
              {money(totalEarned)}
            </div>
            <div className="mt-2 text-sm font-medium text-muted-foreground">
              {sessionsCount} session{sessionsCount === 1 ? "" : "s"} · {adjustments.length} adjustment{adjustments.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2.5 flex h-3 w-full gap-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              {shares.map((s, i) => (
                <span
                  key={i}
                  className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${s.pct}%`, background: s.color }}
                />
              ))}
            </div>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {buckets.map((b, i) => (
                <li key={b.key} className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.c.base }} />
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{b.c.label}</span>
                  <span className="ml-auto shrink-0 text-xs font-bold tabular-nums" style={{ color: b.c.base }}>
                    {Math.round(shares[i].pct)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Bucket cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {buckets.map((b, i) => {
          const open = expanded[b.key];
          const Icon = b.icon;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => toggle(b.key)}
              aria-expanded={open}
              className="verbo-td-in verbo-td-press group relative overflow-hidden rounded-3xl border bg-card p-5 text-left shadow-soft transition-[box-shadow,border-color] duration-200"
              style={{
                animationDelay: `${80 + i * 55}ms`,
                borderColor: open ? b.c.base : "var(--border)",
                boxShadow: open ? `0 12px 30px -16px ${b.c.base}` : undefined,
              }}
            >
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px]" style={{ background: b.c.base }} />
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: b.c.soft, color: b.c.base }}>
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{b.c.label}</div>
                  <div className="mt-1 text-3xl font-bold leading-none tabular-nums" style={{ color: b.c.base, letterSpacing: "-0.02em" }}>
                    {money(b.value)}
                  </div>
                </div>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out"
                  style={{ transform: open ? "rotate(180deg)" : "none" }}
                />
              </div>
              <div className="mt-3 truncate text-xs font-medium text-muted-foreground">{b.sub}</div>
            </button>
          );
        })}
      </section>

      {/* Accordion panels */}
      {expanded.sessions && (
        <PanelShell accent={FIN.sessions.base} icon={GraduationCap} title={`Sessions Taught — ${labelOf(viewMonth)}`}>
          {sessionRows.length === 0 ? (
            <EmptyRow>No sessions recorded this month.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {sessionRows.map((r, i) => (
                <li
                  key={r.id}
                  className="verbo-td-in grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 md:grid-cols-[92px_minmax(0,1.3fr)_minmax(0,0.7fr)_auto_110px]"
                  style={{ animationDelay: `${Math.min(i, 10) * 26}ms` }}
                >
                  <span className="order-2 text-xs font-medium tabular-nums text-muted-foreground md:order-none">
                    {r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="order-1 flex min-w-0 items-center gap-1.5 md:order-none">
                    {r.isGroup && (
                      <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-accent/15 px-1.5 text-[10px] font-bold text-accent">G</span>
                    )}
                    <span className="truncate text-sm font-semibold text-foreground">{r.name}</span>
                  </span>
                  <span className="order-4 text-xs font-medium text-muted-foreground md:order-none">{r.type}</span>
                  <span className="order-3 md:order-none"><StatusPill status={r.status} /></span>
                  <span
                    className="order-5 text-right text-sm font-bold tabular-nums md:order-none"
                    style={{ color: r.amount ? FIN.sessions.base : undefined }}
                  >
                    {r.amount ? money(r.amount) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelShell>
      )}

      {expanded.adjustments && (
        <PanelShell accent={FIN.adjust.base} icon={Scale} title={`Adjustments — ${labelOf(viewMonth)}`}>
          {adjustments.length === 0 ? (
            <EmptyRow>No adjustments this month.</EmptyRow>
          ) : (
            <ul className="divide-y divide-border">
              {adjustments.map((a, i) => {
                const neg = a.amount < 0;
                const tint = neg ? FIN.adjust.base : "#16a34a";
                return (
                  <li
                    key={a.id}
                    className="verbo-td-in grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-5 py-3.5 md:grid-cols-[92px_minmax(0,1fr)_minmax(0,1.4fr)_120px] md:items-center"
                    style={{ animationDelay: `${Math.min(i, 10) * 26}ms` }}
                  >
                    <span className="order-2 text-xs font-medium tabular-nums text-muted-foreground md:order-none">
                      {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="order-1 min-w-0 md:order-none">
                      <span
                        className="inline-flex max-w-full truncate rounded-md px-2 py-0.5 text-[11px] font-bold"
                        style={{ background: `${tint}1A`, color: tint }}
                      >
                        {adjustmentType(a.reason)}
                      </span>
                    </span>
                    <span className="order-4 min-w-0 text-xs leading-snug text-muted-foreground md:order-none">{a.reason}</span>
                    <span className="order-3 text-right text-sm font-bold tabular-nums md:order-none" style={{ color: tint }}>
                      {a.amount >= 0 ? "+" : "−"}{money(Math.abs(a.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelShell>
      )}

      {expanded.bonus && kpis && (
        <PanelShell accent={FIN.bonus.base} icon={Medal} title="Bonus breakdown">
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Threshold <span className="font-bold text-foreground">{threshold}%</span></span>
              <span className="hidden sm:inline">·</span>
              <span>
                Composite Score{" "}
                <span className="font-bold" style={{ color: signalColor(kpis.composite) }}>{kpis.composite}%</span>
              </span>
            </div>
            <div className="space-y-3">
              {signals.map((s, i) => <KpiBar key={s.key} label={s.label} value={s.value} sub={s.sub} index={i} />)}
            </div>
            <div
              className="flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs leading-relaxed text-foreground"
              style={{ borderColor: FIN.bonus.ring, background: FIN.bonus.soft }}
            >
              <Info className="mt-[1px] h-4 w-4 shrink-0" style={{ color: FIN.bonus.base }} />
              <span>
                {kpis.bonusStatus.kind === "eligible" && (
                  <>You are <span className="font-semibold text-success">Bonus Eligible</span> — 6 consecutive months with Composite Score ≥ {threshold}%.</>
                )}
                {kpis.bonusStatus.kind === "streak" && (
                  <>Streak: <span className="font-semibold">{kpis.bonusStatus.streak}/{kpis.bonusStatus.needed} months ≥{threshold}%</span>. This month's Composite Score is {kpis.composite}%.</>
                )}
                {kpis.bonusStatus.kind === "not-tracking" && (
                  <>KPI tracking starts <span className="font-semibold">{kpis.bonusStatus.trackingStartLabel}</span> — the first full calendar month after your hire month.</>
                )}
              </span>
            </div>
          </div>
        </PanelShell>
      )}

      {/* Performance */}
      <section className="verbo-td-in space-y-4" style={{ animationDelay: "260ms" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle>Performance</SectionTitle>
          {rating != null && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
              style={{ backgroundColor: band.bg, color: band.fg }}
            >
              <Star className="h-4 w-4 fill-current" /> {rating.toFixed(1)} · {band.label}
            </span>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Composite gauge */}
          <div
            className="flex items-center gap-5 rounded-3xl border bg-card p-5 lg:flex-col lg:items-center lg:justify-center lg:gap-3 lg:text-center"
            style={{ borderColor: `${signalColor(kpis?.composite ?? 0)}55` }}
          >
            <CompositeGauge value={kpis?.composite ?? 0} />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Composite Score</div>
              <div className="mt-1 text-xs font-medium text-muted-foreground">Weighted average of your 6 KPIs</div>
              {kpis?.onboarding && (
                <span className="mt-2 inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                  Onboarding
                </span>
              )}
            </div>
          </div>

          {/* KPI mini-cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {signals.map((sig, i) => <KpiMiniCard key={sig.key} signal={sig} index={i} />)}
          </div>
        </div>

        <p
          className="flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs leading-relaxed text-foreground"
          style={{ borderColor: "rgba(243,137,52,0.30)", background: "rgba(243,137,52,0.06)" }}
        >
          <TrendingUp className="mt-[1px] h-4 w-4 shrink-0 text-accent" />
          Teachers with strong, consistent performance get priority for new sessions and schedule requests — one more reason to keep your KPIs healthy.
        </p>
      </section>

      {/* Report an Issue */}
      <div className="flex flex-col items-end gap-1 pt-1">
        {reportSent && <span className="text-xs font-medium text-success">Issue reported to Admin.</span>}
        <button
          type="button"
          onClick={() => { setReportSent(false); setReportOpen(true); }}
          className="verbo-td-press inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground shadow-soft transition-colors hover:bg-secondary"
        >
          <MessageCircleWarning className="h-4 w-4" style={{ color: FIN.adjust.base }} /> Report an Issue
        </button>
      </div>

      {reportOpen && teacher && (
        <FinancialIssueModal
          onClose={() => setReportOpen(false)}
          onSubmit={(text) => {
            addFinancialIssue({ teacherId: teacher.id, text });
            setReportOpen(false);
            setReportSent(true);
          }}
        />
      )}
    </div>
  );
}

function PanelShell({
  accent, icon: Icon, title, children,
}: { accent: string; icon: typeof Wallet; title: string; children: React.ReactNode }) {
  return (
    <section
      className="verbo-fin-panel overflow-hidden rounded-3xl border bg-card shadow-soft"
      style={{ borderColor: `${accent}44` }}
    >
      <header
        className="flex items-center gap-2.5 border-b px-5 py-3.5"
        style={{ borderColor: `${accent}33`, background: `${accent}0F` }}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `${accent}1F`, color: accent }}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="truncate text-sm font-bold text-foreground">{title}</h3>
      </header>
      {children}
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

function CompositeGauge({ value }: { value: number }) {
  const color = signalColor(value);
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative grid h-24 w-24 shrink-0 place-items-center">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-foreground/[0.07]" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (Math.max(0, Math.min(100, value)) / 100) * circ}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.23,1,0.32,1), stroke 300ms ease" }}
        />
      </svg>
      <span className="absolute text-2xl font-bold tabular-nums" style={{ color }}>{value}%</span>
    </div>
  );
}

// --- Financial issue modal --------------------------------------------------
function FinancialIssueModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  return (
    <AccentModal
      maxWidth="max-w-lg"
      background="linear-gradient(135deg, #dc0000 0%, #f38934 100%)"
      iconTint="rgba(255,255,255,0.18)"
      icon={MessageCircleWarning}
      eyebrow="Report"
      title="Report a Financial Issue"
      watermark={{ type: "icon", icon: MessageCircleWarning }}
      onClose={onClose}
    >
      <div className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Admin will see this in their notifications and can follow up from here.
        </p>
        <label className="block">
          <div className="mb-1.5 text-xs font-semibold text-foreground">What's the issue?</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="E.g., a completed session is missing from this month's summary."
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>
      <AccentModalFooter accent="#dc0000">
        <button type="button" onClick={onClose} className="rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground hover:bg-secondary">Cancel</button>
        <button
          type="button"
          disabled={!trimmed}
          onClick={() => onSubmit(trimmed)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send to Admin
        </button>
      </AccentModalFooter>
    </AccentModal>
  );
}

function SummaryCard({
  label, value, sub, expanded, onClick, gradient,
}: { label: string; value: string; sub: string; expanded: boolean; onClick: () => void; gradient: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl p-6 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-md text-white ${gradient} ${expanded ? "ring-2 ring-white/70 scale-[1.01]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-white/70">{label}</div>
        {expanded ? <ChevronUp className="h-4 w-4 text-white/80" /> : <ChevronDown className="h-4 w-4 text-white/80" />}
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-white/70">{sub}</div>
    </button>
  );
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-gradient-lime rounded-2xl p-6 text-white shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-wider text-white/80">{label}</div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-white/70">This month</div>
    </div>
  );
}

function KpiBar({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const color = signalColor(value);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">
          {label}
          {sub && <span className="ml-2 text-[10px] text-muted-foreground/70">{sub}</span>}
        </span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}66` }}
        />
      </div>
    </div>
  );
}

function KpiMiniCard({ signal }: { signal: KpiSignal }) {
  const color = signalColor(signal.value);
  const Icon = KPI_ICONS[signal.key] ?? Gauge;
  return (
    <div
      className="rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-soft"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}0F` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}1F`, color }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-xs font-medium leading-tight text-foreground">{signal.label}</span>
        </div>
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>{signal.value}%</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${signal.value}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}66` }}
        />
      </div>
      {signal.sub && <div className="mt-2 text-[10px] text-muted-foreground">{signal.sub}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone: "success" | "warning" | "danger" | "default" =
    status === "Completed" ? "success"
    : status === "Delayed" ? "warning"
    : status === "Absent" || status === "No-show" ? "danger"
    : "default";
  return <Pill tone={tone}>{status}</Pill>;
}