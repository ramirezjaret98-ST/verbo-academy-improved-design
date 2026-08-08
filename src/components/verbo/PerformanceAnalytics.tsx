// Shared "Advanced Performance Analytics" panel.
//
// Used by BOTH:
//   - /student/performance (the student's dedicated route)
//   - Teacher > Mis Alumnos detail modal (opened from the compact 4-tile
//     summary on each student card)
//
// This is intentionally the single source of truth so any tweak to the
// analytics presentation lands in both surfaces at once. The previous
// "Boost Skill" affordance has been removed on purpose — it does not
// belong on the teacher-facing view, and per product decision it should
// no longer live on the student view either.

import { useSyncExternalStore, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  getPerformanceSnapshot,
  getServerPerformanceSnapshot,
  performanceKey,
  subscribePerformance,
  type PerformanceMap,
} from "@/lib/performance-store";
import {
  getSessionsSnapshot,
  getServerSessionsSnapshot,
  subscribeSessions,
} from "@/lib/sessions-store";
import { MACRO_SKILLS, skillKey } from "@/lib/skills-taxonomy";
import { BarChart3 } from "lucide-react";
import { AccentModal } from "@/components/verbo/ui";

function subAverage(map: PerformanceMap, key: string) {
  const vals: number[] = [];
  for (const r of Object.values(map)) {
    const v = r?.subskills?.[key];
    if (typeof v === "number") vals.push(v);
  }
  return { avg: vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
}

export interface ComputedMacro {
  key: string;
  icon: LucideIcon;
  overall: number | null;
  subs: { name: string; value: number | null }[];
}

function computeMacros(performance: PerformanceMap): ComputedMacro[] {
  // Subskill values are ONLY real ratings. If a specific subskill has no
  // data, its value stays `null` and the UI shows "--". We intentionally
  // do not synthesize numbers from the base categories — a "--" is more
  // honest than a fabricated score that looks like a real measurement.
  return MACRO_SKILLS.map((m) => {
    const subs = m.subs.map((s) => {
      const real = subAverage(performance, skillKey(m.key, s.name));
      if (real.count > 0) return { name: s.name, value: Math.round(real.avg) };
      return { name: s.name, value: null as number | null };
    });
    const rated = subs.map((s) => s.value).filter((v): v is number => typeof v === "number");
    const overall = rated.length === 0 ? null : Math.round(rated.reduce((a, b) => a + b, 0) / rated.length);
    return { key: m.key, icon: m.icon, overall, subs };
  });
}

/** Public: current computed macros, live-subscribed, scoped to a student.
 *  Filters the performance map to sessions belonging to `studentId` so the
 *  aggregate reflects that student only — not the whole platform.
 *
 *  Performance entries are keyed by `${sessionId}:${studentId}` (see
 *  performance-store.ts), not by session id alone — a group session is one
 *  shared session row but has its own rating row per member, so matching
 *  must account for both the 1:1 case (`s.student_id === studentId`) and
 *  the group case (`studentId` present in `s.member_statuses`). */
export function useComputedMacros(studentId: string): ComputedMacro[] {
  const performance = useSyncExternalStore(
    subscribePerformance,
    getPerformanceSnapshot,
    getServerPerformanceSnapshot,
  );
  const sessions = useSyncExternalStore(
    subscribeSessions,
    getSessionsSnapshot,
    getServerSessionsSnapshot,
  );
  return useMemo(() => {
    if (!studentId) return computeMacros({});
    const relevant = sessions.filter(
      (s) => s.student_id === studentId || (s.member_statuses ? studentId in s.member_statuses : false),
    );
    const scoped: PerformanceMap = {};
    for (const s of relevant) {
      const key = performanceKey(s.id, studentId);
      const rating = performance[key];
      if (rating) scoped[key] = rating;
    }
    return computeMacros(scoped);
  }, [performance, sessions, studentId]);
}

/** Small chip identical to the one shown in the student route header. */
export function PlanTierBadge({ tier }: { tier: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-sm"
      style={{
        borderColor: "rgba(1, 48, 74, 0.12)",
        background: "#ffffff",
        color: "#01304a",
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#f38934" }} />
      Plan Tier: {tier}
    </div>
  );
}

/** The 2-column macro-skill grid. Reused by every consumer. */
export function PerformanceAnalyticsGrid({ studentId }: { studentId: string }) {
  const macros = useComputedMacros(studentId);
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      {macros.map((m) => <MacroCard key={m.key} macro={m} />)}
    </section>
  );
}

function scoreClasses(value: number) {
  if (value < 50) return "text-red-600 bg-red-50 border-red-200";
  if (value < 60) return "text-orange-600 bg-orange-50 border-orange-200";
  if (value < 70) return "text-amber-600 bg-amber-50 border-amber-200";
  if (value < 80) return "text-lime-600 bg-lime-50 border-lime-200";
  if (value < 90) return "text-emerald-500 bg-emerald-50 border-emerald-200";
  return "text-emerald-700 bg-emerald-100 border-emerald-300";
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
        --
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums ${scoreClasses(value)}`}>
      {value}%
    </span>
  );
}

function MacroCard({ macro }: { macro: ComputedMacro }) {
  const Icon = macro.icon;
  return (
    <div
      className="flex flex-col gap-5 rounded-2xl border p-6 shadow-sm"
      style={{ background: "#ffffff", borderColor: "rgba(1, 48, 74, 0.08)" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "rgba(1, 48, 74, 0.06)", color: "#01304a" }}
          >
            <Icon className="h-5 w-5" strokeWidth={1.6} />
          </div>
          <h2 className="text-lg font-bold tracking-tight" style={{ color: "#01304a" }}>
            {macro.key}
          </h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overall</div>
          <div
            className="text-2xl font-bold tabular-nums leading-none"
            style={{ color: macro.overall === null ? "#94a3b8" : "#01304a" }}
          >
            {macro.overall === null ? "--" : `${macro.overall}%`}
          </div>
        </div>
      </div>

      <div className="h-px w-full" style={{ background: "rgba(1, 48, 74, 0.08)" }} />

      <ul className="flex flex-col divide-y" style={{ borderColor: "rgba(1, 48, 74, 0.06)" }}>
        {macro.subs.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="text-sm font-medium" style={{ color: "#01304a" }}>{s.name}</span>
            <ScoreBadge value={s.value} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Modal wrapper used by Teacher > Mis Alumnos. Reuses the same grid so
 *  changes to the visualization propagate everywhere automatically. */
export function PerformanceAnalyticsModal({
  planTier,
  studentId,
  onClose,
}: {
  planTier: string;
  studentId: string;
  onClose: () => void;
}) {
  return (
    <AccentModal
      maxWidth="max-w-5xl"
      background="linear-gradient(135deg, #01304a 0%, #7e22ce 100%)"
      iconTint="rgba(255,255,255,0.18)"
      icon={BarChart3}
      eyebrow="Advanced Performance Analytics"
      title="Skill breakdown"
      watermark={{ type: "icon", icon: BarChart3 }}
      onClose={onClose}
    >
      <div className="max-h-[80vh] overflow-y-auto p-8">
        <div className="mb-5 flex justify-end">
          <PlanTierBadge tier={planTier} />
        </div>
        <PerformanceAnalyticsGrid studentId={studentId} />
      </div>
    </AccentModal>
  );
}