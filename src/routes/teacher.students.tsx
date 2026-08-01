import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ASSIGNMENTS, USERS, SESSIONS, type User } from "@/lib/mock-data";
import { studentAttendance } from "@/lib/sessions-store";
import {
  MAX_INSIGHT_STRIKES, MAX_BOOKCLUB_STRIKES,
  getProduct,
} from "@/lib/student-model";
import { hydrateStudents, subscribeStudents } from "@/lib/students-store";
import { groupOfStudent, subscribeGroups, effectiveSessionCounts, sessionProgressFor } from "@/lib/groups-store";
import {
  loadChallenges, subscribeChallenges, challengesFor, categoryColor,
  DIFFICULTY_META, DIFFICULTY_ORDER,
  type Challenge, type ChallengeProductId, type DifficultyId,
} from "@/lib/challenges-store";
import {
  getCoverageNote, setCoverageNote, subscribeCoverageNotes,
} from "@/lib/coverage-notes-store";
import { addStudentReport } from "@/lib/student-reports-store";
import {
  PerformanceAnalyticsModal, useComputedMacros,
} from "@/components/verbo/PerformanceAnalytics";
import { useAvatar } from "@/lib/avatar-store";
import { Card, Pill, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import {
  Search, X, Filter, Crown, Users as UsersIcon,
  GraduationCap, Layers, Lightbulb, Video, Clock, Repeat, NotebookPen,
  BookOpenCheck, CalendarCheck, Flag, Mic, PenLine, Ear, BookOpen,
  Unlock as UnlockIcon, Lock as LockIcon, Trophy,
  type LucideIcon,
} from "lucide-react";
import { loadCourses, subscribeCourses, computeCurrentProgress, type CourseLevel } from "@/lib/product-courses-store";
import {
  isMilestoneUnit, getUnitAccessOverride, setUnitAccess,
} from "@/lib/activities-store";

export const Route = createFileRoute("/teacher/students")({ component: Page });

// NOTE (Teacher Panel-wide rule): teachers must never see any financial
// data about students — payment status, plan pricing, invoices, etc.
// Any such fields live exclusively in the Admin Panel.

const SKILL_ICONS: Record<string, LucideIcon> = {
  Speaking: Mic, Writing: PenLine, Listening: Ear, Reading: BookOpen,
};

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

type GroupBy = "none" | "company" | "product" | "level";

function Page() {
  const { user } = useAuth();
  const [tickVal, tick] = useState(0);
  const [detail, setDetail] = useState<User | null>(null);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  // Hydrate the shared USERS singleton with persisted student overrides so
  // this view reads the exact same profile data Admin > Students shows.
  useEffect(() => {
    hydrateStudents();
    tick((n) => n + 1);
    const unsub = subscribeStudents(() => tick((n) => n + 1));
    const unsubG = subscribeGroups(() => tick((n) => n + 1));
    const unsubC = subscribeCourses(() => tick((n) => n + 1));
    return () => { unsub(); unsubG(); unsubC(); };
  }, []);

  const curriculumLevelName = (s: User): string | null =>
    computeCurrentProgress(s.id, s.product, s.contracted_levels ?? [], tickVal)?.levelName ?? null;

  if (!user) return null;

  // Only students assigned to the current teacher — never all platform users.
  const assignedIds = ASSIGNMENTS.filter((a) => a.teacher_id === user.id).map((a) => a.student_id);
  const myStudents = USERS.filter((u) => u.role === "student" && assignedIds.includes(u.id));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? myStudents.filter((s) => s.name.toLowerCase().includes(q)) : myStudents;
  }, [myStudents, search]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ label: "", items: filtered }];
    const map = new Map<string, User[]>();
    for (const s of filtered) {
      let key = "—";
      if (groupBy === "company") key = s.company || "Sin empresa";
      else if (groupBy === "product") key = getProduct(s.product)?.name || "Sin producto";
      else if (groupBy === "level") key = curriculumLevelName(s) || "No level yet";
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, items]) => ({ label, items }));
  }, [filtered, groupBy]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Students</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Students assigned to you — view progress, manage unit access and coverage notes.
            </p>
          </div>
        </div>
        <Pill tone="default">{myStudents.length} students</Pill>
      </div>

      {/* Search + group control */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student name…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="none">No grouping</option>
            <option value="company">Group by Company</option>
            <option value="product">Group by Product</option>
            <option value="level">Group by Level</option>
          </select>
          <Filter className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
          <UsersIcon className="mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-foreground">No matching students.</p>
          <p className="mt-1 text-xs text-muted-foreground">Adjust your search or grouping.</p>
        </div>
      )}

      {grouped.map((g) => (
        <section key={g.label || "all"} className="space-y-3">
          {g.label && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {g.label} <span className="text-muted-foreground/60">· {g.items.length}</span>
            </h2>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {g.items.map((s, i) => (
              <StudentCard key={s.id} student={s} index={i} onOpen={() => setDetail(s)} />
            ))}
          </div>

        </section>
      ))}

      {detail && user && (
        <StudentDetailModal
          student={detail}
          teacherId={user.id}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// STUDENT CARD — read-only summary (mirrors Admin > Students layout).
// ============================================================================
function StudentCard({ student: s, onOpen }: { student: User; onOpen: () => void }) {
  const avatar = useAvatar(s.id);
  const product = getProduct(s.product);
  const strikes = s.insights_strikes ?? 0;
  const blocked = strikes >= MAX_INSIGHT_STRIKES;
  const bcStrikes = s.bookclub_strikes ?? 0;
  const bcBlocked = bcStrikes >= MAX_BOOKCLUB_STRIKES;
  const hasBookClubs = (s.addon_bookclubs_per_month ?? 0) > 0;
  const counts = effectiveSessionCounts(s.id, { hired: s.hired_sessions, remaining: s.remaining_sessions });
  const hired = counts.hired;
  const remaining = counts.remaining;
  const { pct } = sessionProgressFor(hired, remaining);
  const productType = s.product_type ?? "performance";
  const showInsightsBadge = productType === "performance" || productType === "insights";
  const isVip = s.product === "vip";

  // Attendance — shared helper (studentAttendance) so Admin, Teacher and
  // Student always show the exact same % for a given student.
  const attendance = studentAttendance(SESSIONS, s);
  const attPct = attendance.pct;
  const attAlert = attendance.absent > attendance.completed;

  // Overall 4-skill scores (shared component / same source as student dashboard).
  const macros = useComputedMacros(s.id);
  const anySkillLow = macros.some((m) => m.overall !== null && m.overall < 70);

  // Standalone Workshops / Insights students (no performance sessions) get
  // the same compact treatment used in Admin > Students.
  if (productType !== "performance") {
    const typeLabel = productType === "workshops" ? "Focus Workshops" : "Insights";
    return (
      <button
        onClick={onOpen}
        className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated"
      >
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt={s.name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials(s.name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold text-foreground">
              {s.name}{s.company ? <span className="text-muted-foreground"> · {s.company}</span> : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">{s.email}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Tag className="bg-primary/10 text-primary">{typeLabel}</Tag>
          {showInsightsBadge && (
            <Tag className={blocked ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}>
              {blocked ? <>Insights Blocked</> : <>Insights {strikes}/{MAX_INSIGHT_STRIKES}</>}
            </Tag>
          )}
        </div>
      </button>
    );
  }

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="group relative flex cursor-pointer flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated"
    >
      {isVip && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
          <Crown className="h-3 w-3" /> VIP
        </span>
      )}

      <div className="flex items-center gap-3">
        {avatar ? (
          <img src={avatar} alt={s.name} className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initials(s.name)}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">
            {s.name}{s.company ? <span className="text-muted-foreground"> · {s.company}</span> : null}
          </div>
          {(() => {
            const lv = computeCurrentProgress(s.id, s.product, s.contracted_levels ?? [], 0)?.levelName;
            return lv ? <div className="truncate text-xs text-muted-foreground">{lv}</div> : null;
          })()}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {product && <Tag className="bg-primary/10 text-primary">{product.name}</Tag>}
        {s.access_plan && <Tag className="bg-accent/10 text-accent">{s.access_plan}</Tag>}
        {s.focus && <Tag className="bg-secondary text-secondary-foreground">{s.focus}</Tag>}
        {(() => {
          const gi = groupOfStudent(s.id);
          return gi ? (
            <Tag className="bg-primary text-primary-foreground">Group: {gi.group.name}</Tag>
          ) : null;
        })()}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Sessions</span>
          <span className="font-medium text-foreground">{remaining}/{hired}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full ${pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-accent"}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Tag className={blocked ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}>
          {blocked ? <>Insights Blocked</> : <>Insights {strikes}/{MAX_INSIGHT_STRIKES}</>}
        </Tag>
        {hasBookClubs && (
          <Tag className={bcBlocked ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}>
            {bcBlocked ? <>Book Clubs Blocked</> : <>Book Clubs {bcStrikes}/{MAX_BOOKCLUB_STRIKES}</>}
          </Tag>
        )}
        <Tag className={attAlert ? "bg-destructive/10 text-destructive verbo-pay-glow" : "bg-secondary text-secondary-foreground"}>
          <CalendarCheck className="mr-1 h-3 w-3" /> Attendance {attPct}%
        </Tag>
      </div>

      {/* Compact 4-tile skill summary — clicking opens the shared Advanced
          Performance Analytics modal (same modal used by the student). */}
      <div
        className={`mt-4 rounded-xl border p-2.5 transition-all ${anySkillLow ? "verbo-pay-glow border-destructive/40" : "border-border"}`}
      >
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Overall Skills
          </span>
          <span className="text-[10px] text-muted-foreground">Click for detail</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {macros.map((m) => {
            const Icon = SKILL_ICONS[m.key] ?? Mic;
            const low = m.overall !== null && m.overall < 70;
            return (
              <div
                key={m.key}
                className={`flex flex-col items-center rounded-lg px-1 py-1.5 ${low ? "bg-destructive/5" : "bg-background"}`}
                title={m.key}
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="mt-0.5 text-[11px] font-bold tabular-nums text-foreground">
                  {m.overall === null ? "--" : `${m.overall}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

// ============================================================================
// DETAIL MODAL — read-only, plus the editable coverage-notes text field.
// ============================================================================
function StudentDetailModal({
  student: s, teacherId, onClose,
}: {
  student: User;
  teacherId: string;
  onClose: () => void;
}) {
  const product = getProduct(s.product);
  const isVip = s.product === "vip";
  const productType = s.product_type ?? "performance";

  // Attendance breakdown — shared helper (same source as Admin & Student).
  const attendance = studentAttendance(SESSIONS, s);
  const attPct = attendance.pct;
  const attAlert = attendance.absent > attendance.completed;

  // Shared Advanced Performance Analytics modal.
  const [showAnalytics, setShowAnalytics] = useState(false);
  // Report modal.
  const [showReport, setShowReport] = useState(false);
  const macros = useComputedMacros(s.id);
  const anySkillLow = macros.some((m) => m.overall !== null && m.overall < 70);

  // Coverage notes — persisted per (titular teacher, student) pair.
  const [note, setNote] = useState<string>(() => getCoverageNote(teacherId, s.id));
  const [savedTick, setSavedTick] = useState(false);
  useEffect(() => {
    const unsub = subscribeCoverageNotes(() => setNote(getCoverageNote(teacherId, s.id)));
    return unsub;
  }, [teacherId, s.id]);

  const handleSaveNote = () => {
    setCoverageNote(teacherId, s.id, note);
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1400);
  };

  // Suggested Challenges — reuse the same catalog Admin > Challenges edits.
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  useEffect(() => {
    setChallenges(loadChallenges());
    const unsub = subscribeChallenges(() => setChallenges(loadChallenges()));
    return unsub;
  }, []);

  const challengeProductId: ChallengeProductId | null =
    s.product === "enterprise" || s.product === "go" || s.product === "international" || s.product === "vip"
      ? s.product
      : null;

  const counts = effectiveSessionCounts(s.id, { hired: s.hired_sessions, remaining: s.remaining_sessions });
  const hired = counts.hired;
  const remaining = counts.remaining;
  const used = sessionProgressFor(hired, remaining).done;

  const [openDifficulty, setOpenDifficulty] = useState<(typeof DIFFICULTY_ORDER)[number] | null>(null);

  type DetailTab = "overview" | "progress" | "challenges";
  const [tab, setTab] = useState<DetailTab>("overview");
  const showCourseProgressTab = s.product === "go" || s.product === "enterprise" || s.product === "international";
  const showChallengesTab = !!challengeProductId;

  const tabs: [DetailTab, string][] = [
    ["overview", "Overview"],
    ...(showCourseProgressTab ? [["progress", "Course Progress"] as [DetailTab, string]] : []),
    ...(showChallengesTab ? [["challenges", "Suggested Challenges"] as [DetailTab, string]] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-card p-8 shadow-floating">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Student</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              {s.name}{s.company ? <span className="text-muted-foreground"> · {s.company}</span> : null}
            </h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {product && <Tag className="bg-primary/10 text-primary">{product.name}</Tag>}
              {s.access_plan && <Tag className="bg-accent/10 text-accent">{s.access_plan}</Tag>}
              {s.focus && <Tag className="bg-secondary text-secondary-foreground">{s.focus}</Tag>}
              {(() => {
                const lv = computeCurrentProgress(s.id, s.product, s.contracted_levels ?? [], 0)?.levelName;
                return lv ? <Tag className="bg-muted text-muted-foreground">{lv}</Tag> : null;
              })()}
              {isVip && (
                <Tag className="bg-amber-500/15 text-amber-600">
                  <Crown className="mr-1 h-3 w-3" /> VIP
                </Tag>
              )}
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-1 border-b border-border">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative px-3 py-2 text-sm font-medium transition-colors ${tab === id ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
              {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            {/* --- Sessions balance --- */}
            {productType === "performance" && (
              <section className="mt-6 rounded-xl border border-border border-l-4 border-l-navy-700 bg-background p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5 text-navy-700" /> Sessions balance (current cycle)
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <Stat label="Contracted" value={String(hired)} />
                  <Stat label="Remaining" value={String(remaining)} />
                  <Stat label="Used" value={String(used)} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Use this balance to decide how many sessions to dedicate to Additional Content, Review Session
                  or Casual Topic without compromising the fixed syllabus progression.
                </p>
              </section>
            )}

            {/* --- Cadence (payment info intentionally hidden from teachers) --- */}
            <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MiniStat icon={Repeat} label="Sessions/week" value={s.sessions_per_week ? String(s.sessions_per_week) : "—"} />
              <MiniStat icon={Clock} label="Duration" value={s.session_duration ? `${s.session_duration} min` : "—"} />
            </section>

            {/* --- Overall Attendance --- */}
            <section className={`mt-4 rounded-xl border border-l-4 p-5 ${attAlert ? "border-destructive/50 border-l-destructive verbo-pay-glow" : "border-border border-l-green-500"} bg-background`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <CalendarCheck className={`h-3.5 w-3.5 ${attAlert ? "text-destructive" : "text-green-500"}`} /> Overall Attendance
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">{attPct}%</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat label="Completed" value={String(attendance.completed)} />
                <Stat label="Absences" value={String(attendance.absent)} />
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Attendance % counts Completed vs Absent sessions. Absences with Teacher cause are not counted against the student.
              </p>
            </section>

            {/* --- Overall Skills (opens shared Advanced Performance Analytics modal) --- */}
            <section className="mt-4">
              <button
                type="button"
                onClick={() => setShowAnalytics(true)}
                className={`w-full rounded-xl border border-l-4 p-4 text-left transition-all hover:bg-secondary/40 ${anySkillLow ? "border-destructive/40 border-l-destructive verbo-pay-glow" : "border-border border-l-violet-500"} bg-background`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Layers className={`h-3.5 w-3.5 ${anySkillLow ? "text-destructive" : "text-violet-500"}`} /> Overall Skills
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: "#f38934" }}>View Detailed Analytics →</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {macros.map((m) => {
                    const Icon = SKILL_ICONS[m.key] ?? Mic;
                    const low = m.overall !== null && m.overall < 70;
                    return (
                      <div
                        key={m.key}
                        className={`flex items-center gap-2 rounded-lg px-2 py-2 ${low ? "bg-destructive/5" : "bg-secondary/40"}`}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.key}</div>
                          <div className="text-sm font-bold tabular-nums text-foreground">
                            {m.overall === null ? "--" : `${m.overall}%`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </button>
            </section>

            {/* --- Video call link (read only) --- */}
            {s.video_call_link && (
              <section className="mt-4 flex items-center gap-2 rounded-xl border border-border border-l-4 border-l-accent bg-background p-4 text-sm">
                <Video className="h-4 w-4 text-accent" />
                <span className="text-muted-foreground">Video Call Link:</span>
                <a
                  href={s.video_call_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {s.video_call_link}
                </a>
              </section>
            )}

            {/* --- Coverage notes (editable) --- */}
            <section className="mt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <NotebookPen className="h-3.5 w-3.5" /> Coverage notes
                </div>
                <button
                  type="button"
                  onClick={() => setShowReport(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Flag className="h-3.5 w-3.5" /> Report
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Context for any teacher covering a session for this student.
              </p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Real level, sensitive topics, preferences, what they're working on now…"
                className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                {savedTick && <span className="text-xs text-success">Saved</span>}
                <button
                  onClick={handleSaveNote}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  Save note
                </button>
              </div>
            </section>

            {/* --- VIP Course Builder link --- */}
            {isVip && (
              <section className="mt-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <BookOpenCheck className="h-3.5 w-3.5" /> Course Builder VIP
                </div>
                <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-background p-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">Personalized VIP Course</div>
                    <div className="text-xs text-muted-foreground">
                      Build this student's units week by week.
                    </div>
                  </div>
                  <Link
                    to="/teacher/vip"
                    search={{ student: s.id }}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
                  >
                    <BookOpenCheck className="h-3.5 w-3.5" /> Open Course Builder
                  </Link>
                </div>
              </section>
            )}
          </>
        )}

        {tab === "progress" && showCourseProgressTab && (
          <section className="mt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <BookOpenCheck className="h-3.5 w-3.5" /> Course Progress · Unit access
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Unlock or lock any unit. Milestone units (10, 20, 30) are locked by default until you unlock them.
            </p>
            <div className="mt-3">
              <TeacherUnitAccessPanel student={s} teacherId={teacherId} />
            </div>
          </section>
        )}

        {tab === "challenges" && challengeProductId && (
          <section className="mt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5" /> Suggested Challenges ({product?.name})
            </div>
            <div className="mt-3 space-y-4">
              {/* Difficulty filter cards — only the selected tier expands. */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DIFFICULTY_ORDER.map((diff) => {
                  const count = challengesFor(challenges, challengeProductId, diff).length;
                  const active = openDifficulty === diff;
                  return (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setOpenDifficulty(active ? null : diff)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? "border-accent bg-accent/10"
                          : "border-border bg-background hover:bg-secondary/60"
                      }`}
                    >
                      <div className={`text-sm font-semibold ${active ? "text-accent" : "text-foreground"}`}>
                        {DIFFICULTY_META[diff].label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {count} challenge{count === 1 ? "" : "s"}
                      </div>
                    </button>
                  );
                })}
              </div>

              {openDifficulty && (() => {
                const list = challengesFor(challenges, challengeProductId, openDifficulty);
                if (list.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      No challenges published yet for this difficulty.
                    </p>
                  );
                }
                return (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {list.map((c) => (
                      <div key={c.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-medium text-foreground">{c.title}</div>
                          {c.category && (
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryColor(c.category)}`}>
                              {c.category}
                            </span>
                          )}
                        </div>
                        {c.description && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {!openDifficulty && (
                <p className="text-xs text-muted-foreground">
                  Pick a difficulty above to see its challenges.
                </p>
              )}

              {DIFFICULTY_ORDER.every((d) => challengesFor(challenges, challengeProductId, d).length === 0) && (
                <p className="text-xs text-muted-foreground">
                  No challenges published yet for this product.
                </p>
              )}
            </div>
          </section>
        )}
      </div>


      {showAnalytics && (
        <PerformanceAnalyticsModal
          planTier={s.hired_plan ?? s.access_plan ?? "—"}
          studentId={s.id}
          onClose={() => setShowAnalytics(false)}
        />
      )}
      {showReport && (
        <ReportModal
          student={s}
          teacherId={teacherId}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// REPORT MODAL — free-text report about a student.
//
// Persists (student + teacher + timestamp + text) via student-reports-store.
// TODO: conectar destino del reporte (canal de chat interno o notificación
// por WhatsApp — decisión pendiente).
// ============================================================================
function ReportModal({
  student, teacherId, onClose,
}: {
  student: User;
  teacherId: string;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!text.trim()) return;
    addStudentReport({ studentId: student.id, teacherId, text });
    setSaved(true);
    setTimeout(() => { onClose(); }, 900);
  };

  return (
    <AccentModal
      maxWidth="max-w-lg"
      background="linear-gradient(135deg, #dc0000 0%, #f38934 100%)"
      iconTint="rgba(255,255,255,0.18)"
      icon={Flag}
      eyebrow="Report"
      title={`Report situation · ${student.name}`}
      watermark={{ type: "icon", icon: Flag }}
      onClose={onClose}
    >
      <div className="p-6">
        <p className="text-xs text-muted-foreground">
          Describe a situation observed about this student. The report will be saved
          linked to you as the primary teacher.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="e.g. arrived unmotivated due to work issues, changes to the original goal, etc."
          className="mt-3 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

      </div>
      <AccentModalFooter accent="#dc0000">
        {saved && <span className="mr-auto text-xs text-success">Report saved</span>}
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!text.trim() || saved}
          className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Flag className="h-3.5 w-3.5" /> Save report
        </button>
      </AccentModalFooter>
    </AccentModal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}

function MiniStat({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
}) {
  const toneCls =
    tone === "success" ? "text-success"
    : tone === "warning" ? "text-foreground"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-1 text-sm font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
// ============================================================================
// UNIT ACCESS PANEL — teacher-side unlock/lock for a student's Learning Path.
// Mirrors the Admin > Students Course Progress tab, but authored by the teacher.
// ============================================================================
function TeacherUnitAccessPanel({ student, teacherId }: { student: User; teacherId: string }) {
  const [rev, setRev] = useState(0);
  const [courses, setCourses] = useState(() => loadCourses());
  useEffect(() => {
    setCourses(loadCourses());
    return subscribeCourses(() => { setCourses(loadCourses()); setRev((r) => r + 1); });
  }, []);

  const productMap: Record<string, "go" | "enterprise" | "international"> = {
    go: "go", enterprise: "enterprise", international: "international",
  };
  const productId = student.product ? productMap[student.product] : undefined;
  const product = productId ? courses.find((c) => c.product === productId) : undefined;
  const levels = product?.levels ?? [];
  const initialLevelId = useMemo(() => {
    const match = levels.find((l) => l.name === student.current_roadmap_level);
    return (match ?? levels[0])?.id ?? "";
  }, [levels, student.current_roadmap_level]);
  const [levelId, setLevelId] = useState<string>(initialLevelId);
  useEffect(() => { if (initialLevelId && !levelId) setLevelId(initialLevelId); }, [initialLevelId, levelId]);
  const level: CourseLevel | undefined = levels.find((l) => l.id === levelId) ?? levels[0];

  if (!level) return null;

  const toggle = (unitId: string, nextAction: "unlocked" | "locked") => {
    setUnitAccess(student.id, unitId, nextAction, teacherId, "teacher");
    setRev((r) => r + 1);
  };

  return (
    <div className="space-y-3">
      <select
        value={level.id}
        onChange={(e) => setLevelId(e.target.value)}
        className="w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>

      <div className="max-h-[360px] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-background">
        {level.units.map((u) => {
          const milestone = isMilestoneUnit(u.id);
          const ov = getUnitAccessOverride(student.id, u.id);
          const isUnlocked = ov === "unlocked" || (!milestone && ov === null);
          const stateLabel =
            ov === "unlocked" ? "Unlocked"
            : ov === "locked" ? "Locked"
            : milestone ? "Locked (default)" : "Unlocked (default)";
          const badgeCls =
            ov === "unlocked" ? "bg-success/10 text-success"
            : ov === "locked" ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-muted-foreground";
          const _ = rev; void _;
          return (
            <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10.5px] font-mono text-muted-foreground">{u.id}</span>
                  {milestone && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      <Trophy className="h-3 w-3" /> Milestone
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>{stateLabel}</span>
                </div>
                <div className="mt-0.5 truncate text-sm text-foreground">{u.title}</div>
              </div>
              <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() => toggle(u.id, "unlocked")}
                  aria-pressed={isUnlocked}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors ${isUnlocked ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <UnlockIcon className="h-3 w-3" /> Unlock
                </button>
                <button
                  type="button"
                  onClick={() => toggle(u.id, "locked")}
                  aria-pressed={!isUnlocked}
                  className={`inline-flex items-center gap-1.5 border-l border-border px-2.5 py-1 text-[11px] font-medium transition-colors ${!isUnlocked ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <LockIcon className="h-3 w-3" /> Lock
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
