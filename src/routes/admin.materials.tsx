import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { type MaterialType } from "@/lib/mock-data";
import {
  useMaterials,
  useCategories,
  addCategory,
  upsertMaterial,
  deleteMaterial,
  levelsForProduct,
  acceptForType,
  isFileTooLarge,
  uploadMaterialFile,
  MAX_MATERIAL_FILE_ERROR,
  RESTRICT_PRODUCTS,
  type RestrictProduct,
  type StoredMaterial,
} from "@/lib/materials-store";
import { Card, GhostButton, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import {
  Pencil,
  Trash2,
  X,
  Upload,
  Plus,
  Check,
  Book,
  FileText,
  ListChecks,
  Video,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/admin/materials")({ component: Page });

const ACCENT = "#5fca16"; // brand lime — every primary/selected action in this form
const ACTIVE = "#01304a"; // navy — active/selected chip background

// Friendly, non-technical labels — Jaret asked for these to replace the raw
// enum values (e.g. "verb-list") that used to show up straight in the Type
// dropdown and in the listing below.
const TYPE_META: Record<MaterialType, { label: string; icon: LucideIcon }> = {
  book: { label: "Book", icon: Book },
  pdf: { label: "PDF", icon: FileText },
  "verb-list": { label: "Verb List", icon: ListChecks },
  video: { label: "Video", icon: Video },
  image: { label: "Image", icon: ImageIcon },
};
const TYPES = Object.keys(TYPE_META) as MaterialType[];

/** One big tappable choice — used for Type, Category, product/level and the
 *  Premium toggle. Replaces every dropdown that used to be in this form. */
function ChoiceButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors"
      style={
        active
          ? { background: ACTIVE, borderColor: ACTIVE, color: "#fff" }
          : { background: "transparent", borderColor: "var(--border)", color: "var(--foreground)" }
      }
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** Shared drag & drop + big-button upload zone for the resource file and the
 *  cover image — one visual pattern instead of two different-looking ones. */
function UploadZone({
  accept,
  uploading,
  fileName,
  preview,
  placeholder,
  hint,
  onFile,
  onRemove,
}: {
  accept: string;
  uploading: boolean;
  fileName?: string;
  preview?: string;
  placeholder: ReactNode;
  hint?: string;
  onFile: (file?: File | null) => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFile = !!fileName || !!preview;
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onFile(e.dataTransfer.files?.[0]);
      }}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-secondary/30 p-6 text-center"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {preview ? (
        <img src={preview} alt="preview" className="h-28 w-44 rounded-lg object-cover" />
      ) : (
        placeholder
      )}
      {fileName && <div className="text-sm font-medium text-foreground">{fileName}</div>}
      {hint && !hasFile && <div className="text-xs text-muted-foreground">{hint}</div>}
      <div className="flex gap-2">
        <PrimaryButton
          type="button"
          accentColor={ACCENT}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : hasFile ? "Replace file" : "Choose or drop a file"}
        </PrimaryButton>
        {hasFile && onRemove && (
          <GhostButton type="button" onClick={onRemove}>
            <X className="h-3.5 w-3.5" /> Remove
          </GhostButton>
        )}
      </div>
    </div>
  );
}

