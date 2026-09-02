// Scoped "PDF only" manager for teachers with `can_manage_unit_pdfs`
// (2026-09-02, ver memoria de proyecto `teacher_pdf_only_permission`).
//
// Deliberately narrow: this modal can ONLY replace/attach/remove the PDF of
// an EXISTING unit — institutional catalog (course_units), VIP or Tailored
// (custom_units). It never shows/edits title, video, teaser, block or
// position, and it never creates or deletes a unit. That's enforced twice:
// 1) the UI here simply doesn't expose those fields, and
// 2) even if someone bypassed the UI, the two SECURITY DEFINER RPCs this
//    modal calls (`teacher_set_course_unit_pdf` / `teacher_set_custom_unit_pdf`)
//    only ever UPDATE the pdf/file columns of a unit that already exists —
//    direct table writes stay admin/coordinator-only, unchanged.
//
// Used from teacher.performance-sessions.tsx (normal catalog),
// teacher.vip.tsx and teacher.tailored-content.tsx.
import { useState } from "react";
import { Link2, Upload, CheckCircle2, Trash2 } from "lucide-react";
import { ModalShell, ModalFooter, Field, inputCls } from "./course-modals";
import { GhostButton, PrimaryButton } from "./ui";
import { uploadContentFile } from "@/lib/content-uploads";

export type UnitPdfTarget =
  | { kind: "course"; unitCode: string; currentUrl: string }
  | { kind: "custom"; customKind: "vip" | "tailored"; unitId: string; currentUrl: string; currentFileName?: string };

function folderFor(target: UnitPdfTarget): string {
  if (target.kind === "course") return "course-pdf";
  return target.customKind === "vip" ? "vip-units" : "tailored-units";
}

export function UnitPdfModal({
  unitTitle,
  target,
  onClose,
  onSave,
  onRemove,
}: {
  unitTitle: string;
  target: UnitPdfTarget;
  onClose: () => void;
  /** Persists a new/replacement PDF. `fileName` is only meaningful for VIP/Tailored. */
  onSave: (url: string, fileName?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Only offered for the institutional catalog, where the PDF is optional. */
  onRemove?: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [source, setSource] = useState<"url" | "upload">("url");
  const [url, setUrl] = useState(target.currentUrl);
  const [fileName, setFileName] = useState(target.kind === "custom" ? target.currentFileName ?? "" : "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const canRemove = target.kind === "course" && !!target.currentUrl && !!onRemove;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const res = await uploadContentFile(file, folderFor(target));
    setUploading(false);
    if (!res.ok) {
      setUploadError(res.error);
      return;
    }
    setUrl(res.url);
    setFileName(res.fileName);
  };

  const handleSave = async () => {
    const trimmed = url.trim();
    if (target.kind === "custom" && !trimmed) {
      setSaveError("VIP/Tailored units always need a file attached — upload one or paste a link.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const res = await onSave(trimmed, target.kind === "custom" ? fileName || undefined : undefined);
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    onClose();
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    if (!confirm("Remove the PDF from this unit? The unit itself stays exactly as it is.")) return;
    setRemoving(true);
    setSaveError("");
    const res = await onRemove();
    setRemoving(false);
    if (!res.ok) {
      setSaveError(res.error);
      return;
    }
    onClose();
  };

  return (
    <ModalShell
      title="Manage Study Guide PDF"
      subtitle={`${unitTitle} · you can only replace or remove the PDF here — the unit itself isn't editable.`}
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        <Field
          label="Study Guide PDF"
          hint={target.kind === "custom" ? "Required — VIP/Tailored units always need a file." : url ? "A file is attached to this unit." : "Optional — the unit works fine without one."}
        >
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSource("url")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${source === "url" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Link2 className="h-4 w-4" /> PDF URL
            </button>
            <button
              type="button"
              onClick={() => setSource("upload")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${source === "upload" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              <Upload className="h-4 w-4" /> Upload PDF
            </button>
          </div>
          {source === "url" ? (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={`${inputCls} mt-2`}
              placeholder="e.g., https://example.com/study-guide.pdf or public document link"
            />
          ) : (
            <div className="mt-2 space-y-1.5">
              <label className="flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : fileName || "Click to upload a PDF"}
                <input type="file" accept="application/pdf" className="sr-only" disabled={uploading} onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            </div>
          )}
          {url && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> PDF ready — will be confirmed on the unit list after saving.
            </p>
          )}
        </Field>
        {saveError && <p className="text-xs text-destructive">{saveError}</p>}
      </div>
      <ModalFooter>
        {canRemove && (
          <GhostButton onClick={handleRemove} disabled={removing || saving}>
            <Trash2 className="h-3.5 w-3.5" /> {removing ? "Removing…" : "Remove PDF"}
          </GhostButton>
        )}
        <div className="ml-auto flex items-center gap-2">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton disabled={uploading || saving || removing} onClick={handleSave}>
            {saving ? "Saving…" : "Save PDF"}
          </PrimaryButton>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
