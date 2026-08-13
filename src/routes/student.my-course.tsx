// Student > My Course — the VIP student's personalized course.
//
// Redesigned 2026-08-12 (confirmed with Jaret): what used to be a single flat
// list of horizontal rows is now Course card -> Units (grouped into optional
// Blocks when Admin sets one) -> Unit detail, mirroring the "course, block,
// unit" flow of the institutional Learning Path — and, critically, unit
// detail now actually opens the real ActivityRunner (imported from
// student.courses.tsx, same engine every institutional unit uses) instead of
// activities being completely unreachable, which was the core bug reported.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Unlock, Lock, FileDown, Crown, ArrowLeft, ArrowRight,
  ImageIcon, LayoutGrid, Play, Sparkles, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card, Pill, StatRing } from "@/components/verbo/ui";
import {
  unitsForStudent,
  vipUnitDoneMap,
  subscribeVipUnits,
  subscribeVipUnitCompletion,
  type VipUnit,
} from "@/lib/vip-courses-store";
import { courseMetaFor, subscribeCourseMeta } from "@/lib/custom-course-meta-store";
import { loadSessions, subscribeSessions } from "@/lib/sessions-store";
import { customUnitAccessOverride, resolveCustomUnitUnlock } from "@/lib/custom-units-store";
import {
  MANDATORY_CATEGORIES,
  activitiesForUnit,
  categoryLabel,
  subscribeActivities,
  unitCategoryProgress,
  unitPassed,
} from "@/lib/activities-store";
import { ActivityRunner, UnitVideoPlayer } from "./student.courses";
import type { CourseUnit } from "@/lib/product-courses-store";

export const Route = createFileRoute("/student/my-course")({ component: Page });

const CATEGORY_RING_COLORS = ["#cb6ce6", "#69d11d", "#92dfd4"];

type View = { kind: "card" } | { kind: "units" } | { kind: "unit"; unitId: string };

