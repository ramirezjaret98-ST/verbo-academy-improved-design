import { useEffect, useState } from "react";
import { NotebookPen, UserRound, CalendarClock, Video } from "lucide-react";
import { userById } from "@/lib/mock-data";
import { AccentModalHeader, AccentModalFooter, GhostButton, InfoStatRow } from "@/components/verbo/ui";
import type { LessonPlan, LessonSessionType } from "@/lib/lesson-plans-store";
import type { ExtSession } from "@/lib/sessions-store";
import { unitsForStudent, vipUnitDoneMap } from "@/lib/vip-courses-store";
import { tailoredUnitsForStudent, tailoredUnitDoneMap } from "@/lib/tailored-content-store";
import {
  loadCourses,
  PRODUCT_TO_COURSE,
  computeCurrentProgress,
  type CourseLevel,
} from "@/lib/product-courses-store";

const ALL_SESSION_TYPES: LessonSessionType[] = [
  "Syllabus content",
  "Additional Content",
  "Review Session",
  "Casual Topic",
  "Evaluation",
];

export function PlanModal({
  session, existing, onClose, onSave,
}: {
  session: ExtSession;
  existing?: LessonPlan;
  onClose: () => void;
  onSave: (plan: LessonPlan) => void;
}) {
  const student = userById(session.student_id);

  // Real curriculum for this student: filter the product's levels down to
  // the ones the student actually has contracted. This is the SAME logic
  // used by computeCurrentProgress — the modal must never expose CEFR
  // legacy placeholders that don't correspond to what the student paid for.
  const productId = student?.product ? PRODUCT_TO_COURSE[student.product] : undefined;
  const course = productId ? loadCourses().find((c) => c.product === productId) : undefined;
  const contracted = new Set(student?.contracted_levels ?? []);
  const levels: CourseLevel[] = (course?.levels ?? []).filter((l) => contracted.has(l.name));

  // Fallback for the default level selection when the plan is new: point at
  // the level the student is actively progressing through, not the initial
  // diagnostic CEFR band.
  const currentReal = student
    ? computeCurrentProgress(student.id, student.product, student.contracted_levels ?? [], 0)
    : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  // Session Type is intentionally manual, with no default. Teacher autonomy
  // to depart from the fixed syllabus applies even on basic access plans.
  const [type, setType] = useState<LessonSessionType | "">(existing?.type ?? "");
  const [levelId, setLevelId] = useState(
    existing?.level_id ?? (currentReal?.levelId ?? levels[0]?.id ?? ""),
  );
  const [unitId, setUnitId] = useState(existing?.unit_id ?? "");
  const [comments, setComments] = useState(existing?.comments ?? "");
  const [vipUnitId, setVipUnitId] = useState(existing?.vip_unit_id ?? "");
  const [tailoredUnitId, setTailoredUnitId] = useState(existing?.tailored_unit_id ?? "");

  const isVip = student?.product === "vip";
  const vipUnits = isVip ? unitsForStudent(student!.id) : [];
  const vipDone = isVip ? vipUnitDoneMap() : {};

  // Tailored Content is exclusive to Elite access_plan. If a student is
  // somehow both VIP (product) and Elite (access_plan), VIP takes priority
  // and Tailored Content is not offered on top.
  const isElite = !isVip && student?.access_plan === "Elite";
  const tailoredUnits = isElite ? tailoredUnitsForStudent(student!.id) : [];
  const tailoredDone = isElite ? tailoredUnitDoneMap() : {};

  const sessionTypes = isVip
    ? ALL_SESSION_TYPES.filter((t) => t !== "Syllabus content")
    : ALL_SESSION_TYPES;

  // VIP students never use the fixed Performance Sessions syllabus, so reset
  // any stale Syllabus content selection when the modal opens for a VIP.
  useEffect(() => {
    if (isVip && type === "Syllabus content") {
      setType("");
    }
  }, [isVip]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLevelUnit = type === "Syllabus content" || type === "Evaluation";
  const currentLevel = levels.find((l) => l.id === levelId);
  const hasCurriculum = levels.length > 0;

  useEffect(() => {
    // Reset unit when level changes if missing
    if (showLevelUnit && currentLevel && !currentLevel.units.find((u) => u.id === unitId)) {
      setUnitId(currentLevel.units[0]?.id ?? "");
    }
  }, [levelId, showLevelUnit]); // eslint-disable-line react-hooks/exhaustive-deps


  const submit = () => {
    if (!title.trim()) { alert("Please enter a session title."); return; }
    if (!type) { alert("Please pick a Session Type."); return; }
    if (showLevelUnit && (!levelId || !unitId)) { alert("Please select a level and unit."); return; }
    const gap = +new Date(session.date_time) - Date.now();
    const planning_status: LessonPlan["planning_status"] = gap < 5 * 24 * 3_600_000 ? "late" : "on-time";
    onSave({
      session_id: session.id,
      title: title.trim(),
      type: type as LessonSessionType,
      level_id: showLevelUnit ? levelId : undefined,
      unit_id: showLevelUnit ? unitId : undefined,
      vip_unit_id: isVip && vipUnitId ? vipUnitId : undefined,
      tailored_unit_id: isElite && tailoredUnitId ? tailoredUnitId : undefined,
      comments: comments.trim(),
      planning_status,
      saved_at: new Date().toISOString(),
    });
  };

  const inputCls = "mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
  const readOnlyCls = "mt-1.5 w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed";

  const NAVY = "#01304a";

  return (
    <div className="verbo-overlay-in fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-card shadow-floating">
        <div className="shrink-0">
        <AccentModalHeader
          background={NAVY}
          iconTint={NAVY}
          icon={NotebookPen}
          eyebrow={student?.access_plan ? `Performance Sessions · Access Plan ${student.access_plan}` : "Performance Sessions"}
          title="Lesson Plan"
          watermark={{ type: "icon", icon: NotebookPen }}
          onClose={onClose}
        />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
        <p className="text-xs text-muted-foreground">
          Prepare the pedagogical plan. Saved plans move the session from
          Scheduled to Ready in the calendar. Aim to save ≥5 days before the session for on-time planning.
        </p>

        {/* Read-only context */}
        <div className="mt-4">
          <InfoStatRow
            items={[
              { icon: UserRound, value: student?.name ?? "—", label: "Student", tint: NAVY },
              { icon: CalendarClock, value: new Date(session.date_time).toLocaleString(), label: "Date & Time", tint: NAVY },
              { icon: Video, value: session.teams_link ? "Ready" : "—", label: "MS Teams Link", tint: NAVY },
            ]}
          />
        </div>

        <div className="my-5 h-px bg-border" />

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground">Session Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Workplace small talk practice"
              className={inputCls}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Session Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as LessonSessionType)} className={`${inputCls} cursor-pointer`}>
              <option value="" disabled>— Pick a type —</option>
              {sessionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Pick every time. There is no default: it is your professional autonomy to step off the syllabus when that adds more value.
            </p>
          </div>

          {showLevelUnit ? (
            hasCurriculum ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-foreground">Select Level</label>
                  <select value={levelId} onChange={(e) => setLevelId(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Select Unit</label>
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    {currentLevel?.units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <select disabled className={readOnlyCls}>
                <option>No curriculum found for this student</option>
              </select>
            )
          ) : type ? (
            <p className="rounded-lg border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Level and Unit only apply to <strong>Syllabus content</strong> or <strong>Evaluation</strong>.
              For this Session Type, only Teacher's comments are needed.
            </p>
          ) : null}

          {isVip && (
            <div>
              <label className="text-xs font-medium text-foreground">Link to VIP Unit</label>
              <select
                value={vipUnitId}
                onChange={(e) => setVipUnitId(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">— None —</option>
                {vipUnits.map((u, i) => (
                  <option key={u.id} value={u.id}>
                    Unit {i + 1} · {u.title}{vipDone[u.id] ? " (Done)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional. When this session is marked <strong>Completed</strong> in the Session Report,
                the linked VIP unit will be marked done and the next unit will unlock automatically.
              </p>
            </div>
          )}

          {isElite && (
            <div>
              <label className="text-xs font-medium text-foreground">Link to Tailored Content unit</label>
              <select
                value={tailoredUnitId}
                onChange={(e) => setTailoredUnitId(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">— None —</option>
                {tailoredUnits.map((u, i) => (
                  <option key={u.id} value={u.id}>
                    Unit {i + 1} · {u.title}{tailoredDone[u.id] ? " (Done)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional. When this session is marked <strong>Completed</strong> in the Session Report,
                the linked Tailored Content unit will be marked done and the next unit will unlock automatically.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-foreground">Teacher's comments and instructions</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              placeholder="Add goals, vocabulary focus, prep notes for the student…"
              className={inputCls}
            />
          </div>
        </div>

        </div>

        <AccentModalFooter>
          <GhostButton onClick={onClose} className="cursor-pointer">Cancel</GhostButton>
          <button
            onClick={submit}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#f38934" }}
          >
            Save Lesson Plan
          </button>
        </AccentModalFooter>
      </div>
    </div>
  );
}
