// Shared Admin builder for VIP Course Builder + Tailored Content.
//
// Redesign confirmed with Jaret 2026-08-12: Admin manages ALL VIP/Tailored
// content (units + activities + the student-facing course card); Teacher is
// read-only (see teacher.vip.tsx / teacher.tailored-content.tsx). Both kinds
// share the exact same shape (custom_units, distinguished by `kind`), so one
// component drives both /admin/vip and /admin/tailored-content — only the
// cosmetic config (labels, accent, which students qualify) differs per route.
//
// New in this redesign vs. the old teacher-side builder:
// - A course-card editor (title + cover image) per student, via
//   custom-course-meta-store — the landing card the student clicks into.
// - An optional Video field on each unit (custom_units.video_url) alongside
//   the existing downloadable file — never required, per the 2026-08-12
//   decision not to force the institutional catalog's rigid fields.
// - An optional free-text "Block" label per unit (custom_units.block) so
//   Admin can group units into sections without a fixed 3x10 structure.
// - The Activities button is now available for Tailored too (previously
//   only VIP had it — Tailored units had no way to attach activities at all).
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Plus, ArrowLeft, Pencil, Trash2, Lock, Unlock, FileDown, Link2, Upload,
  CheckCircle2, Sparkles, ImageIcon, Video, LayoutGrid,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { USERS, type User } from "@/lib/mock-data";
import { hydrateStudents, subscribeStudents } from "@/lib/students-store";
import { loadSessions, subscribeSessions } from "@/lib/sessions-store";
import { uploadContentFile } from "@/lib/content-uploads";
import { subscribeLessonPlans } from "@/lib/lesson-plans-store";
import {
  type CustomUnit,
  type CustomUnitKind,
  customUnitsForStudent,
  addCustomUnit,
  updateCustomUnit,
  removeCustomUnit,
  subscribeCustomUnits,
  subscribeCompletion,
  readCompletionMap,
} from "@/lib/custom-units-store";
import {
  type CustomCourseMeta,
  courseMetaFor,
  saveCourseMeta,
  subscribeCourseMeta,
} from "@/lib/custom-course-meta-store";
import {
  ActivityModal, BulkUploadUnitsModal, Field, ModalFooter, ModalShell, inputCls,
  type ModalAccent,
} from "@/components/verbo/course-modals";
import { Card, GhostButton, PrimaryButton, Pill } from "@/components/verbo/ui";
import { loadActivities } from "@/lib/activities-store";

export interface CustomUnitAdminConfig {
  kind: CustomUnitKind;
  pageTitle: string;
  pageSubtitle: string;
  listEmptyTitle: string;
  listEmptySubtitle: string;
  backToListLabel: string;
  studentBadgeLabel: string;
  studentBadgeIcon: LucideIcon;
  unitLabel: string; // "VIP unit" / "Tailored unit"
  uploadFolder: string; // "vip-units" / "tailored-units"
  coverUploadFolder: string; // "vip-course-cover" / "tailored-course-cover"
  accent: ModalAccent;
  matchesStudent: (u: User) => boolean;
}

/** Routing stays in each literal route file (admin.vip.tsx /
 *  admin.tailored-content.tsx) so TanStack Router's file-based codegen keeps
 *  working normally — this component is purely presentational/logic and
 *  takes the current student selection + navigation callbacks as props. */
