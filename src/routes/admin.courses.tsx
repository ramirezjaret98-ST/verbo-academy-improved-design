import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, GhostButton, PrimaryButton, SectionTitle, Pill } from "@/components/verbo/ui";
import {
  Plus,
  Trash2,
  X,
  Sparkles,
  Pencil,
  Compass,
  Briefcase,
  Globe,
  ArrowLeft,
  ChevronRight,
  Lock,
  Wand2,
  Link2,
  Info,
  Upload,
} from "lucide-react";
import {
  loadActivities,
  renameUnitReferences,
} from "@/lib/activities-store";
import { uploadContentFile } from "@/lib/content-uploads";
import {
  ActivityModal,
  Field,
  ModalFooter,
  ModalShell,
  inputCls,
  textareaCls,
} from "@/components/verbo/course-modals";
import {
  type ProductId,
  type ProductCourse,
  type CourseLevel,
  type CourseUnit,
  PRODUCT_META,
  PRODUCT_ORDER,
  UNITS_PER_LEVEL,
  buildSkeletonUnits,
  loadCourses,
  saveUnit as saveCourseUnit,
  deleteUnit as deleteCourseUnit,
  addUnitsBulk,
  subscribeCourses,
} from "@/lib/product-courses-store";

export const Route = createFileRoute("/admin/courses")({ component: Page });

const PRODUCT_ICON: Record<ProductId, React.ComponentType<{ className?: string }>> = {
  go: Compass,
  enterprise: Briefcase,
  international: Globe,
};