function Page() {
  const { user } = useAuth();
  const [view, setView] = useState<View>({ kind: "card" });
  const [rev, setRev] = useState(0);
  useEffect(() => subscribeVipUnits(() => setRev((r) => r + 1)), []);
  useEffect(() => subscribeVipUnitCompletion(() => setRev((r) => r + 1)), []);
  useEffect(() => subscribeSessions(() => setRev((r) => r + 1)), []);
  useEffect(() => subscribeCourseMeta(() => setRev((r) => r + 1)), []);
  useEffect(() => subscribeActivities(() => setRev((r) => r + 1)), []);

  const units = useMemo<VipUnit[]>(() => (user ? unitsForStudent(user.id) : []), [user, rev]);
  const doneMap = useMemo(() => vipUnitDoneMap(), [rev]);
  const sessions = useMemo(() => loadSessions(), [rev]);
  const courseMeta = useMemo(() => (user ? courseMetaFor("vip", user.id) : null), [user, rev]);

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

  if (view.kind === "unit") {
    const idx = units.findIndex((u) => u.id === view.unitId);
    const unit = idx >= 0 ? units[idx] : undefined;
    if (!unit) { setView({ kind: "units" }); return null; }
    const done = !!doneMap[unit.id];
    const prevDone = idx === 0 || !!doneMap[units[idx - 1].id];
    const unlocked = resolveCustomUnitUnlock(done, prevDone, customUnitAccessOverride(user.id, unit.id));
    const nextUnit = units[idx + 1];
    return (
      <CustomUnitDetail
        unit={unit}
        studentId={user.id}
        unlocked={unlocked}
        done={done}
        onBack={() => setView({ kind: "units" })}
        onOpenNext={nextUnit ? () => setView({ kind: "unit", unitId: nextUnit.id }) : undefined}
      />
    );
  }

  if (view.kind === "units") {
    return (
      <CustomUnitsList
        title={courseMeta?.title ?? "My VIP Course"}
        units={units}
        doneMap={doneMap}
        sessions={sessions}
        studentId={user.id}
        onBack={() => setView({ kind: "card" })}
        onOpenUnit={(u) => setView({ kind: "unit", unitId: u.id })}
      />
    );
  }

  return (
    <CourseCardHero
      title={courseMeta?.title ?? "My VIP Course"}
      coverImage={courseMeta?.cover_image}
      unitsCount={units.length}
      doneCount={doneCount}
      badgeLabel="VIP Course"
      badgeIcon={Crown}
      onOpen={() => setView({ kind: "units" })}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Course card — the single landing entry point                               */
/* -------------------------------------------------------------------------- */
export function CourseCardHero({
  title, coverImage, unitsCount, doneCount, badgeLabel, badgeIcon: BadgeIcon, onOpen,
}: {
  title: string;
  coverImage?: string;
  unitsCount: number;
  doneCount: number;
  badgeLabel: string;
  badgeIcon: typeof Crown;
  onOpen: () => void;
}) {
  const pct = unitsCount === 0 ? 0 : Math.round((doneCount / unitsCount) * 100);
  return (
    <div className="mx-auto max-w-md">
      <button
        type="button"
        onClick={onOpen}
        className="verbo-ease-out-expo group relative block w-full overflow-hidden rounded-2xl border border-border text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl active:scale-[0.985]"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-[#f38934] to-[#c2410c]">
          {coverImage ? (
            <div
              className="verbo-ease-out-expo absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.04]"
              style={{ backgroundImage: `url(${coverImage})` }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/30">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to top, rgba(1,20,32,0.88) 0%, rgba(1,20,32,0.55) 32%, rgba(1,20,32,0.10) 62%, rgba(1,20,32,0) 100%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md">
              <BadgeIcon className="h-3 w-3" /> {badgeLabel}
            </div>
            <div className="mt-1.5 text-xl font-semibold leading-[1.1] tracking-[-0.02em] text-white">{title}</div>
          </div>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{unitsCount} units</span>
            <span className="text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
              {doneCount}<span className="opacity-40"> / {unitsCount}</span>
              <span className="ml-2 opacity-55">{pct}%</span>
            </span>
          </div>
          <div className="relative mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="absolute inset-0 rounded-full" style={{ backgroundImage: "linear-gradient(to right, #ff914d, #ffc700, #69d11e)" }} />
            <div className="verbo-ease-out-expo absolute inset-y-0 right-0 rounded-r-full bg-secondary transition-[width] duration-700" style={{ width: `${100 - pct}%` }} />
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#c8801a" }}>
            {unitsCount === 0 ? "View course" : "Continue"}
            <ChevronRight className="verbo-ease-out-expo h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1" />
          </div>
        </div>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Units list — grouped by optional Block label                               */
/* -------------------------------------------------------------------------- */
export function CustomUnitsList<T extends VipUnit>({
  title, units, doneMap, sessions, studentId, onBack, onOpenUnit,
}: {
  title: string;
  units: T[];
  doneMap: Record<string, { session_id: string; completed_at: string }>;
  sessions: { id: string; date_time: string }[];
  studentId: string;
  onBack: () => void;
  onOpenUnit: (u: T) => void;
}) {
  // Group consecutively by `block` — a unit with no block sits in its own
  // implicit "no group" bucket, rendered as a flat row (no accordion chrome)
  // so the common case (no blocks set at all) looks exactly like a plain list.
  const groups = useMemo(() => {
    const out: { block: string | null; units: T[] }[] = [];
    for (const u of units) {
      const label = u.block?.trim() || null;
      const last = out[out.length - 1];
      if (last && last.block === label) last.units.push(u);
      else out.push({ block: label, units: [u] });
    }
    return out;
  }, [units]);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {title}
      </button>

      {units.length === 0 ? (
        <Card>
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Your teacher hasn't added units yet. They'll appear here as soon as they do.
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.block && (
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <LayoutGrid className="h-3.5 w-3.5" /> {g.block}
                </div>
              )}
              <Card className="!p-0">
                {g.units.map((u) => {
                  const i = units.indexOf(u);
                  const done = !!doneMap[u.id];
                  const prevDone = i === 0 || !!doneMap[units[i - 1].id];
                  const unlocked = resolveCustomUnitUnlock(done, prevDone, customUnitAccessOverride(studentId, u.id));
                  const doneRec = doneMap[u.id];
                  const doneSession = doneRec ? sessions.find((s) => s.id === doneRec.session_id) : undefined;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => unlocked && onOpenUnit(u)}
                      disabled={!unlocked}
                      className={`flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors ${
                        u !== g.units[0] ? "border-t border-border" : ""
                      } ${unlocked ? "hover:bg-secondary/40" : "cursor-not-allowed opacity-70"}`}
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
                          {unlocked && u.video_url && (
                            <span className="inline-flex items-center gap-1"><Play className="h-3 w-3" /> Video</span>
                          )}
                          {unlocked && u.file_url ? (
                            <span className="inline-flex items-center gap-1"><FileDown className="h-3 w-3" /> {u.file_name || "Material"}</span>
                          ) : unlocked ? (
                            <span className="italic">No material attached yet</span>
                          ) : (
                            <span className="italic">Unlocks when the previous unit is completed</span>
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
                      {unlocked && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Unit detail — video (optional) + material + activities                     */
/* -------------------------------------------------------------------------- */
export function CustomUnitDetail({
  unit, studentId, unlocked, done, onBack, onOpenNext,
}: {
  unit: VipUnit;
  studentId: string;
  unlocked: boolean;
  done: boolean;
  onBack: () => void;
  onOpenNext?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activities = activitiesForUnit(unit.id);
  const catProgress = unitCategoryProgress(studentId, unit.id);
  const activitiesPassed = unitPassed(studentId, unit.id);
  const mandatoryRows = catProgress.filter((r) => r.mandatory);
  const hasScore = mandatoryRows.some((r) => r.best > 0);
  const overallScore = hasScore
    ? Math.round(mandatoryRows.reduce((s, r) => s + r.best, 0) / Math.max(1, mandatoryRows.length))
    : null;

  if (!unlocked) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">This unit is locked</p>
            <p className="text-xs text-muted-foreground">It unlocks once the previous unit is marked completed.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{unit.title}</h1>
          {activities.length > 0 && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {unit.video_url ? "Watch the video, then complete " : "Complete "}the activities to practice this unit.
            </p>
          )}
        </div>
        {done && <Pill tone="success">Marked done</Pill>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden !p-0">
          <div className="relative aspect-video w-full bg-primary">
            {unit.video_url ? (
              <UnitVideoPlayer url={unit.video_url} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary via-primary to-black/40 text-white/60">
                <Play className="h-8 w-8" />
                <span className="text-xs">No video for this unit</span>
              </div>
            )}
          </div>
          <div className="p-5">
            <div className="text-sm font-semibold text-foreground">{unit.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{unit.video_url ? "Intro video" : "This unit doesn't have a video — that's OK, check the material and activities below."}</div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground"><FileDown className="h-4 w-4" /></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-foreground">Material</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{unit.file_url ? "Downloadable file for this unit" : "No material uploaded yet"}</div>
              </div>
            </div>
            {unit.file_url && (
              <a href={unit.file_url} target="_blank" rel="noopener noreferrer" className="verbo-ease-out-expo mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all duration-300 hover:scale-[1.02] hover:border-accent/50 hover:bg-accent/10 hover:text-accent">
                <FileDown className="h-4 w-4" /> {unit.file_name || "Download material"}
              </a>
            )}
          </Card>

          {activities.length > 0 && (
            <Card>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progress</div>
              <div className="mt-4 flex items-start justify-between gap-2">
                {MANDATORY_CATEGORIES.filter((c) => catProgress.some((r) => r.category === c)).map((c, i) => {
                  const row = catProgress.find((r) => r.category === c);
                  const best = row?.best ?? 0;
                  const color = CATEGORY_RING_COLORS[i % CATEGORY_RING_COLORS.length];
                  return (
                    <div key={c} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                      <StatRing value={best} size={56} stroke={6} label={row ? String(best) : "—"} progressColor={color} textColor={color} />
                      <span className="text-[11px] font-medium leading-tight text-muted-foreground">{categoryLabel(c)}</span>
                    </div>
                  );
                })}
                {overallScore !== null && (
                  <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                    <StatRing value={overallScore} size={56} stroke={6} label={String(overallScore)} progressColor="#f38934" textColor="#f38934" />
                    <span className="text-[11px] font-medium leading-tight text-muted-foreground">Overall</span>
                  </div>
                )}
              </div>
              {activitiesPassed && (
                <div className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">All mandatory categories passed.</div>
              )}
            </Card>
          )}

          <button
            disabled={activities.length === 0}
            onClick={() => setOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground shadow-[0_8px_24px_-6px_rgba(243,137,52,0.5)] transition-all hover:bg-[#d9731f] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {activities.length === 0 ? (
              "No activities yet"
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> {hasScore ? "Continue activities" : "Start activities"} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {onOpenNext && (
        <button
          type="button"
          onClick={onOpenNext}
          className="verbo-ease-out-expo group inline-flex items-center gap-2 text-sm font-semibold text-accent transition-all duration-300 hover:gap-3"
        >
          Next unit <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      )}

      {open && (
        <ActivityRunner
          unit={{ id: unit.id, title: unit.title, video_url: unit.video_url ?? "", pdf_url: "" } as CourseUnit}
          activities={activities}
          studentId={studentId}
          readOnly={false}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
