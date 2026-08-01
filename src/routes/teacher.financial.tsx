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

  return (
    <div className="space-y-6">
      {/* Local styles for the bonus glow animation */}
      <style>{`
        @keyframes verbo-bonus-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.45); transform: translateY(0); }
          50%      { box-shadow: 0 0 0 8px rgba(34,197,94,0);   transform: translateY(-1px); }
        }
        .verbo-bonus-glow { animation: verbo-bonus-glow 2.2s ease-in-out infinite; }
      `}</style>

      {/* Header + month selector */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle>My Balance</SectionTitle>
            {tier && <Pill tone="success">{tier.name} tier · ${rate} MXN/h</Pill>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your payment summary for this period. Check how many sessions you've taught, the adjustments{"\n"}
            made and monitor your KPIs with absolute transparency.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 shadow-soft">
          <button
            type="button" aria-label="Previous month"
            onClick={() => setViewMonth((d) => addMonths(d, -1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          ><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-[140px] px-2 text-center text-sm font-semibold text-foreground">{labelOf(viewMonth)}</div>
          <button
            type="button" aria-label="Next month"
            onClick={() => setViewMonth((d) => addMonths(d, 1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          ><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Badges */}
      {(kpis || warningLevel !== "none") && (
        <div className="flex flex-wrap items-center justify-end gap-2">
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

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Sessions Taught"
          value={money(stdPay)}
          sub={`${sessionsCount} session${sessionsCount === 1 ? "" : "s"}`}
          expanded={expanded.sessions}
          onClick={() => toggle("sessions")}
          gradient="card-gradient-navy"
        />
        <SummaryCard
          label="Adjustments"
          value={money(adjustmentsTotal)}
          sub={`${adjustments.length} adjustment${adjustments.length === 1 ? "" : "s"}`}
          expanded={expanded.adjustments}
          onClick={() => toggle("adjustments")}
          gradient="card-gradient-crimson"
        />
        <SummaryCard
          label="Bonus"
          value={money(bonusAmount)}
          sub={`Composite Score: ${kpis?.composite ?? 0}% · ${rating != null ? rating.toFixed(1) + "★" : "—"}`}
          expanded={expanded.bonus}
          onClick={() => toggle("bonus")}
          gradient="card-gradient-gold"
        />
        <TotalCard label="Total Earned" value={money(totalEarned)} />
      </div>

      {/* Accordion panels */}
      {expanded.sessions && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Sessions Taught — {labelOf(viewMonth)}</h3>
          {sessionRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No sessions recorded this month.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Student/Group</th>
                    <th className="px-3 py-2 font-medium">Session Type</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionRows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          {r.isGroup && (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-accent/15 text-[10px] font-bold text-accent">G</span>
                          )}
                          {r.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.type}</td>
                      <td className="px-3 py-2.5">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                        {r.amount ? money(r.amount) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {expanded.adjustments && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Adjustments — {labelOf(viewMonth)}</h3>
          {adjustments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No adjustments this month.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((a) => (
                    <tr key={a.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{adjustmentType(a.reason)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${a.amount < 0 ? "text-destructive" : "text-success"}`}>
                        {a.amount >= 0 ? "+" : "−"}{money(Math.abs(a.amount))}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{a.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {expanded.bonus && kpis && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Bonus breakdown</h3>
            <div className="text-xs text-muted-foreground">
              Threshold: <span className="font-semibold text-foreground">{threshold}%</span>
              <span className="mx-2">·</span>
              Composite Score: <span className="font-semibold" style={{ color: signalColor(kpis.composite) }}>{kpis.composite}%</span>
            </div>
          </div>
          <div className="space-y-3">
            {signals.map((s) => <KpiBar key={s.key} label={s.label} value={s.value} sub={s.sub} />)}
          </div>
          <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            {kpis.bonusStatus.kind === "eligible" && (
              <>You are <span className="font-semibold text-success">Bonus Eligible</span> — 6 consecutive months with Composite Score ≥ {threshold}%.</>
            )}
            {kpis.bonusStatus.kind === "streak" && (
              <>Streak: <span className="font-semibold text-foreground">{kpis.bonusStatus.streak}/{kpis.bonusStatus.needed} months ≥{threshold}%</span>. This month's Composite Score is {kpis.composite}%.</>
            )}
            {kpis.bonusStatus.kind === "not-tracking" && (
              <>KPI tracking starts <span className="font-semibold text-foreground">{kpis.bonusStatus.trackingStartLabel}</span> — the first full calendar month after your hire month.</>
            )}
          </div>
        </Card>
      )}

      {/* Performance card */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Performance</h3>
          {rating != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style={{ backgroundColor: band.bg, color: band.fg }}>
              <Star className="h-4 w-4 fill-current" /> {rating.toFixed(1)} · {band.label}
            </span>
          )}
        </div>

        {/* Composite score — highlighted */}
        <div
          className="mb-5 flex items-center gap-4 rounded-2xl border p-5"
          style={{
            borderColor: `${signalColor(kpis?.composite ?? 0)}55`,
            backgroundColor: `${signalColor(kpis?.composite ?? 0)}12`,
          }}
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${signalColor(kpis?.composite ?? 0)}22`, color: signalColor(kpis?.composite ?? 0) }}
          >
            <Gauge className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Composite Score</div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums tracking-tight" style={{ color: signalColor(kpis?.composite ?? 0) }}>
                {kpis?.composite ?? 0}%
              </span>
              {kpis?.onboarding && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">Onboarding</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI mini-cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((sig) => <KpiMiniCard key={sig.key} signal={sig} />)}
        </div>

        <p className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-foreground">
          Teachers with strong, consistent performance get priority for new sessions and schedule requests — one more reason to keep your KPIs healthy.
        </p>
      </Card>

      {/* Report an Issue → sends a notification to Admin (bell) */}
      <div className="flex flex-col items-end gap-1 pt-2">
        {reportSent && (
          <span className="text-xs text-success">Issue reported to Admin.</span>
        )}
        <button
          type="button"
          onClick={() => { setReportSent(false); setReportOpen(true); }}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-secondary"
        >
          <MessageCircleWarning className="h-4 w-4" /> Report an Issue
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