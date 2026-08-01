import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, GhostButton, PrimaryButton } from "@/components/verbo/ui";
import {
  Plus,
  Trash2,
  X,
  Pencil,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
import {
  type BadgeDef,
  type BadgeMetric,
  BADGE_METRIC_META,
  loadBadges,
  persistBadges,
  subscribeBadges,
  newBadgeId,
} from "@/lib/profile-badges-store";

export const Route = createFileRoute("/admin/profile-badges")({ component: Page });

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const textareaCls =
  "min-h-[96px] w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

const BADGE_IMAGE_ACCEPT = "image/gif,image/png,image/jpeg,image/webp";
const BADGE_IMAGE_MAX_BYTES = 1024 * 1024;

function readImageAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!BADGE_IMAGE_ACCEPT.split(",").includes(file.type)) {
      alert("Please upload a GIF, PNG, JPG or WebP image.");
      resolve(null);
      return;
    }
    if (file.size > BADGE_IMAGE_MAX_BYTES) {
      alert("Image is too large (max 1 MB).");
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => { alert("Could not read the image file."); resolve(null); };
    reader.readAsDataURL(file);
  });
}

function BadgeImage({ src, size = "md" }: { src: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-20 w-20" : "h-12 w-12";
  const inner = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  if (src) {
    return <img src={src} alt="" className={`${box} rounded-full object-cover ring-2 ring-amber-400/40`} />;
  }
  return (
    <span className={`${box} flex items-center justify-center rounded-full bg-secondary text-muted-foreground ring-2 ring-border`}>
      <ImageIcon className={inner} />
    </span>
  );
}

function ruleSummary(b: BadgeDef): string {
  const meta = BADGE_METRIC_META[b.rule.metric];
  if (!meta.numeric) return meta.label;
  return `${meta.label} ≥ ${b.rule.threshold ?? 1}`;
}

function Page() {
  const [badges, setBadges] = useState<BadgeDef[]>(loadBadges);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; badge?: BadgeDef } | null>(null);

  useEffect(() => {
    setBadges(loadBadges());
    return subscribeBadges(() => setBadges(loadBadges()));
  }, []);

  const save = (b: BadgeDef) => {
    setBadges((prev) => {
      const exists = prev.some((x) => x.id === b.id);
      const next = exists ? prev.map((x) => (x.id === b.id ? b : x)) : [...prev, b];
      persistBadges(next);
      return next;
    });
  };

  const remove = (id: string) => {
    if (!confirm("Delete this badge?")) return;
    setBadges((prev) => {
      const next = prev.filter((b) => b.id !== id);
      persistBadges(next);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile Badges</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the badges shown on the student Dashboard and Profile.</p>
        </div>
        <GhostButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="h-3.5 w-3.5" /> Add badge
        </GhostButton>
      </div>

      {badges.length === 0 ? (
        <Card><div className="py-10 text-center text-sm text-muted-foreground">No badges yet.</div></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => (
            <div key={b.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <BadgeImage src={b.image} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">{b.name}</div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
                </div>
              </div>
              <div className="rounded-lg bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Earned when: </span>{ruleSummary(b)}
              </div>
              <div className="mt-auto flex items-center justify-end gap-1">
                <button
                  onClick={() => setModal({ mode: "edit", badge: b })}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#f38934]"
                  aria-label="Edit badge"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(b.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                  aria-label="Delete badge"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <BadgeModal
          existing={badges}
          editing={modal.mode === "edit" ? modal.badge : undefined}
          onClose={() => setModal(null)}
          onSave={(b) => { save(b); setModal(null); }}
        />
      )}
    </div>
  );
}

function BadgeModal({
  existing,
  editing,
  onClose,
  onSave,
}: {
  existing: BadgeDef[];
  editing?: BadgeDef;
  onClose: () => void;
  onSave: (b: BadgeDef) => void;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [image, setImage] = useState<string>(editing?.image ?? "");
  const [metric, setMetric] = useState<BadgeMetric>(editing?.rule.metric ?? "unitsCompletedCount");
  const [threshold, setThreshold] = useState<number>(editing?.rule.threshold ?? 1);

  const isNumeric = BADGE_METRIC_META[metric].numeric;

  const handleSave = () => {
    const id = editing?.id ?? newBadgeId(existing);
    onSave({
      id,
      name: name.trim() || "Untitled badge",
      description: description.trim(),
      image,
      rule: isNumeric
        ? { metric, threshold: Math.max(1, Math.floor(threshold || 1)) }
        : { metric },
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const dataUrl = await readImageAsDataUrl(file);
    if (dataUrl) setImage(dataUrl);
  };

  return (
    <ModalShell title={isEdit ? "Edit badge" : "Add badge"} onClose={onClose}>
      <div className="space-y-4 p-6">
        <Field label="Image" hint="GIF, PNG, JPG or WebP. Max 1 MB. GIFs animate on the student page.">
          <div className="flex items-center gap-4">
            <BadgeImage src={image} size="lg" />
            <div className="flex flex-col gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary">
                <Upload className="h-3.5 w-3.5" />
                Upload image
                <input type="file" accept={BADGE_IMAGE_ACCEPT} onChange={handleFileChange} className="hidden" />
              </label>
              {image && (
                <button
                  type="button"
                  onClick={() => setImage("")}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> Remove image
                </button>
              )}
            </div>
          </div>
        </Field>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Level Conqueror" />
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={textareaCls} placeholder="Short description shown under the badge." />
        </Field>

        <Field label="Earned when" hint={BADGE_METRIC_META[metric].hint}>
          <select value={metric} onChange={(e) => setMetric(e.target.value as BadgeMetric)} className={inputCls}>
            {(Object.keys(BADGE_METRIC_META) as BadgeMetric[]).map((m) => (
              <option key={m} value={m}>{BADGE_METRIC_META[m].label}</option>
            ))}
          </select>
          {isNumeric && (
            <div className="mt-2">
              <label className="mb-1.5 block text-[11px] font-semibold text-foreground">Threshold (≥)</label>
              <input
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          )}
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton disabled={!name.trim()} onClick={handleSave}>Save changes</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, onClose, children, width = "max-w-xl" }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className={`w-full ${width} overflow-hidden rounded-2xl border border-border bg-card shadow-elevated`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 bg-gradient-to-br from-[#01304a] to-[#024366] p-6 text-white">
          <div>
            <div className="text-base font-semibold tracking-tight">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-white/70">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-3 border-t border-border bg-secondary/30 p-4">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold text-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}
