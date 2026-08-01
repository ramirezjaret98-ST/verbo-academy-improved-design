import { useMemo } from "react";
import { Star } from "lucide-react";
import { AccentModalHeader } from "@/components/verbo/ui";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { ExtSession } from "@/lib/sessions-store";

// Rating Trend — per-teacher line chart of the average student rating over
// the last 6 months. Data source: performance sessions (course + workshop)
// only. Clubs / Spotlight events never carry a 1-5★ rating.

interface Point { label: string; avg: number | null; count: number }

const MONTHS = 6;

function bucketSessionsByMonth(sessions: ExtSession[]): Point[] {
  const now = new Date();
  // Build the 6 empty monthly buckets (oldest first).
  const points: Point[] = [];
  const keys: string[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${d.getMonth()}`);
    points.push({ label: d.toLocaleDateString("en-US", { month: "short" }), avg: null, count: 0 });
  }
  const sums: number[] = new Array(MONTHS).fill(0);
  const counts: number[] = new Array(MONTHS).fill(0);

  for (const s of sessions) {
    if (typeof s.student_rating !== "number") continue;
    const d = new Date(s.date_time);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = keys.indexOf(key);
    if (idx < 0) continue;
    sums[idx] += s.student_rating;
    counts[idx] += 1;
  }

  for (let i = 0; i < MONTHS; i++) {
    if (counts[i] > 0) {
      points[i].avg = Math.round((sums[i] / counts[i]) * 10) / 10;
      points[i].count = counts[i];
    }
  }
  return points;
}

export function RatingTrendModal({
  teacherId, sessions, onClose,
}: {
  teacherId: string;
  sessions: ExtSession[];
  onClose: () => void;
}) {
  const data = useMemo(() => {
    const now = Date.now();
    const sixMonthsAgo = now - MONTHS * 31 * 24 * 3600_000;
    const scoped = sessions.filter(
      (s) =>
        s.teacher_id === teacherId &&
        (s.origin === "course" || s.origin === "workshop") &&
        typeof s.student_rating === "number" &&
        (s.review_status ?? "pending") !== "discarded" &&
        +new Date(s.date_time) >= sixMonthsAgo,
    );
    return bucketSessionsByMonth(scoped);
  }, [teacherId, sessions]);

  const hasData = data.some((p) => p.count > 0);

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-floating">
        <AccentModalHeader
          background="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
          iconTint="#d97706"
          icon={Star}
          eyebrow="Rating trend · last 6 months"
          title="Your average student rating"
          watermark={{ type: "icon", icon: Star }}
          onClose={onClose}
        />
        <div className="px-6 py-6">
          {!hasData ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              Not enough data yet.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                    formatter={(_v: unknown, _k: unknown, ctx: { payload?: Point }) => {
                      const p = ctx.payload;
                      if (!p || p.avg == null) return ["—", "Avg rating"];
                      return [`${p.avg.toFixed(1)}★ (${p.count} session${p.count === 1 ? "" : "s"})`, "Avg rating"];
                    }}
                  />
                  <Line type="monotone" dataKey="avg" stroke="#01304a" strokeWidth={2.5} dot={{ r: 4, fill: "#01304a" }} activeDot={{ r: 6 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Based on 1-5★ ratings from your Performance Sessions only.
          </p>
        </div>
      </div>
    </div>
  );
}