export function CustomUnitAdminPage({ config, studentId, onSelectStudent, onBack }: {
  config: CustomUnitAdminConfig;
  studentId?: string;
  onSelectStudent: (id: string) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [, tick] = useState(0);

  useEffect(() => {
    hydrateStudents();
    tick((n) => n + 1);
    const unsubS = subscribeStudents(() => tick((n) => n + 1));
    const unsubU = subscribeCustomUnits(() => tick((n) => n + 1));
    const unsubM = subscribeCourseMeta(() => tick((n) => n + 1));
    return () => { unsubS(); unsubU(); unsubM(); };
  }, []);

  if (!user) return null;

  const students = USERS.filter((u) => u.role === "student" && config.matchesStudent(u));

  if (studentId) {
    const student = students.find((s) => s.id === studentId);
    if (!student) {
      return (
        <div className="space-y-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {config.backToListLabel}
          </button>
          <Card>Student not found for this section.</Card>
        </div>
      );
    }
    return (
      <StudentBuilder
        config={config}
        studentId={student.id}
        studentName={student.name}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{config.pageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{config.pageSubtitle}</p>
      </div>

      {students.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
          <config.studentBadgeIcon className="mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-foreground">{config.listEmptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{config.listEmptySubtitle}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {students.map((s) => {
            const units = customUnitsForStudent(config.kind, s.id);
            const doneMap = readCompletionMap(config.kind);
            const doneCount = units.filter((u) => doneMap[u.id]).length;
            return (
              <button
                key={s.id}
                onClick={() => onSelectStudent(s.id)}
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
                    <config.studentBadgeIcon className="h-3 w-3" /> {config.studentBadgeLabel}
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

/* ---------------------------------------------------------------------- */
/* Per-student builder                                                     */
/* ---------------------------------------------------------------------- */
function StudentBuilder({ config, studentId, studentName, onBack }: {
  config: CustomUnitAdminConfig;
  studentId: string;
  studentName: string;
  onBack: () => void;
}) {
  const [unitModal, setUnitModal] = useState<{ mode: "create" | "edit"; unit?: CustomUnit } | null>(null);
  const [actModalUnit, setActModalUnit] = useState<{ unitId: string; unitTitle: string } | null>(null);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [rev, setRev] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    const unsubC = subscribeCompletion(config.kind, () => setRev((r) => r + 1));
    const unsubP = subscribeLessonPlans(() => setRev((r) => r + 1));
    const unsubX = subscribeSessions(() => setRev((r) => r + 1));
    return () => { unsubC(); unsubP(); unsubX(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.kind]);

  const units = useMemo(() => customUnitsForStudent(config.kind, studentId), [config.kind, studentId, rev, unitModal]);
  const allActivities = useMemo(() => loadActivities(), [rev, unitModal]);
  const doneMap = useMemo(() => readCompletionMap(config.kind), [config.kind, rev, unitModal]);
  const sessions = useMemo(() => loadSessions(), [rev, unitModal]);
  const courseMeta = useMemo(() => courseMetaFor(config.kind, studentId), [config.kind, studentId, rev]);
  const doneCount = units.filter((u) => doneMap[u.id]).length;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {config.backToListLabel}
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {courseMeta.cover_image ? (
            <img src={courseMeta.cover_image} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{studentName}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              "{courseMeta.title}" · {units.length} {units.length === 1 ? "unit" : "units"} built · {doneCount}/{units.length} done.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton onClick={() => setCardModalOpen(true)}>
            <ImageIcon className="h-3.5 w-3.5" /> Course Card
          </GhostButton>
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
            No units yet. Click "+ Add Unit" to build the first one.
          </div>
        )}
        {units.map((u, i) => {
          const count = allActivities.filter((a) => a.unit_id === u.id).length;
          const done = !!doneMap[u.id];
          const prevDone = i === 0 || !!doneMap[units[i - 1].id];
          const unlocked = done || prevDone;
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
                <PrimaryButton onClick={() => setActModalUnit({ unitId: u.id, unitTitle: u.title })}>
                  <Sparkles className="h-3.5 w-3.5" /> Activities
                </PrimaryButton>
                <button
                  onClick={() => setUnitModal({ mode: "edit", unit: u })}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#f38934]"
                  aria-label="Edit unit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete unit "${u.title}"? This does not delete its activities.`)) {
                      removeCustomUnit(config.kind, u.id);
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
          kind={config.kind}
          studentId={studentId}
          unitLabel={config.unitLabel}
          onClose={() => { setBulkOpen(false); setRev((r) => r + 1); }}
          onImported={() => setRev((r) => r + 1)}
        />
      )}
      {unitModal && (
        <CustomUnitModal
          config={config}
          editingUnit={unitModal.mode === "edit" ? unitModal.unit : undefined}
          onClose={() => setUnitModal(null)}
          onCreate={(title, fileUrl, fileName, videoUrl, block) => {
            addCustomUnit(config.kind, studentId, title, fileUrl, fileName, videoUrl, block);
            setUnitModal(null);
          }}
          onUpdate={(id, title, fileUrl, fileName, videoUrl, block) => {
            updateCustomUnit(config.kind, id, {
              title, file_url: fileUrl, file_name: fileName, video_url: videoUrl, block,
            });
            setUnitModal(null);
          }}
        />
      )}
      {actModalUnit && (
        <ActivityModal
          unitId={actModalUnit.unitId}
          unitTitle={actModalUnit.unitTitle}
          accent={config.accent}
          onClose={() => { setActModalUnit(null); setRev((r) => r + 1); }}
        />
      )}
      {cardModalOpen && (
        <CourseCardModal
          config={config}
          studentId={studentId}
          meta={courseMeta}
          onClose={() => setCardModalOpen(false)}
          onSaved={() => { setCardModalOpen(false); setRev((r) => r + 1); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Course card modal — title + cover image, the student's landing card    */
/* ---------------------------------------------------------------------- */
function CourseCardModal({ config, studentId, meta, onClose, onSaved }: {
  config: CustomUnitAdminConfig;
  studentId: string;
  meta: CustomCourseMeta;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(meta.title);
  const [cover, setCover] = useState(meta.cover_image ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError("");
    const res = await uploadContentFile(file, config.coverUploadFolder);
    setUploading(false);
    if (!res.ok) { setError(res.error); return; }
    setCover(res.url);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const result = await saveCourseMeta(config.kind, studentId, { title: title.trim(), cover_image: cover || null });
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    onSaved();
  };

  return (
    <ModalShell
      title="Course Card"
      subtitle="Shown to the student as the entry point to their units — title and cover image."
      accent={config.accent}
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        <Field label="Course Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. My VIP Course" />
        </Field>
        <Field label="Cover Image" hint="Optional. Shown behind the title on the student's course card.">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center">
            {cover ? (
              <img src={cover} alt="Cover preview" className="mb-2 h-28 w-full max-w-xs rounded-lg object-cover" />
            ) : (
              <ImageIcon className="mb-2 h-7 w-7 text-muted-foreground" />
            )}
            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary">
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : cover ? "Replace image" : "Choose an image"}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={uploading} onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
          </div>
          {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose} disabled={saving}>Cancel</GhostButton>
        <PrimaryButton disabled={!title.trim() || uploading || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------------- */
/* Unit modal — title, optional block/section, optional video, file       */
/* ---------------------------------------------------------------------- */
function CustomUnitModal({ config, editingUnit, onClose, onCreate, onUpdate }: {
  config: CustomUnitAdminConfig;
  editingUnit?: CustomUnit;
  onClose: () => void;
  onCreate: (title: string, fileUrl: string, fileName: string | undefined, videoUrl: string | undefined, block: string | undefined) => void;
  onUpdate: (id: string, title: string, fileUrl: string, fileName: string | undefined, videoUrl: string | undefined, block: string | undefined) => void;
}) {
  const isEdit = !!editingUnit;
  const [title, setTitle] = useState(isEdit ? editingUnit!.title : "");
  const [block, setBlock] = useState(isEdit ? editingUnit!.block ?? "" : "");
  const [fileUrl, setFileUrl] = useState(isEdit ? editingUnit!.file_url : "");
  const [fileName, setFileName] = useState(isEdit ? editingUnit!.file_name ?? "" : "");
  const [fileSource, setFileSource] = useState<"url" | "upload">("url");
  const [videoUrl, setVideoUrl] = useState(isEdit ? editingUnit!.video_url ?? "" : "");
  const [videoSource, setVideoSource] = useState<"url" | "upload">("url");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [fileError, setFileError] = useState("");
  const [videoError, setVideoError] = useState("");

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploadingFile(true);
    setFileError("");
    const res = await uploadContentFile(file, config.uploadFolder);
    setUploadingFile(false);
    if (!res.ok) { setFileError(res.error); return; }
    setFileUrl(res.url);
    setFileName(res.fileName);
  };

  const handleVideoFile = async (file?: File) => {
    if (!file) return;
    setUploadingVideo(true);
    setVideoError("");
    const res = await uploadContentFile(file, `${config.uploadFolder}-video`);
    setUploadingVideo(false);
    if (!res.ok) { setVideoError(res.error); return; }
    setVideoUrl(res.url);
  };

  const handleSave = () => {
    if (!title.trim()) return;
    const t = title.trim();
    const fu = fileUrl.trim();
    const fn = fileName.trim() || undefined;
    const vu = videoUrl.trim() || undefined;
    const bl = block.trim() || undefined;
    if (isEdit) onUpdate(editingUnit!.id, t, fu, fn, vu, bl);
    else onCreate(t, fu, fn, vu, bl);
  };

  return (
    <ModalShell
      title={isEdit ? "Edit Unit" : "New Unit"}
      subtitle={isEdit ? "Update this unit. Activities remain untouched." : "Name this unit and attach video and/or a downloadable file."}
      accent={config.accent}
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        <Field label="Unit Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Board meeting vocabulary" />
        </Field>

        <Field label="Block / Section" hint="Optional. Groups units on the student's screen — leave blank for a flat list.">
          <input value={block} onChange={(e) => setBlock(e.target.value)} className={inputCls} placeholder="e.g. Block 1" />
        </Field>

        <Field label="Intro Video" hint="Optional — the unit works fine without one.">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVideoSource("url")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${videoSource === "url" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Link2 className="h-4 w-4" /> Video URL
            </button>
            <button
              type="button"
              onClick={() => setVideoSource("upload")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${videoSource === "upload" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Upload className="h-4 w-4" /> Upload Video
            </button>
          </div>
          {videoSource === "url" ? (
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className={`${inputCls} mt-2`}
              placeholder="e.g., https://... video link"
            />
          ) : (
            <div className="mt-2 space-y-1.5">
              <label className="flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary">
                <Upload className="h-4 w-4" />
                {uploadingVideo ? "Uploading…" : videoUrl || "Click to upload a video"}
                <input type="file" accept="video/*" className="sr-only" disabled={uploadingVideo} onChange={(e) => handleVideoFile(e.target.files?.[0])} />
              </label>
              {videoError && <p className="text-xs text-destructive">{videoError}</p>}
            </div>
          )}
        </Field>

        <Field label="Downloadable File">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFileSource("url")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fileSource === "url" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Link2 className="h-4 w-4" /> File URL
            </button>
            <button
              type="button"
              onClick={() => setFileSource("upload")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fileSource === "upload" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Upload className="h-4 w-4" /> Upload File
            </button>
          </div>
          {fileSource === "url" ? (
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
                {uploadingFile ? "Uploading…" : fileName || "Click to upload a file"}
                <input type="file" className="sr-only" disabled={uploadingFile} onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>
          )}
        </Field>

        <Field label="File Label" hint="Optional. Shown as the download link text.">
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} className={inputCls} placeholder="e.g., Unit 1 – Study Guide.pdf" />
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton disabled={!title.trim() || uploadingFile || uploadingVideo} onClick={handleSave}>
          {isEdit ? "Save Changes" : "Create Unit"}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
