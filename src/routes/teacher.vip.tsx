// Teacher > Course Builder VIP — READ ONLY since the 2026-08-12 permission
// revert: Admin manages all VIP content (units, video, files, course card,
// activities). Teacher keeps this view to plan sessions, but every
// create/edit/delete/bulk-upload control lives at /admin/vip now (also
// enforced server-side via RLS, not just hidden here).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { USERS } from "@/lib/mock-data";
import { hydrateStudents, subscribeStudents } from "@/lib/students-store";
import { assignedStudentIdsFor, hydrateAssignments, subscribeAssignments } from "@/lib/assignments-store";
import {
  unitsForStudent, subscribeVipUnits, subscribeVipUnitCompletion, vipUnitDoneMap,
} from "@/lib/vip-courses-store";
import { courseMetaFor, subscribeCourseMeta } from "@/lib/custom-course-meta-store";
import { loadSessions, subscribeSessions } from "@/lib/sessions-store";
import { ActivityViewModal, type ModalAccent } from "@/components/verbo/course-modals";
import { Card, GhostButton, Pill } from "@/components/verbo/ui";
import { loadActivities, subscribeActivities } from "@/lib/activities-store";
import { customUnitAccessOverride, resolveCustomUnitUnlock, teacherSetCustomUnitFile } from "@/lib/custom-units-store";
import { UnitPdfModal } from "@/components/verbo/UnitPdfManager";
import {
  Crown, ArrowLeft, Sparkles, Lock, Unlock, FileDown, CheckCircle2, Video, ImageIcon, LayoutGrid, Pencil,
} from "lucide-react";

export const Route = createFileRoute("/teacher/vip")({
  component: Page,
  validateSearch: (s: Record<string, unknown>) => ({
    student: typeof s.student === "string" ? s.student : undefined,
  }),
});

