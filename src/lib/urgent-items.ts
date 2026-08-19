// 2026-08-19: extracted from admin.index.tsx (Dashboard) so the exact same
// "needs immediate action" rules can be reused by the Tablet quick-actions
// view (Jaret's tablet command center) without a second, drifting copy.
// This is a verbatim relocation of the Dashboard's first 5 urgency
// categories — same data sources, same thresholds, same navigation targets.
// Nothing here is new business logic.
//
// The Dashboard's other "Worth a look" categories (payment alerts, blocked
// insights, low-rated teachers, composite score, availability requests,
// financial issues, flagged challenges) stay inline in admin.index.tsx —
// they depend on that page's own hydrated `teacherRows`/`paymentAlerts`
// derivations and aren't needed by the Tablet view, which only wants the
// truly urgent list.
//
// Two categories (substitute-needed sessions, at-risk clubs) split by an
// 8-hour window: inside the window they're "urgent", outside it they used
// to fall into the Dashboard's "watch" bucket. `watchOverflow` carries that
// second half forward so admin.index.tsx's own "Worth a look" list keeps
// showing exactly what it did before this extraction.
import { USERS } from "./mock-data";
import { loadSessions } from "./sessions-store";
import { loadClubs, upcomingCreatedClubs, loadReleaseRequests } from "./clubs-store";
import { activeStrikeCount } from "./strikes-store";
import { loadConductReports } from "./conduct-reports-store";
import { loadContentIssueReports } from "./content-issue-reports-store";
import { UserX, Users2, Snowflake, ShieldAlert, Bug } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

type NavigateFn = (opts: { to: string; search?: Record<string, unknown> }) => void;

const CRIMSON = "#b52904";
const NAVY_DEEP = "#01304a";
const RED = "#dc2626";
const GOLD = "#d97706";
const EIGHT_H = 8 * 60 * 60 * 1000;

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

export function computeUrgencySignals(navigate: NavigateFn): {
  urgent: UrgencyItem[];
  /** The >8h half of the substitute/club-at-risk categories — merge this
   *  into the Dashboard's own "Worth a look" list, not shown on Tablet. */
  watchOverflow: UrgencyItem[];
} {
  const now = Date.now();
  const nameOf = (id?: string) => USERS.find((u) => u.id === id)?.name ?? "Unknown";
  const teachers = USERS.filter((u) => u.role === "teacher");

  const urgent: UrgencyItem[] = [];
  const watchOverflow: UrgencyItem[] = [];

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
      urgent.push({ ...base, accent: t.color, glow: t.glow });
    } else {
      watchOverflow.push({ ...base, accent: NAVY_DEEP });
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
      urgent.push({ ...base, accent: t.color, glow: t.glow });
    } else {
      watchOverflow.push({ ...base, accent: NAVY_DEEP });
    }
  }

  // 3 — Teachers auto-frozen by 3 active strikes.
  for (const t of teachers) {
    if (activeStrikeCount(t.id) < 3) continue;
    urgent.push({
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
    urgent.push({
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
    urgent.push({
      id: `issue:${r.id}`,
      icon: Bug,
      accent: "#a34ac0",
      title: `${r.issueType} — ${r.entityTitle}`,
      meta: `${nameOf(r.studentId)} · ${r.entityType}`,
      badge: "Bug",
      ctaLabel: "Issues",
      onClick: () => navigate({ to: "/admin/content-issue-reports" }),
    });
  }

  return { urgent, watchOverflow };
}