function Page() {
  const [courses, setCourses] = useState<ProductCourse[]>(loadCourses);
  const [productId, setProductId] = useState<ProductId | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);

  const [unitModal, setUnitModal] = useState<{ mode: "create" | "edit"; unit?: CourseUnit } | null>(null);
  const [actModalUnit, setActModalUnit] = useState<{ unitId: string; unitTitle: string } | null>(null);
  const [activityRev, setActivityRev] = useState(0);

  useEffect(() => {
    setCourses(loadCourses());
    return subscribeCourses(() => setCourses(loadCourses()));
  }, []);

  const allActivities = useMemo(() => loadActivities(), [activityRev]);
  const product = productId ? courses.find((c) => c.product === productId) ?? null : null;
  const level = product && levelId ? product.levels.find((l) => l.id === levelId) ?? null : null;

  const createUnit = (title: string, num: number, videoUrl: string, pdfUrl: string, teaser: string) => {
    if (!level) return;
    const id = `${level.id}-U${num}`;
    const prev = level.units.find((u) => u.id === id);
    const merged: CourseUnit = {
      ...(prev ?? {}),
      id,
      title,
      video_url: videoUrl,
      pdf_url: pdfUrl,
      teaser,
    };
    saveCourseUnit(level.id, null, merged);
  };

  const updateUnit = (originalId: string, title: string, num: number, videoUrl: string, pdfUrl: string, teaser: string) => {
    if (!level) return;
    const newId = `${level.id}-U${num}`;
    const prev = level.units.find((u) => u.id === originalId) ?? level.units.find((u) => u.id === newId);
    const merged: CourseUnit = {
      ...(prev ?? {}),
      id: newId,
      title,
      video_url: videoUrl,
      pdf_url: pdfUrl,
      teaser,
    };
    saveCourseUnit(level.id, originalId, merged);
    if (newId !== originalId) {
      renameUnitReferences(originalId, newId);
      setActivityRev((r) => r + 1);
    }
  };

  const deleteUnit = (unitId: string) => {
    if (!confirm("Delete this unit and all its activities?")) return;
    if (!level) return;
    deleteCourseUnit(level.id, unitId);
  };

  const generateSkeleton = () => {
    if (!level) return;
    const existingNums = new Set(level.units.map((u) => unitNum(u.id)));
    const generated = buildSkeletonUnits(level.id).filter((u) => !existingNums.has(unitNum(u.id)));
    addUnitsBulk(level.id, generated);
  };

  /* ---------------- Screen 1: Product selection ---------------- */
  if (!product) {
    return (
      <div className="space-y-8">
        <Header title="Courses" subtitle="Select a product to manage its levels and units." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_ORDER.map((pid) => {
            const Icon = PRODUCT_ICON[pid];
            const c = courses.find((x) => x.product === pid);
            const levelCount = c?.levels.length ?? 0;
            const unitCount = c?.levels.reduce((s, l) => s + l.units.length, 0) ?? 0;
            return (
              <button
                key={pid}
                onClick={() => { setProductId(pid); setLevelId(null); }}
                className="group flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-elevated"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#01304a] to-[#024366] text-white">
                  <Icon className="h-7 w-7" />
                </span>
                <div>
                  <div className="text-lg font-semibold tracking-tight text-foreground">{PRODUCT_META[pid].label}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{PRODUCT_META[pid].description}</div>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                  <Pill tone="muted">{levelCount} levels</Pill>
                  <Pill tone={unitCount ? "success" : "muted"}>{unitCount} units</Pill>
                  <ChevronRight className="ml-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------------- Screen 2: Level selection ---------------- */
  if (!level) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <GhostButton onClick={() => setProductId(null)}><ArrowLeft className="h-3.5 w-3.5" /> All products</GhostButton>
          <Header title={`${PRODUCT_META[product.product].label} — Levels`} subtitle="Choose a commercial level to manage its 30 units." />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {product.levels.map((lvl) => (
            <button
              key={lvl.id}
              onClick={() => setLevelId(lvl.id)}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-elevated"
            >
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{lvl.id}</div>
              <div className="text-lg font-semibold tracking-tight text-foreground">{lvl.name}</div>
              <div className="mt-2 flex items-center justify-between">
                <Pill tone={lvl.units.length >= UNITS_PER_LEVEL ? "success" : "muted"}>
                  {lvl.units.length}/{UNITS_PER_LEVEL} units
                </Pill>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---------------- Screen 3: Units of the level ---------------- */
  const missing = UNITS_PER_LEVEL - level.units.length;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <GhostButton onClick={() => setLevelId(null)}><ArrowLeft className="h-3.5 w-3.5" /> {PRODUCT_META[product.product].label} levels</GhostButton>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button className="hover:text-foreground" onClick={() => setProductId(null)}>{PRODUCT_META[product.product].label}</button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{level.name}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{level.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{level.units.length}/{UNITS_PER_LEVEL} units created · manage units and their activities.</p>
        </div>
        <div className="flex items-center gap-2">
          {missing > 0 && (
            <PrimaryButton onClick={generateSkeleton}>
              <Wand2 className="h-3.5 w-3.5" /> Generate Level Skeleton
            </PrimaryButton>
          )}
          <GhostButton onClick={() => setUnitModal({ mode: "create" })}>
            <Plus className="h-3.5 w-3.5" /> Add unit
          </GhostButton>
        </div>
      </div>

      {missing > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          This level has {missing} of {UNITS_PER_LEVEL} units missing. Use “Generate Level Skeleton” to create 30 empty units (9 content + 1 review, repeated three times), then fill each unit in.
        </div>
      )}

      <Card className="!p-0">
        {level.units.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">No units yet for this level.</div>
        )}
        {level.units.map((u, i) => {
          const count = allActivities.filter((a) => a.unit_id === u.id).length;
          return (
            <div key={u.id} className={`flex items-center justify-between gap-4 px-6 py-4 ${i ? "border-t border-border" : ""}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{u.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{u.id}</span>
                  <span>•</span>
                  <Pill tone={count ? "success" : "muted"}>{count} {count === 1 ? "activity" : "activities"}</Pill>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <PrimaryButton onClick={() => setActModalUnit({ unitId: u.id, unitTitle: u.title })}>
                  <Sparkles className="h-3.5 w-3.5" /> Add Activities
                </PrimaryButton>
                <button
                  onClick={() => setUnitModal({ mode: "edit", unit: u })}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#f38934]"
                  aria-label="Edit unit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => deleteUnit(u.id)}
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

      {unitModal && (
        <UnitModal
          level={level}
          editingUnit={unitModal.mode === "edit" ? unitModal.unit : undefined}
          onClose={() => setUnitModal(null)}
          onCreate={(title, num, videoUrl, pdfUrl, teaser) => { createUnit(title, num, videoUrl, pdfUrl, teaser); setUnitModal(null); }}
          onUpdate={(id, title, num, videoUrl, pdfUrl, teaser) => { updateUnit(id, title, num, videoUrl, pdfUrl, teaser); setUnitModal(null); }}
        />
      )}
      {actModalUnit && (
        <ActivityModal
          unitId={actModalUnit.unitId}
          unitTitle={actModalUnit.unitTitle}
          onClose={() => { setActModalUnit(null); setActivityRev((r) => r + 1); }}
        />
      )}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function unitNum(unitId: string): number {
  const m = unitId.match(/-U(\d+)$/);
  return m ? parseInt(m[1], 10) : 1;
}

/* ---------------- Unit Modal ---------------- */

function UnitModal({ level, editingUnit, onClose, onCreate, onUpdate }: {
  level: CourseLevel;
  editingUnit?: CourseUnit;
  onClose: () => void;
  onCreate: (title: string, unitNumber: number, videoUrl: string, pdfUrl: string, teaser: string) => void;
  onUpdate: (originalId: string, title: string, unitNumber: number, videoUrl: string, pdfUrl: string, teaser: string) => void;
}) {
  const isEdit = !!editingUnit;
  const [title, setTitle] = useState(isEdit ? editingUnit!.title : "");
  const [unitNumber, setUnitNumber] = useState(isEdit ? unitNum(editingUnit!.id) : level.units.length + 1);
  const [videoSource, setVideoSource] = useState<"url" | "upload">("url");
  const [videoUrl, setVideoUrl] = useState(isEdit ? editingUnit!.video_url : "");
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState("");
  const handleVideoFile = async (file?: File) => {
    if (!file) return;
    setVideoUploading(true);
    setVideoUploadError("");
    const res = await uploadContentFile(file, "course-video");
    setVideoUploading(false);
    if (!res.ok) { setVideoUploadError(res.error); return; }
    setVideoUrl(res.url);
  };
  const [pdfUrl, setPdfUrl] = useState(isEdit ? editingUnit!.pdf_url : "");
  const [teaser, setTeaser] = useState(isEdit ? editingUnit!.teaser ?? "" : "");

  const handleSave = () => {
    if (isEdit) onUpdate(editingUnit!.id, title.trim(), unitNumber, videoUrl.trim(), pdfUrl.trim(), teaser.trim());
    else onCreate(title.trim(), unitNumber, videoUrl.trim(), pdfUrl.trim(), teaser.trim());
  };

  return (
    <ModalShell title={isEdit ? "Edit Unit" : "New unit"} subtitle={isEdit ? `${level.name} · update this unit. Activities remain untouched.` : `${level.name} · add a unit. You can attach activities afterwards.`} onClose={onClose}>
      <div className="space-y-4 p-6">
        <Field label="Unit Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Travel & directions" />
        </Field>
        <Field label="Unit Number">
          <input type="number" min={1} max={UNITS_PER_LEVEL} value={unitNumber} onChange={(e) => setUnitNumber(Number(e.target.value))} className={`${inputCls} max-w-[140px]`} />
        </Field>

        <Field label="Student Teaser">
          <textarea
            value={teaser}
            onChange={(e) => setTeaser(e.target.value)}
            maxLength={160}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="e.g. Order food, ask for the bill and survive any restaurant abroad."
          />
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              1-2 short lines shown to students instead of the vocabulary/grammar list — don't repeat what's inside the PDF.
            </p>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{teaser.length}/160</span>
          </div>
        </Field>

        {isEdit && (editingUnit?.block || (editingUnit?.vocabulary && editingUnit.vocabulary.length > 0) || editingUnit?.grammar_point) && (
          <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Syllabus reference</div>
            {editingUnit?.block && (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Block</div>
                <div className="mt-0.5 text-sm text-foreground">{editingUnit.block}</div>
              </div>
            )}
            {editingUnit?.vocabulary && editingUnit.vocabulary.length > 0 && (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Key vocabulary</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {editingUnit.vocabulary.map((w) => (
                    <span key={w} className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground">{w}</span>
                  ))}
                </div>
              </div>
            )}
            {editingUnit?.grammar_point && (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Grammar focus</div>
                <div className="mt-0.5 text-sm text-foreground">{editingUnit.grammar_point}</div>
              </div>
            )}
          </div>
        )}

        <Field label="Lesson Video">
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
              <Upload className="h-4 w-4" /> Upload File
            </button>
          </div>
          {videoSource === "url" ? (
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={`${inputCls} mt-2`} placeholder="e.g., https://youtube.com/watch?v=... or vimeo link" />
          ) : (
            <div className="mt-2 space-y-1.5">
              <label className="flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary">
                <Upload className="h-4 w-4" />
                {videoUploading ? "Uploading…" : videoUrl || "Click to upload a video"}
                <input type="file" accept="video/*" className="sr-only" disabled={videoUploading} onChange={(e) => handleVideoFile(e.target.files?.[0])} />
              </label>
              {videoUploadError && <p className="text-xs text-destructive">{videoUploadError}</p>}
            </div>
          )}
        </Field>

        <Field label="Study Guide PDF URL" hint="Paste a public document or cloud storage link.">
          <input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} className={inputCls} placeholder="e.g., https://example.com/study-guide.pdf or public document link" />
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton disabled={!title.trim() || videoUploading} onClick={handleSave}>{isEdit ? "Save Changes" : "Create unit"}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