function Page() {
  const { user } = useAuth();
  const { student: studentId } = Route.useSearch();
  const navigate = useNavigate();
  const [, tick] = useState(0);

  useEffect(() => {
    hydrateStudents();
    tick((n) => n + 1);
    const unsubS = subscribeStudents(() => tick((n) => n + 1));
    const unsubV = subscribeVipUnits(() => tick((n) => n + 1));
    const unsubX = subscribeSessions(() => tick((n) => n + 1));
    const unsubC = subscribeVipUnitCompletion(() => tick((n) => n + 1));
    const unsubM = subscribeCourseMeta(() => tick((n) => n + 1));
    const unsubO = subscribeActivities(() => tick((n) => n + 1)); // unit_access_events overrides
    hydrateAssignments();
    const unsubA = subscribeAssignments(() => tick((n) => n + 1));
    return () => { unsubS(); unsubV(); unsubX(); unsubC(); unsubM(); unsubO(); unsubA(); };
  }, []);

  if (!user) return null;

  const assignedIds = assignedStudentIdsFor(user.id);
  const vipStudents = USERS.filter(
    (u) => u.role === "student" && assignedIds.includes(u.id) && u.product === "vip",
  );

  if (studentId) {
    const student = vipStudents.find((s) => s.id === studentId);
    if (!student) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => navigate({ to: "/teacher/vip", search: () => ({ student: undefined }) })}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to VIP students
          </button>
          <Card>Student not found or not a VIP student assigned to you.</Card>
        </div>
      );
    }
    return <StudentView studentId={student.id} studentName={student.name} onBack={() => navigate({ to: "/teacher/vip", search: () => ({ student: undefined }) })} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Course Builder VIP</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalized courses for your VIP students — view only. Admin manages the content.
        </p>
      </div>

      {vipStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
          <Crown className="mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-foreground">No VIP students assigned yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">This tab activates when a VIP student is assigned to you.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {vipStudents.map((s) => {
            const units = unitsForStudent(s.id);
            const doneMap = vipUnitDoneMap();
            const doneCount = units.filter((u) => doneMap[u.id]).length;
            return (
              <button
                key={s.id}
                onClick={() => navigate({ to: "/teacher/vip", search: { student: s.id } })}
                className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-soft verbo-lift hover:shadow-elevated"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {s.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{s.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                    <Crown className="h-3 w-3" /> VIP
                  </span>
                  <Pill tone={units.length ? "success" : "muted"}>
                    {units.length} {units.length === 1 ? "unit" : "units"} built
                  </Pill>
                  {units.length > 0 && (
                    <Pill tone={doneCount === units.length ? "success" : "muted"}>
                      {doneCount}/{units.length} done
                    </Pill>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const VIP_ACCENT: ModalAccent = {
  background: "linear-gradient(135deg, #f38934 0%, #c2410c 100%)",
  solid: "#f38934",
  icon: Crown,
  eyebrow: "VIP Course Builder",
};

function StudentView({ studentId, studentName, onBack }: {
  studentId: string; studentName: string; onBack: () => void;
}) {
  const { user } = useAuth();
  const canManagePdfs = !!user?.can_manage_unit_pdfs;
  const [actModalUnit, setActModalUnit] = useState<{ unitId: string; unitTitle: string } | null>(null);
  const [pdfModalUnit, setPdfModalUnit] = useState<{ id: string; title: string; file_url: string; file_name?: string } | null>(null);
  const [rev, setRev] = useState(0);

  const units = useMemo(() => unitsForStudent(studentId), [studentId, rev]);
  const allActivities = useMemo(() => loadActivities(), [rev]);
  const doneMap = useMemo(() => vipUnitDoneMap(), [studentId, rev]);
  const sessions = useMemo(() => loadSessions(), [rev]);
  const courseMeta = useMemo(() => courseMetaFor("vip", studentId), [studentId, rev]);
  const doneCount = units.filter((u) => doneMap[u.id]).length;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to VIP students
      </button>

      <div className="flex items-center gap-4">
        {courseMeta.cover_image ? (
          <img src={courseMeta.cover_image} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{studentName} · {courseMeta.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {units.length} {units.length === 1 ? "unit" : "units"} · {doneCount}/{units.length} done.
            Units are marked done via the Session Report of the linked Performance Session.
          </p>
        </div>
      </div>

      <Card className="!p-0">
        {units.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No units yet — Admin hasn't built this course.
          </div>
        )}
        {units.map((u, i) => {
          const count = allActivities.filter((a) => a.unit_id === u.id).length;
          const done = !!doneMap[u.id];
          const prevDone = i === 0 || !!doneMap[units[i - 1].id];
          const override = customUnitAccessOverride(studentId, u.id);
          const unlocked = resolveCustomUnitUnlock(done, prevDone, override);
          const doneRec = doneMap[u.id];
          const doneSession = doneRec ? sessions.find((s) => s.id === doneRec.session_id) : undefined;
          return (
            <div key={u.id} className={`flex items-center justify-between gap-4 px-6 py-4 ${i ? "border-t border-border" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Unit {i + 1}</span>
                  {u.block && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
                      <LayoutGrid className="h-3 w-3" /> {u.block}
                    </span>
                  )}
                  {done ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </span>
                  ) : unlocked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                      <Unlock className="h-3 w-3" /> {override === "unlocked" ? "Unlocked by admin" : "Unlocked"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Lock className="h-3 w-3" /> {override === "locked" ? "Locked by admin" : "Locked until previous unit completed"}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground truncate">{u.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {u.video_url && (
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <Video className="h-3 w-3" /> Video attached
                    </span>
                  )}
                  {u.file_url ? (
                    <a
                      href={u.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <FileDown className="h-3 w-3" /> {u.file_name || "Download file"}
                    </a>
                  ) : (
                    <span className="italic">No file attached</span>
                  )}
                  <span>•</span>
                  <Pill tone={count ? "success" : "muted"}>{count} {count === 1 ? "activity" : "activities"}</Pill>
                  {done && doneSession && (
                    <>
                      <span>•</span>
                      <span className="text-[11px] text-muted-foreground">
                        via session {new Date(doneSession.date_time).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canManagePdfs && (
                  <GhostButton onClick={() => setPdfModalUnit({ id: u.id, title: u.title, file_url: u.file_url, file_name: u.file_name })}>
                    <Pencil className="h-3.5 w-3.5" /> PDF
                  </GhostButton>
                )}
                <GhostButton onClick={() => setActModalUnit({ unitId: u.id, unitTitle: u.title })}>
                  <Sparkles className="h-3.5 w-3.5" /> Activities
                </GhostButton>
              </div>
            </div>
          );
        })}
      </Card>

      {actModalUnit && (
        <ActivityViewModal
          unitId={actModalUnit.unitId}
          unitTitle={actModalUnit.unitTitle}
          accent={VIP_ACCENT}
          onClose={() => { setActModalUnit(null); setRev((r) => r + 1); }}
        />
      )}
      {pdfModalUnit && (
        <UnitPdfModal
          unitTitle={pdfModalUnit.title}
          target={{ kind: "custom", customKind: "vip", unitId: pdfModalUnit.id, currentUrl: pdfModalUnit.file_url, currentFileName: pdfModalUnit.file_name }}
          onClose={() => { setPdfModalUnit(null); setRev((r) => r + 1); }}
          onSave={(url, fileName) => teacherSetCustomUnitFile("vip", pdfModalUnit.id, url, fileName)}
        />
      )}
    </div>
  );
}