function Page() {
  const items = useMaterials();
  const categories = useCategories();

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<MaterialType>("pdf");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Grammar");
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [cover, setCover] = useState<string | undefined>(undefined);
  const [restrictProduct, setRestrictProduct] = useState<RestrictProduct | "">("");
  const [restrictLevel, setRestrictLevel] = useState("");
  const [premium, setPremium] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StoredMaterial | null>(null);
  const [resourceFile, setResourceFile] = useState<string | undefined>(undefined);
  const [resourceName, setResourceName] = useState<string>("");
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [resourceUploading, setResourceUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setType("pdf");
    setTitle("");
    setCategory(categories[0] ?? "Grammar");
    setAddingCat(false);
    setNewCat("");
    setCover(undefined);
    setRestrictProduct("");
    setRestrictLevel("");
    setPremium(false);
    setResourceFile(undefined);
    setResourceName("");
    setResourceError(null);
    setCoverError(null);
  };

  const onResourceFile = async (file?: File | null) => {
    if (!file) return;
    if (isFileTooLarge(file)) {
      setResourceError(MAX_MATERIAL_FILE_ERROR);
      setResourceFile(undefined);
      setResourceName("");
      return;
    }
    setResourceError(null);
    setResourceName(file.name);
    setResourceUploading(true);
    const res = await uploadMaterialFile(file, "resource");
    setResourceUploading(false);
    if (!res.ok) {
      setResourceError(res.error);
      setResourceName("");
      return;
    }
    setResourceFile(res.url);
  };

  const commitNewCategory = () => {
    const trimmed = newCat.trim();
    if (!trimmed) {
      setAddingCat(false);
      return;
    }
    addCategory(trimmed);
    setCategory(trimmed);
    setAddingCat(false);
    setNewCat("");
  };

  const onCoverFile = async (file?: File | null) => {
    if (!file) return;
    if (isFileTooLarge(file)) {
      setCoverError(MAX_MATERIAL_FILE_ERROR);
      return;
    }
    setCoverError(null);
    setCoverUploading(true);
    const res = await uploadMaterialFile(file, "cover");
    setCoverUploading(false);
    if (!res.ok) {
      setCoverError(res.error);
      return;
    }
    setCover(res.url);
  };

  const onProductChange = (v: RestrictProduct | "") => {
    setRestrictProduct(v);
    setRestrictLevel(""); // reset dependent level
  };

  const save = () => {
    if (!title.trim() || !category) return;
    if (resourceError) return;
    upsertMaterial({
      id: editingId ?? `m${Date.now()}`,
      title: title.trim(),
      material_type: type,
      category,
      upload_url: resourceFile ?? items.find((m) => m.id === editingId)?.upload_url ?? "#",
      cover_image: cover,
      restrict_product: restrictProduct || undefined,
      restrict_level: restrictLevel || undefined,
      premium: premium || undefined,
    });
    resetForm();
  };

  const startEdit = (m: StoredMaterial) => {
    setEditingId(m.id);
    setType(m.material_type);
    setTitle(m.title);
    setCategory(m.category);
    setAddingCat(false);
    setNewCat("");
    setCover(m.cover_image);
    setRestrictProduct(m.restrict_product ?? "");
    setRestrictLevel(m.restrict_level ?? "");
    setPremium(!!m.premium);
    setResourceFile(undefined);
    setResourceName("");
    setResourceError(null);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const restrictLabel = (m: StoredMaterial) => {
    if (!m.restrict_product && !m.restrict_level) return null;
    const prod = RESTRICT_PRODUCTS.find((p) => p.id === m.restrict_product)?.label;
    return [prod, m.restrict_level].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Material Complementario</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload supplemental resources — they show up automatically on the Student & Teacher Resources pages.
        </p>
      </div>

      <Card>
        <SectionTitle
          action={
            editingId ? (
              <GhostButton onClick={resetForm}>
                <X className="h-3.5 w-3.5" /> Cancel edit
              </GhostButton>
            ) : undefined
          }
        >
          {editingId ? "Edit material" : "Upload material"}
        </SectionTitle>

        {/* Type — big icon buttons instead of a dropdown */}
        <div>
          <label className="text-xs font-medium text-foreground">What kind of material is this?</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <ChoiceButton key={t} active={type === t} onClick={() => setType(t)} icon={TYPE_META[t].icon}>
                {TYPE_META[t].label}
              </ChoiceButton>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="mt-5">
          <label className="text-xs font-medium text-foreground">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Resource title"
          />
        </div>

        {/* Category — pill buttons instead of a dropdown */}
        <div className="mt-5">
          <label className="text-xs font-medium text-foreground">Category</label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <ChoiceButton key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </ChoiceButton>
            ))}
            {addingCat ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && commitNewCategory()}
                  autoFocus
                  className="rounded-full border border-input bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="New category name"
                />
                <button
                  type="button"
                  onClick={commitNewCategory}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: ACCENT }}
                >
                  <Check className="h-4 w-4" />
                </button>
                <GhostButton type="button" onClick={() => { setAddingCat(false); setNewCat(""); }} className="!px-2.5">
                  <X className="h-3.5 w-3.5" />
                </GhostButton>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingCat(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                <Plus className="h-4 w-4" /> New category
              </button>
            )}
          </div>
        </div>

        {/* Restrict to */}
        <div className="mt-5">
          <label className="text-xs font-medium text-foreground">Who can see this?</label>
          <div className="mt-2 flex flex-wrap gap-2">
            <ChoiceButton active={!restrictProduct} onClick={() => onProductChange("")}>
              Everyone
            </ChoiceButton>
            {RESTRICT_PRODUCTS.map((p) => (
              <ChoiceButton key={p.id} active={restrictProduct === p.id} onClick={() => onProductChange(p.id)}>
                {p.label} only
              </ChoiceButton>
            ))}
          </div>
          {restrictProduct && (
            <div className="mt-2 flex flex-wrap gap-2 pl-1">
              <ChoiceButton active={!restrictLevel} onClick={() => setRestrictLevel("")}>
                Any level
              </ChoiceButton>
              {levelsForProduct(restrictProduct).map((l) => (
                <ChoiceButton key={l} active={restrictLevel === l} onClick={() => setRestrictLevel(l)}>
                  {l}
                </ChoiceButton>
              ))}
            </div>
          )}
          <div className="mt-3">
            <ChoiceButton active={premium} onClick={() => setPremium((v) => !v)}>
              {premium ? "✓ Premium only (Advance/Elite)" : "Mark as Premium (Advance/Elite)"}
            </ChoiceButton>
          </div>
        </div>

        {/* Resource file */}
        <div className="mt-6">
          <label className="text-xs font-medium text-foreground">Upload the file</label>
          <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
            {editingId ? "Leave empty to keep the current file." : "Max 8MB."}
          </p>
          <UploadZone
            accept={acceptForType(type)}
            uploading={resourceUploading}
            fileName={resourceName}
            placeholder={<Upload className="h-8 w-8 text-muted-foreground" />}
            onFile={onResourceFile}
            onRemove={() => {
              setResourceFile(undefined);
              setResourceName("");
              setResourceError(null);
            }}
          />
          {resourceError && <p className="mt-2 text-xs font-medium text-destructive">{resourceError}</p>}
        </div>

        {/* Cover image */}
        <div className="mt-6">
          <label className="text-xs font-medium text-foreground">Cover image (optional)</label>
          <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
            If you skip this, a generic icon is used instead.
          </p>
          <UploadZone
            accept="image/*"
            uploading={coverUploading}
            preview={cover}
            placeholder={<ImageIcon className="h-8 w-8 text-muted-foreground" />}
            onFile={onCoverFile}
            onRemove={() => setCover(undefined)}
          />
          {coverError && <p className="mt-2 text-xs font-medium text-destructive">{coverError}</p>}
        </div>

        <div className="mt-6 flex justify-end">
          <PrimaryButton accentColor={ACCENT} onClick={save} disabled={resourceUploading || coverUploading}>
            {editingId ? "Save changes" : "Save material"}
          </PrimaryButton>
        </div>
      </Card>

      {/* Listing — cards instead of a dense table */}
      <div>
        <SectionTitle>All materials ({items.length})</SectionTitle>
        {items.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-muted-foreground">No materials yet — upload one above.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((m) => {
              const TypeIcon = TYPE_META[m.material_type].icon;
              return (
                <Card key={m.id} className="!p-0 overflow-hidden">
                  <div className="relative aspect-video w-full overflow-hidden border-b border-border bg-secondary/40">
                    {m.cover_image ? (
                      <img src={m.cover_image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <TypeIcon className="h-10 w-10 text-muted-foreground" style={{ opacity: 0.5 }} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">{m.title}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="muted">
                        <TypeIcon className="mr-1 h-3 w-3" /> {TYPE_META[m.material_type].label}
                      </Pill>
                      <Pill tone="default">{m.category}</Pill>
                      {restrictLabel(m) ? (
                        <Pill tone="warning">{restrictLabel(m)}</Pill>
                      ) : (
                        <Pill tone="muted">Everyone</Pill>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <GhostButton onClick={() => startEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </GhostButton>
                      <GhostButton onClick={() => setConfirmDelete(m)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </GhostButton>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground">Delete material?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              “{confirmDelete.title}” will be removed from the Student & Teacher panels. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <GhostButton onClick={() => setConfirmDelete(null)}>Cancel</GhostButton>
              <PrimaryButton
                className="!bg-destructive hover:!bg-destructive/90"
                onClick={() => {
                  deleteMaterial(confirmDelete.id);
                  if (editingId === confirmDelete.id) resetForm();
                  setConfirmDelete(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
