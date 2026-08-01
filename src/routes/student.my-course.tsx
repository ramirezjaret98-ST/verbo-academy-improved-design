// Student > My Course — the VIP student's personalized unit list.
//
// Mirrors the Teacher-side Course Builder VIP visual language: each unit
// shows Done / Unlocked / Locked-until-previous-completed with the same
// icons and Pill tones (success / muted) used across Learning Path so the
// two surfaces feel like the same system.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Unlock, Lock, FileDown, Crown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/verbo/ui";
import {
  unitsForStudent,
  vipUnitDoneMap,
  subscribeVipUnits,
  subscribeVipUnitCompletion,
  type VipUnit,
} from "@/lib/vip-courses-store";
import { loadSessions, subscribeSessions } from "@/lib/sessions-store";

export const Route = createFileRoute("/student/my-course")({ component: Page });

function Page() {
  const { user } = useAuth();
  const [rev, setRev] = useState(0);
  useEffect(() => subscribeVipUnits(() => setRev((r) => r + 1)), []);
  useEffect(() => subscribeVipUnitCompletion(() => setRev((r) => r + 1)), []);
  useEffect(() => subscribeSessions(() => setRev((r) => r + 1)), []);

  const units = useMemo<VipUnit[]>(
    () => (user ? unitsForStudent(user.id) : []),
    [user, rev],
  );
  const doneMap = useMemo(() => vipUnitDoneMap(), [rev]);
  const sessions = useMemo(() => loadSessions(), [rev]);

  if (!user) return null;

  if (user.product !== "vip") {
    return (
      <Card>
        <div className="py-6 text-center text-sm text-muted-foreground">
          My Course is available for VIP students only.
        </div>
      </Card>
    );
  }

  const doneCount = units.filter((u) => doneMap[u.id]).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#4a044e]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#7e22ce]">
            <Crown className="h-3 w-3" /> VIP Course
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">My Course</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Units your teacher has built for you. Each unit unlocks once the previous one is
            completed in a Performance Session.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Progress</div>
          <div className="mt-0.5 text-lg font-semibold text-foreground">
            {doneCount} / {units.length} <span className="text-sm font-normal text-muted-foreground">units</span>
          </div>
        </div>
      </div>

      <Card className="!p-0">
        {units.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Your teacher hasn't added units yet. They'll appear here as soon as they do.
          </div>
        ) : (
          units.map((u, i) => {
            const done = !!doneMap[u.id];
            const prevDone = i === 0 || !!doneMap[units[i - 1].id];
            const unlocked = done || prevDone;
            const doneRec = doneMap[u.id];
            const doneSession = doneRec ? sessions.find((s) => s.id === doneRec.session_id) : undefined;
            return (
              <div
                key={u.id}
                className={`flex items-center justify-between gap-4 px-6 py-4 ${i ? "border-t border-border" : ""} ${
                  unlocked ? "" : "opacity-70"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Unit {i + 1}</span>
                    {done ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </span>
                    ) : unlocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        <Unlock className="h-3 w-3" /> Unlocked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <Lock className="h-3 w-3" /> Locked until previous unit completed
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground truncate">{u.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {unlocked && u.file_url ? (
                      <a
                        href={u.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        <FileDown className="h-3 w-3" /> {u.file_name || "Download material"}
                      </a>
                    ) : unlocked ? (
                      <span className="italic">No material attached yet</span>
                    ) : (
                      <span className="italic">Material unlocks when this unit is available</span>
                    )}
                    {done && doneSession && (
                      <>
                        <span>•</span>
                        <span className="text-[11px] text-muted-foreground">
                          Completed on {new Date(doneSession.date_time).toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
