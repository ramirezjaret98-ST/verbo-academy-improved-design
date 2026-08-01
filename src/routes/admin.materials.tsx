import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
  MAX_MATERIAL_FILE_ERROR,
  RESTRICT_PRODUCTS,
  type RestrictProduct,
  type StoredMaterial,
} from "@/lib/materials-store";
import { Card, GhostButton, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import { Pencil, Trash2, X, Upload, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/admin/materials")({ component: Page });

const TYPES: MaterialType[] = ["book", "pdf", "verb-list", "video", "image"];
const fieldCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Page() {
  const items = useMaterials();
  const categories = useCategories();

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<MaterialType>("pdf");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Grammar");
  const [creatingCat, setCreatingCat] = useState(false);
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
  const fileRef = useRef<HTMLInputElement>(null);
  const resourceRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setEditingId(null);
    setType("pdf");
    setTitle("");
    setCategory(categories[0] ?? "Grammar");
    setCreatingCat(false);
    setNewCat("");
    setCover(undefined);
    setRestrictProduct("");
    setRestrictLevel("");
    setPremium(false);
    setResourceFile(undefined);
    setResourceName("");
    setResourceError(null);
    setCoverError(null);
    if (resourceRef.current) resourceRef.current.value = "";
  };

  const onResourceFile = (file?: File | null) => {
    if (!file) return;
    if (isFileTooLarge(file)) {
      setResourceError(MAX_MATERIAL_FILE_ERROR);
      setResourceFile(undefined);
      setResourceName("");
      if (resourceRef.current) resourceRef.current.value = "";
      return;
    }
    setResourceError(null);
    setResourceName(file.name);
    const reader = new FileReader();
    reader.onload = () => setResourceFile(reader.result as string);
    reader.readAsDataURL(file);
  };



  const onPickCategory = (v: string) => {
    if (v === "__new__") {
      setCreatingCat(true);
    } else {
      setCategory(v);
    }
  };

  const commitNewCategory = () => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    addCategory(trimmed);
    setCategory(trimmed);
    setCreatingCat(false);
    setNewCat("");
  };

  const onCoverFile = (file?: File | null) => {
    if (!file) return;
    if (isFileTooLarge(file)) {
      setCoverError(MAX_MATERIAL_FILE_ERROR);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setCoverError(null);
    const reader = new FileReader();
    reader.onload = () => setCover(reader.result as string);
    reader.readAsDataURL(file);
  };

  const onProductChange = (v: string) => {
    setRestrictProduct(v as RestrictProduct | "");
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
    setCreatingCat(false);
    setNewCat("");
    setCover(m.cover_image);
    setRestrictProduct(m.restrict_product ?? "");
    setRestrictLevel(m.restrict_level ?? "");
    setPremium(!!m.premium);
    setResourceFile(undefined);
    setResourceName("");
    setResourceError(null);
    if (resourceRef.current) resourceRef.current.value = "";

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
          Upload supplemental resources — auto-categorized into the Student & Teacher Resources pages.
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

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-foreground">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as MaterialType)} className={`mt-1.5 ${fieldCls}`}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`mt-1.5 ${fieldCls}`}
              placeholder="Resource title"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Category</label>
            {creatingCat ? (
              <div className="mt-1.5 flex gap-2">
                <input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && commitNewCategory()}
                  autoFocus
                  className={fieldCls}
                  placeholder="New category name"
                />
                <PrimaryButton onClick={commitNewCategory}>Add</PrimaryButton>
                <GhostButton onClick={() => { setCreatingCat(false); setNewCat(""); }}>
                  <X className="h-3.5 w-3.5" />
                </GhostButton>
              </div>
            ) : (
              <select value={category} onChange={(e) => onPickCategory(e.target.value)} className={`mt-1.5 ${fieldCls}`}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__new__">+ Create new category</option>
              </select>
            )}
          </div>
        </div>

        {/* Restrict to */}
        <div className="mt-4">
          <label className="text-xs font-medium text-foreground">Restrict to (optional)</label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Leave both on “Any” to show this resource to every student. Set a product/level to limit visibility.
          </p>
          <div className="mt-1.5 grid gap-3 md:grid-cols-2">
            <select value={restrictProduct} onChange={(e) => onProductChange(e.target.value)} className={fieldCls}>
              <option value="">Product — Any —</option>
              {RESTRICT_PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <select
              value={restrictLevel}
              onChange={(e) => setRestrictLevel(e.target.value)}
              disabled={!restrictProduct}
              className={`${fieldCls} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <option value="">Level — Any —</option>
              {levelsForProduct(restrictProduct).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={premium}
              onChange={(e) => setPremium(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Premium (Advance/Elite only)
          </label>
        </div>

        {/* Resource file */}
        <div className="mt-4">
          <label className="text-xs font-medium text-foreground">Resource file</label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Upload the actual document ({acceptForType(type)}), max 8MB.
            {editingId ? " Leave empty to keep the current file." : ""}
          </p>
          <input
            ref={resourceRef}
            type="file"
            accept={acceptForType(type)}
            className="hidden"
            onChange={(e) => onResourceFile(e.target.files?.[0])}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <GhostButton onClick={() => resourceRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {resourceFile ? "Replace file" : "Choose file"}
            </GhostButton>
            {resourceName && <span className="text-xs text-foreground">{resourceName}</span>}
            {resourceFile && (
              <GhostButton
                onClick={() => {
                  setResourceFile(undefined);
                  setResourceName("");
                  setResourceError(null);
                  if (resourceRef.current) resourceRef.current.value = "";
                }}
              >
                <X className="h-3.5 w-3.5" /> Remove
              </GhostButton>
            )}
          </div>
          {resourceError && <p className="mt-2 text-xs font-medium text-destructive">{resourceError}</p>}
        </div>


        {/* Cover image */}
        <div className="mt-4">
          <label className="text-xs font-medium text-foreground">Cover image (optional)</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onCoverFile(e.target.files?.[0])}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onCoverFile(e.dataTransfer.files?.[0]);
            }}
            className="mt-1.5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center"
          >
            {cover ? (
              <img src={cover} alt="cover preview" className="h-28 w-44 rounded-lg object-cover" />
            ) : (
              <>
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
                <div className="mt-2 text-sm font-medium text-foreground">Drag & drop a cover image</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  If empty, a generic icon based on the resource type is used.
                </div>
              </>
            )}
            <div className="mt-3 flex gap-2">
              <GhostButton onClick={() => fileRef.current?.click()}>{cover ? "Replace image" : "Choose file"}</GhostButton>
              {cover && (
                <GhostButton onClick={() => setCover(undefined)}>
                  <X className="h-3.5 w-3.5" /> Remove
                </GhostButton>
              )}
            </div>
          </div>
          {coverError && <p className="mt-2 text-xs font-medium text-destructive">{coverError}</p>}
        </div>


        <div className="mt-5 flex justify-end">
          <PrimaryButton onClick={save}>{editingId ? "Save changes" : "Save material"}</PrimaryButton>
        </div>
      </Card>

      <Card className="!p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-6 py-3 font-medium">Title</th>
              <th className="px-6 py-3 font-medium">Type</th>
              <th className="px-6 py-3 font-medium">Category</th>
              <th className="px-6 py-3 font-medium">Restricted to</th>
              <th className="px-6 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                      {m.cover_image ? (
                        <img src={m.cover_image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase text-muted-foreground">
                          {m.material_type.slice(0, 3)}
                        </div>
                      )}
                    </div>
                    <span className="text-foreground">{m.title}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Pill tone="muted">{m.material_type}</Pill>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{m.category}</td>
                <td className="px-6 py-4">
                  {restrictLabel(m) ? (
                    <Pill tone="warning">{restrictLabel(m)}</Pill>
                  ) : (
                    <span className="text-xs text-muted-foreground">Everyone</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    <GhostButton onClick={() => startEdit(m)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </GhostButton>
                    <GhostButton onClick={() => setConfirmDelete(m)}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </GhostButton>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-muted-foreground">
                  No materials yet — upload one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

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
