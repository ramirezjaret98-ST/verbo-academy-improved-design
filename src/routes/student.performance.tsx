import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  PerformanceAnalyticsGrid,
  PlanTierBadge,
} from "@/components/verbo/PerformanceAnalytics";

export const Route = createFileRoute("/student/performance")({
  component: PerformanceView,
});

function PerformanceView() {
  const { user } = useAuth();
  if (!user) return null;
  const planTier = user.hired_plan ?? "—";

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4">
        <Link
          to="/student"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-[#01304a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              My Performance
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: "#01304a" }}>
              Advanced Performance Analytics
            </h1>
          </div>
          <PlanTierBadge tier={planTier} />
        </div>
      </header>

      <PerformanceAnalyticsGrid studentId={user.id} />
    </div>
  );
}
