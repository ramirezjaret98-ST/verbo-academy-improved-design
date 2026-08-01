// ============================================================================
// BonusBadge — single component that renders the "bonus eligibility" state
// for a teacher. Replaces the old "composite ≥ threshold" boolean chip with a
// three-state chip driven by BonusStatus (see teacher-kpi-history-store).
//
//   - eligible      → green "Bonus Eligible" pill
//   - streak        → neutral chip "Streak: X/6 months ≥N%"
//   - not-tracking  → muted chip "Not yet eligible — tracking starts <month>"
// ============================================================================
import { Trophy, TrendingUp, Clock } from "lucide-react";
import { type BonusStatus } from "@/lib/teacher-kpi-history-store";

interface Props {
  status: BonusStatus;
  size?: "sm" | "md";
  /** When true, wraps the eligible chip in the `verbo-bonus-glow` animation. */
  glow?: boolean;
}

export function BonusBadge({ status, size = "md", glow = false }: Props) {
  const px = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const text = size === "sm" ? "text-[10px]" : "text-xs";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (status.kind === "eligible") {
    return (
      <span className={`${glow ? "verbo-bonus-glow " : ""}inline-flex items-center gap-1.5 rounded-full bg-success/15 ${px} ${text} font-semibold text-success`}>
        <Trophy className={icon} /> Bonus Eligible
      </span>
    );
  }
  if (status.kind === "streak") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-secondary ${px} ${text} font-semibold text-foreground/80`}
        title={`Bonus eligibility requires ${status.needed} consecutive calendar months with composite ≥ ${status.threshold}%.`}
      >
        <TrendingUp className={icon} />
        Streak: {status.streak}/{status.needed} months ≥{status.threshold}%
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-secondary ${px} ${text} font-medium text-muted-foreground`}
      title="KPI tracking begins the first full calendar month after the teacher's hire month."
    >
      <Clock className={icon} />
      Not yet eligible — tracking starts {status.trackingStartLabel}
    </span>
  );
}
