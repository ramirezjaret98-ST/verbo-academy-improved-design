import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ASSIGNMENTS, USERS } from "@/lib/mock-data";
import { hydrateStudents, subscribeStudents } from "@/lib/students-store";
import {
  tailoredUnitsForStudent, addTailoredUnit, updateTailoredUnit, removeTailoredUnit,
  subscribeTailoredUnits, subscribeTailoredUnitCompletion, tailoredUnitDoneMap,
  type TailoredUnit,
} from "@/lib/tailored-content-store";
import { loadSessions, subscribeSessions } from "@/lib/sessions-store";
import { uploadContentFile } from "@/lib/content-uploads";
import { loadLessonPlans, subscribeLessonPlans } from "@/lib/lesson-plans-store";
import {
  BulkUploadUnitsModal, Field, ModalFooter, ModalShell, inputCls,
  type ModalAccent,
} from "@/components/verbo/course-modals";
import { Card, GhostButton, PrimaryButton, Pill } from "@/components/verbo/ui";
import {
  Plus, Sparkles, ArrowLeft, Pencil, Trash2, Lock, Unlock,
  FileDown, Link2, Upload, CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/teacher/tailored-content")({
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
    const unsubT = subscribeTailoredUnits(() => tick((n) => n + 1));
    const unsubX = subscribeSessions(() => tick((n) => n + 1));
    const unsubC = subscribeTailoredUnitCompletion(() => tick((n) => n + 1));
    const unsubP = subscribeLessonPlans(() => tick((n) => n + 1));
    return () => { unsubS(); unsubT(); unsubX(); unsubC(); unsubP(); };
  }, []);

  if (!user) return null;

  const assignedIds = ASSIGNMENTS.filter((a) => a.teacher_id === user.id).map((a) => a.student_id);
  const eliteStudents = USERS.filter(
    (u) => u.role === "student" && assignedIds.includes(u.id) && u.access_plan === "Elite",
  );

  if (studentId) {
    const student = eliteStudents.find((s) => s.id === studentId);
    if (!student) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => navigate({ to: "/teacher/tailored-content", search: () => ({ student: undefined }) })}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Elite students
          </button>
          <Card>Student not found or not an Elite student assigned to you.</Card>
        </div>
      );
    }
    return (
      <StudentBuilder
        studentId={student.id}
        studentName={student.name}
        onBack={() => navigate({ to: "/teacher/tailored-content", search: () => ({ student: undefined }) })}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tailored Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalized units for your Elite students, added on top of their regular syllabus.
        </p>
      </div>

      {eliteStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
          <Sparkles className="mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-foreground">No Elite students assigned yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">This tab activates when an Elite student is assigned to you.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {eliteStudents.map((s) => {
            const units = tailoredUnitsForStudent(s.id);
            const doneMap = tailoredUnitDoneMap();
            const doneCount = units.filter((u) => doneMap[u.id]).length;
            return (
              <button
                key={s.id}
                onClick={() => navigate({ to: "/teacher/tailored-content", search: { student: s.id } })}
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
                    <Sparkles className="h-3 w-3" /> Elite
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

function StudentBuilder({ studentId, studentName, onBack }: {
  studentId: string; studentName: string; onBack: () => void;
}) {
  const [unitModal, setUnitModal] = useState<{ mode: "create" | "edit"; unit?: TailoredUnit } | null>(null);
  const [rev, setRev] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);

  const units = useMemo(() => tailoredUnitsForStudent(studentId), [studentId, rev, unitModal]);
  const doneMap = useMemo(() => tailoredUnitDoneMap(), [studentId, rev, unitModal]);
  const sessions = useMemo(() => loadSessions(), [studentId, rev, unitModal]);
  const doneCount = units.filter((u) => doneMap[u.id]).length;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Elite students
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {studentName} · Tailored Content
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {units.length} {units.length === 1 ? "unit" : "units"} built · {doneCount}/{units.length} done.
            Units are marked done via the Session Report of the linked Performance Session.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton onClick={() => setBulkOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Bulk Upload
          </GhostButton>
          <PrimaryButton onClick={() => setUnitModal({ mode: "create" })}>
            <Plus className="h-3.5 w-3.5" /> Add Unit
          </PrimaryButton>
        </div>
      </div>

      <Card className="!p-0">
        {units.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No units yet. Click “+ Add Unit” to build the first one.
          </div>
        )}
        {units.map((u, i) => {
          const done = !!doneMap[u.id];
          const prevDone = i === 0 || !!doneMap[units[i - 1].id];
          const unlocked = done || prevDone;
          const doneRec = doneMap[u.id];
          const doneSession = doneRec ? sessions.find((s) => s.id === doneRec.session_id) : undefined;
          return (
            <div key={u.id} className={`flex items-center justify-between gap-4 px-6 py-4 ${i ? "border-t border-border" : ""}`}>
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
                <button
                  onClick={() => setUnitModal({ mode: "edit", unit: u })}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-accent"
                  aria-label="Edit unit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete unit “${u.title}”?`)) {
                      removeTailoredUnit(u.id);
                      setRev((r) => r + 1);
                    }
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                  aria-label="Delete unit"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </Card>

      {bulkOpen && (
        <BulkUploadUnitsModal
          kind="tailored"
          studentId={studentId}
          unitLabel="Tailored unit"
          onClose={() => { setBulkOpen(false); setRev((r) => r + 1); }}
          onImported={() => setRev((r) => r + 1)}
        />
      )}
      {unitModal && (
        <TailoredUnitModal
          editingUnit={unitModal.mode === "edit" ? unitModal.unit : undefined}
          onClose={() => setUnitModal(null)}
          onCreate={(title, fileUrl, fileName) => {
            addTailoredUnit(studentId, title, fileUrl, fileName);
            setUnitModal(null);
          }}
          onUpdate={(id, title, fileUrl, fileName) => {
            updateTailoredUnit(id, { title, file_url: fileUrl, file_name: fileName });
            setUnitModal(null);
          }}
        />
      )}
    </div>
  );
}

const TAILORED_ACCENT: ModalAccent = {
  background: "linear-gradient(135deg, #f38934 0%, #7c2d12 100%)",
  solid: "#f38934",
  icon: Sparkles,
  eyebrow: "Tailored Content",
};

function TailoredUnitModal({ editingUnit, onClose, onCreate, onUpdate }: {
  editingUnit?: TailoredUnit;
  onClose: () => void;
  onCreate: (title: string, fileUrl: string, fileName?: string) => void;
  onUpdate: (id: string, title: string, fileUrl: string, fileName?: string) => void;
}) {
  const isEdit = !!editingUnit;
  const [title, setTitle] = useState(isEdit ? editingUnit!.title : "");
  const [fileUrl, setFileUrl] = useState(isEdit ? editingUnit!.file_url : "");
  const [fileName, setFileName] = useState(isEdit ? (editingUnit!.file_name ?? "") : "");
  const [source, setSource] = useState<"url" | "upload">("url");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const res = await uploadContentFile(file, "tailored-units");
    setUploading(false);
    if (!res.ok) { setUploadError(res.error); return; }
    setFileUrl(res.url);
    setFileName(res.fileName);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    if (isEdit) onUpdate(editingUnit!.id, title.trim(), fileUrl.trim(), fileName.trim() || undefined);
    else onCreate(title.trim(), fileUrl.trim(), fileName.trim() || undefined);
  };

  return (
    <ModalShell
      title={isEdit ? "Edit Unit" : "New Unit"}
      subtitle={isEdit ? "Update this unit." : "Name this unit's topic and attach the downloadable material."}
      accent={TAILORED_ACCENT}
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        <Field label="Unit Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Investor pitch practice" />
        </Field>

        <Field label="Downloadable File">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSource("url")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${source === "url" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Link2 className="h-4 w-4" /> File URL
            </button>
            <button
              type="button"
              onClick={() => setSource("upload")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${source === "upload" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Upload className="h-4 w-4" /> Upload File
            </button>
          </div>
          {source === "url" ? (
            <input
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              className={`${inputCls} mt-2`}
              placeholder="e.g., https://cloud.storage/... or public document link"
            />
          ) : (
            <div className="mt-2 space-y-1.5">
              <label className="flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : fileName || "Click to upload a file"}
                <input type="file" className="sr-only" disabled={uploading} onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            </div>
          )}
        </Field>

        <Field label="File Label" hint="Optional. Shown as the download link text.">
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} className={inputCls} placeholder="e.g., Unit 1 – Study Guide.pdf" />
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton disabled={!title.trim() || uploading} onClick={handleSave}>
          {isEdit ? "Save Changes" : "Create Unit"}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
