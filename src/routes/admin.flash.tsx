import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, GhostButton, PrimaryButton, Pill, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import { Plus, Trash2, X, Pencil, Link2, Lock, Zap, Package, Gift, Sparkles } from "lucide-react";
import {
  type FlashChallenge,
  type FlashProductId,
  type FlashFormat,
  type LightningState,
  FLASH_PRODUCT_ORDER,
  FLASH_PRODUCT_LABEL,
  LIGHTNING_DEFAULT_HOURS,
  loadFlashChallenges,
  persistFlashChallenges,
  subscribeFlashChallenges,
  flashChallengesFor,
  seasonChallengesFor,
  newFlashChallengeId,
  newSyncedGroupId,
  loadFlashConfig,
  persistFlashConfig,
  subscribeFlashConfig,
  loadLightning,
  subscribeLightning,
  loadLightningTheme,
  persistLightningTheme,
  subscribeLightningTheme,
  activateLightning,
  endLightningEarly,
  type FlashSeason,
  type GradientStop,
  type SeasonFillMode,
  type FontPreset,
  FONT_PRESET_ORDER,
  fontFamilyFor,
  ensureGoogleFont,
  loadSeasons,
  subscribeSeasons,
  upsertSeason,
  conflictingActiveSeason,
  removeChallengeAndUnsync,
  deleteSeason,
  seasonGradientCss,
} from "@/lib/flash-challenges-store";
import {
  loadCategories,
  persistCategories,
  subscribeCategories,
  categoryColor,
} from "@/lib/challenges-store";

export const Route = createFileRoute("/admin/flash")({ component: Page });

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const textareaCls =
  "min-h-[96px] w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

type SubTab = "mystery_box" | "lightning" | "season";

function Page() {
  const [tab, setTab] = useState<SubTab>("mystery_box");
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <Zap className="h-3.5 w-3.5" /> Verbo Flash
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Verbo Flash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Surprise-style complementary challenges. Separate from the weekly Challenges bank.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "mystery_box" as SubTab, label: "Mystery Box", color: "#7e22ce" },
          { id: "lightning" as SubTab, label: "Lightning", color: "#0284c7" },
          { id: "season" as SubTab, label: "Season", color: "#01304a" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t.id ? { background: t.color } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mystery_box" ? (
        <MysteryBoxTab />
      ) : tab === "lightning" ? (
        <LightningTab />
      ) : (
        <SeasonTab />
      )}
    </div>
  );
}

/* -------------------- Mystery Box tab -------------------- */

function MysteryBoxTab() {
  const [list, setList] = useState<FlashChallenge[]>(loadFlashChallenges);
  const [config, setConfig] = useState(loadFlashConfig);
  const [categories, setCategories] = useState<string[]>(loadCategories);
  const [product, setProduct] = useState<FlashProductId>("enterprise");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; challenge?: FlashChallenge } | null>(null);
  const [boxArtDraft, setBoxArtDraft] = useState(config.box_art_url ?? "");

  useEffect(() => {
    setList(loadFlashChallenges());
    setCategories(loadCategories());
    setConfig(loadFlashConfig());
    const un1 = subscribeFlashChallenges(() => setList(loadFlashChallenges()));
    const un2 = subscribeCategories(() => setCategories(loadCategories()));
    const un3 = subscribeFlashConfig(() => {
      const next = loadFlashConfig();
      setConfig(next);
      setBoxArtDraft(next.box_art_url ?? "");
    });
    return () => { un1(); un2(); un3(); };
  }, []);

  const filtered = useMemo(
    () => flashChallengesFor(list, "mystery_box", product),
    [list, product],
  );

  const save = (cs: FlashChallenge[]) => {
    setList((prev) => {
      const ids = new Set(cs.map((c) => c.id));
      const next = [...prev.filter((x) => !ids.has(x.id)), ...cs];
      persistFlashChallenges(next);
      return next;
    });
  };
  const del = (id: string) => {
    if (!confirm("Delete this challenge?")) return;
    setList((prev) => {
      const next = removeChallengeAndUnsync(prev, id);
      persistFlashChallenges(next);
      return next;
    });
  };
  const addCategory = (name: string) => {
    setCategories((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      persistCategories(next);
      return next;
    });
  };
  const saveBoxArt = () => {
    persistFlashConfig({ ...config, box_art_url: boxArtDraft.trim() || undefined });
  };

  return (
    <div className="space-y-6">
      {/* Box art config */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-[#4a044e] via-[#7e22ce] to-[#a855f7] text-white shadow-sm">
            {config.box_art_url ? (
              <img src={config.box_art_url} alt="Mystery Box" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              <Gift className="h-14 w-14 opacity-90" />
            )}
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">Mystery Box artwork</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Used for the Mystery Box card on the student side. Paste an image or GIF URL.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={boxArtDraft}
                onChange={(e) => setBoxArtDraft(e.target.value)}
                placeholder="https://... (image or .gif)"
                className={inputCls}
              />
              <PrimaryButton accentColor="#5fca16" onClick={saveBoxArt}>Save</PrimaryButton>
            </div>
          </div>
        </div>
      </Card>

      {/* Banner theme */}
      <BannerThemeCard
        key={`mystery-theme-${JSON.stringify({
          t: config.theme_image_url,
          w: config.watermark_image_url,
          a: config.accent_color,
          b: config.accent_color_to,
          f: config.fill_mode,
          g: config.gradient_stops,
        })}`}
        title="Mystery Box banner"
        description="Controls how the Mystery Box banner looks on the student side."
        value={config}
        onSave={(theme) => persistFlashConfig({ ...config, ...theme })}
      />



      {/* Product selector */}
      <div className="flex flex-wrap gap-2">
        {FLASH_PRODUCT_ORDER.map((p) => (
          <button
            key={p}
            onClick={() => setProduct(p)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              product === p
                ? "border-[#7e22ce] text-white"
                : "border-border bg-background text-muted-foreground hover:bg-secondary"
            }`}
            style={product === p ? { background: "#7e22ce" } : undefined}
          >
            {FLASH_PRODUCT_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filtered.length} Mystery Box challenge{filtered.length === 1 ? "" : "s"} for {FLASH_PRODUCT_LABEL[product]}
        </div>
        <GhostButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="h-3.5 w-3.5" /> Add Challenge
        </GhostButton>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Package className="h-8 w-8 text-muted-foreground/60" />
            No Mystery Box challenges yet for this product.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-md transition-shadow duration-200 hover:shadow-lg ${
                c.premium ? "border-l-[3px] border-l-[#d97706]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.category ? (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${categoryColor(c.category)}`}>
                      {c.category}
                    </span>
                  ) : (
                    <Pill tone="muted">No category</Pill>
                  )}
                  {c.premium && (
                    <Pill tone="warning" style={{ background: "#d97706", color: "#fff" }}>
                      Premium
                    </Pill>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{c.title || "Untitled"}</div>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.description || "No description yet."}</p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">{c.video_url ? "🎬 Video attached" : "No attachment"}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setModal({ mode: "edit", challenge: c })}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#7e22ce]"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => del(c.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FlashModal
          format="mystery_box"
          product={product}
          categories={categories}
          existing={list}
          editing={modal.mode === "edit" ? modal.challenge : undefined}
          onAddCategory={addCategory}
          onClose={() => setModal(null)}
          onSave={(cs) => { save(cs); setModal(null); }}
        />
      )}
    </div>
  );
}

/* -------------------- Modal (mirrors ChallengeModal) -------------------- */

function FlashModal({
  format,
  product,
  categories,
  existing,
  editing,
  seasonId,
  headerBackground,
  titleOverride,
  onAddCategory,
  onClose,
  onSave,
}: {
  format: FlashFormat;
  product: FlashProductId;
  categories: string[];
  existing: FlashChallenge[];
  editing?: FlashChallenge;
  seasonId?: string;
  headerBackground?: string;
  titleOverride?: string;
  onAddCategory: (name: string) => void;
  onClose: () => void;
  onSave: (cs: FlashChallenge[]) => void;
}) {
  const isEdit = !!editing;
  const [category, setCategory] = useState(editing?.category ?? "");
  const [creatingCat, setCreatingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [submissionInstructions, setSubmissionInstructions] = useState(editing?.submission_instructions ?? "");
  const [videoUrl, setVideoUrl] = useState(editing?.video_url ?? "");
  const [premium, setPremium] = useState<boolean>(editing?.premium ?? false);
  const [videoSource, setVideoSource] = useState<"url" | "upload">("url");
  const [iconImageUrl, setIconImageUrl] = useState(editing?.icon_image_url ?? "");
  const [iconError, setIconError] = useState("");
  const [applyAllProducts, setApplyAllProducts] = useState(false);

  const handleIconFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setIconError("Please choose an image file."); return; }
    if (file.size > 2 * 1024 * 1024) { setIconError("Image must be 2MB or smaller."); return; }
    setIconError("");
    const reader = new FileReader();
    reader.onload = () => setIconImageUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const commitNewCategory = () => {
    const t = newCat.trim();
    if (!t) return;
    onAddCategory(t);
    setCategory(t);
    setCreatingCat(false);
    setNewCat("");
  };

  const handleSave = () => {
    const content = {
      category: category.trim(),
      title: title.trim(),
      description: description.trim(),
      submission_instructions: submissionInstructions.trim(),
      video_url: videoUrl.trim() || undefined,
      premium,
      skill_tags: editing?.skill_tags ?? [],
      icon_image_url: iconImageUrl || undefined,
    };

    if (!isEdit && applyAllProducts) {
      const groupId = newSyncedGroupId();
      const pool = [...existing];
      const created: FlashChallenge[] = [];
      for (const p of FLASH_PRODUCT_ORDER) {
        const c: FlashChallenge = {
          id: newFlashChallengeId(format, p, pool),
          format,
          product: p,
          ...content,
          synced_group_id: groupId,
          ...(format === "season" ? { season_id: seasonId } : {}),
        };
        pool.push(c);
        created.push(c);
      }
      onSave(created);
      return;
    }

    const primary: FlashChallenge = {
      id: editing?.id ?? newFlashChallengeId(format, product, existing),
      format,
      product: editing?.product ?? product,
      ...content,
      ...(editing?.synced_group_id ? { synced_group_id: editing.synced_group_id } : {}),
      ...(format === "season"
        ? { season_id: editing?.season_id ?? seasonId }
        : {}),
    };

    if (isEdit && editing?.synced_group_id) {
      const siblings = existing
        .filter(
          (c) =>
            c.id !== primary.id &&
            c.format === format &&
            c.synced_group_id === editing.synced_group_id,
        )
        .map((c) => ({ ...c, ...content }));
      onSave([primary, ...siblings]);
      return;
    }

    onSave([primary]);
  };

  const headerTitle =
    titleOverride ??
    `${isEdit ? "Edit" : "New"} ${format === "lightning" ? "Lightning" : "Mystery Box"} Challenge`;

  const modalBackground =
    format === "lightning"
      ? "linear-gradient(135deg, #1e3a8a, #0284c7, #facc15)"
      : headerBackground
        ? headerBackground
        : "linear-gradient(135deg, #4a044e, #7e22ce, #a855f7)";
  const modalIcon = format === "lightning" ? Zap : format === "season" ? Sparkles : Gift;

  return (
    <AccentModal
      maxWidth="max-w-xl"
      background={modalBackground}
      iconTint="#ffffff"
      icon={modalIcon}
      eyebrow={FLASH_PRODUCT_LABEL[product]}
      title={headerTitle}
      watermark={
        format === "season"
          ? { type: "icon", icon: Sparkles }
          : { type: "text", value: format === "lightning" ? "FLASH" : "BOX" }
      }
      onClose={onClose}
    >
        <div className="space-y-4 p-6">
          {editing?.synced_group_id && (
            <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              🔗 Synced across products
            </div>
          )}
          <Field label="Category">
            {creatingCat ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitNewCategory(); } }}
                  className={inputCls}
                  placeholder="New category name"
                />
                <PrimaryButton disabled={!newCat.trim()} onClick={commitNewCategory}>Add</PrimaryButton>
                <GhostButton onClick={() => { setCreatingCat(false); setNewCat(""); }}>Cancel</GhostButton>
              </div>
            ) : (
              <select
                value={category}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__new__") setCreatingCat(true);
                  else setCategory(v);
                }}
                className={inputCls}
              >
                <option value="">— No category —</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">+ Create new category</option>
              </select>
            )}
          </Field>

          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Improvise a 30-second story" />
          </Field>

          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={textareaCls} placeholder="Describe the challenge…" />
          </Field>

          <Field label="Submission instructions">
            <textarea value={submissionInstructions} onChange={(e) => setSubmissionInstructions(e.target.value)} className={textareaCls} placeholder="Explain the expected delivery format — video, audio, written text, a link, etc." />
          </Field>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={premium}
              onChange={(e) => setPremium(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-[#7e22ce] focus:ring-[#7e22ce]"
            />
            <span className="flex-1">
              <span className="block text-xs font-semibold text-foreground">Premium (Advance / Elite only)</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">Restricts this challenge to students on Advance or Elite access plans.</span>
            </span>
          </label>

          {!isEdit && (
            <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={applyAllProducts}
                onChange={(e) => setApplyAllProducts(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border text-[#7e22ce] focus:ring-[#7e22ce]"
              />
              <span className="flex-1">
                <span className="block text-xs font-semibold text-foreground">Apply to all 3 products</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">Creates one linked copy for Enterprise, GO and International. Editing any copy later updates all of them.</span>
              </span>
            </label>
          )}

          <Field label="Attachment (optional)">
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
                disabled
                title="Coming soon"
                className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-sm font-medium text-muted-foreground opacity-70"
              >
                <Lock className="h-4 w-4" /> Upload File
              </button>
            </div>
            {videoSource === "url" ? (
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={`${inputCls} mt-2`} placeholder="https://youtube.com/watch?v=..." />
            ) : (
              <div className="mt-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-3 text-xs text-muted-foreground">Coming soon</div>
            )}
          </Field>

          <Field label="Icon image (circular) — optional">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border bg-secondary/50">
                {iconImageUrl ? (
                  <img src={iconImageUrl} alt="Challenge icon preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">None</div>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleIconFile(e.target.files?.[0])}
                  className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                />
                {iconImageUrl && (
                  <button
                    type="button"
                    onClick={() => setIconImageUrl("")}
                    className="mt-1.5 text-[11px] font-medium text-muted-foreground underline hover:text-foreground"
                  >
                    Remove image
                  </button>
                )}
                {iconError && <div className="mt-1 text-[11px] text-destructive">{iconError}</div>}
              </div>
            </div>
          </Field>
        </div>
      <AccentModalFooter accent="#5fca16">
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton accentColor="#5fca16" disabled={!title.trim()} onClick={handleSave}>{isEdit ? "Save Changes" : "Create Challenge"}</PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold text-foreground">{label}</div>
      {children}
    </label>
  );
}

/* -------------------- Lightning tab -------------------- */

function formatHMS(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function LightningTab() {
  const [list, setList] = useState<FlashChallenge[]>(loadFlashChallenges);
  const [categories, setCategories] = useState<string[]>(loadCategories);
  const [product, setProduct] = useState<FlashProductId>("enterprise");
  const [lightning, setLightning] = useState<LightningState>(loadLightning);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; challenge?: FlashChallenge } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("");
  const [durationHours, setDurationHours] = useState<number>(LIGHTNING_DEFAULT_HOURS);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [lightningTheme, setLightningTheme] = useState(loadLightningTheme);

  useEffect(() => {
    setList(loadFlashChallenges());
    setCategories(loadCategories());
    setLightning(loadLightning());
    const un1 = subscribeFlashChallenges(() => setList(loadFlashChallenges()));
    const un2 = subscribeCategories(() => setCategories(loadCategories()));
    const un3 = subscribeLightning(() => setLightning(loadLightning()));
    setLightningTheme(loadLightningTheme());
    const un4 = subscribeLightningTheme(() => setLightningTheme(loadLightningTheme()));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => { un1(); un2(); un3(); un4(); clearInterval(t); };
  }, []);

  // Auto-flip status when expires_at passes.
  useEffect(() => {
    if (lightning.status === "live" && lightning.expires_at && now >= +new Date(lightning.expires_at)) {
      setLightning(loadLightning());
    }
  }, [now, lightning.status, lightning.expires_at]);

  const filtered = useMemo(
    () => flashChallengesFor(list, "lightning", product),
    [list, product],
  );

  const save = (cs: FlashChallenge[]) => {
    setList((prev) => {
      const ids = new Set(cs.map((c) => c.id));
      const next = [...prev.filter((x) => !ids.has(x.id)), ...cs];
      persistFlashChallenges(next);
      return next;
    });
  };
  const del = (id: string) => {
    if (!confirm("Delete this challenge?")) return;
    setList((prev) => {
      const next = removeChallengeAndUnsync(prev, id);
      persistFlashChallenges(next);
      return next;
    });
  };
  const addCategory = (name: string) => {
    setCategories((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      persistCategories(next);
      return next;
    });
  };

  const isLive = lightning.status === "live";
  const activeChallenge = isLive ? list.find((c) => c.id === lightning.challenge_id) : null;
  const remainingMs = isLive && lightning.expires_at ? +new Date(lightning.expires_at) - now : 0;

  const handleActivate = () => {
    if (!selectedChallengeId) return;
    const target = list.find((c) => c.id === selectedChallengeId);
    if (!target) return;
    activateLightning(target.id, target.product, durationHours);
    setLightning(loadLightning());
    setSelectedChallengeId("");
  };

  return (
    <div className="space-y-6">
      <BannerThemeCard
        key={`lightning-theme-${JSON.stringify(lightningTheme)}`}
        title="Lightning banner"
        description="Controls how the Lightning banner looks on the student side."
        value={lightningTheme}
        onSave={(theme) => persistLightningTheme(theme)}
      />


      {isLive && activeChallenge ? (
        <Card>
          <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-[#1e3a8a] via-[#0284c7] to-[#facc15] p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/80">
                <Zap className="h-3.5 w-3.5" /> Lightning · Live
              </div>
              <div className="rounded-full bg-white/15 px-3 py-1 font-mono text-lg font-bold tabular-nums">
                {formatHMS(remainingMs)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">{FLASH_PRODUCT_LABEL[activeChallenge.product]}</div>
              <div className="mt-1 text-lg font-semibold tracking-tight">{activeChallenge.title || "Untitled"}</div>
              <p className="mt-1 text-sm text-white/90">{activeChallenge.description || "No description."}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
                ⚡ {lightning.accepted_student_ids.length} student{lightning.accepted_student_ids.length === 1 ? "" : "s"} accepted
              </span>
              {confirmEnd ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/90">End now?</span>
                  <PrimaryButton accentColor="#b52904" onClick={() => { endLightningEarly(); setConfirmEnd(false); }}>Yes, end</PrimaryButton>
                  <GhostButton onClick={() => setConfirmEnd(false)}>Cancel</GhostButton>
                </div>
              ) : (
                <GhostButton onClick={() => setConfirmEnd(true)}>End early</GhostButton>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-4 p-1">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-[#facc15]" /> Reto Relámpago
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Activate a Lightning</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Activate whenever you want. Eligible students see it live until it expires.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Product">
                <select
                  value={product}
                  onChange={(e) => { setProduct(e.target.value as FlashProductId); setSelectedChallengeId(""); }}
                  className={inputCls}
                >
                  {FLASH_PRODUCT_ORDER.map((p) => (
                    <option key={p} value={p}>{FLASH_PRODUCT_LABEL[p]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Challenge">
                <select
                  value={selectedChallengeId}
                  onChange={(e) => setSelectedChallengeId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Pick one —</option>
                  {filtered.map((c) => (
                    <option key={c.id} value={c.id}>{c.title || c.id}</option>
                  ))}
                </select>
              </Field>
              <Field label="Duration (hours)">
                <input
                  type="number"
                  min={1}
                  value={durationHours}
                  onChange={(e) => setDurationHours(Math.max(1, parseInt(e.target.value || "1", 10)))}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <PrimaryButton accentColor="#5fca16" disabled={!selectedChallengeId} onClick={handleActivate}>
                <Zap className="h-3.5 w-3.5" /> Activate Lightning now
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}

      {/* Product selector for library */}
      <div className="flex flex-wrap gap-2">
        {FLASH_PRODUCT_ORDER.map((p) => (
          <button
            key={p}
            onClick={() => setProduct(p)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              product === p
                ? "border-[#0284c7] text-white"
                : "border-border bg-background text-muted-foreground hover:bg-secondary"
            }`}
            style={product === p ? { background: "#0284c7" } : undefined}
          >
            {FLASH_PRODUCT_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filtered.length} Lightning challenge{filtered.length === 1 ? "" : "s"} for {FLASH_PRODUCT_LABEL[product]}
        </div>
        <GhostButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="h-3.5 w-3.5" /> Add Challenge
        </GhostButton>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Package className="h-8 w-8 text-muted-foreground/60" />
            No Lightning challenges yet for this product.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-md transition-shadow duration-200 hover:shadow-lg">
              <div className="flex flex-wrap items-center gap-1.5">
                {c.category ? (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${categoryColor(c.category)}`}>
                    {c.category}
                  </span>
                ) : (
                  <Pill tone="muted">No category</Pill>
                )}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{c.title || "Untitled"}</div>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.description || "No description yet."}</p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted-foreground">{c.video_url ? "🎬 Video attached" : "No attachment"}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setModal({ mode: "edit", challenge: c })}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#0284c7]"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => del(c.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <FlashModal
          format="lightning"
          product={product}
          categories={categories}
          existing={list}
          editing={modal.mode === "edit" ? modal.challenge : undefined}
          onAddCategory={addCategory}
          onClose={() => setModal(null)}
          onSave={(cs) => { save(cs); setModal(null); }}
        />
      )}
    </div>
  );
}

/* -------------------- Season tab -------------------- */

function SeasonTab() {
  const [list, setList] = useState<FlashSeason[]>(loadSeasons);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; season?: FlashSeason } | null>(null);
  const [challengesSeason, setChallengesSeason] = useState<FlashSeason | null>(null);

  useEffect(() => {
    setList(loadSeasons());
    return subscribeSeasons(() => setList(loadSeasons()));
  }, []);

  // Preload fonts for active seasons so previews render with the right family.
  useEffect(() => {
    list.forEach((s) => ensureGoogleFont(fontFamilyFor(s)));
  }, [list]);

  const del = (s: FlashSeason) => {
    if (!confirm(`Delete "${s.display_name}"? This cannot be undone.`)) return;
    deleteSeason(s.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {list.length} Season{list.length === 1 ? "" : "s"} · {list.filter((s) => s.active).length} active
        </div>
        <GhostButton onClick={() => setModal({ mode: "create" })}>
          <Plus className="h-3.5 w-3.5" /> Create Season
        </GhostButton>
      </div>

      {list.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 text-muted-foreground/60" />
            No Seasons yet.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <div key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md hover:shadow-lg transition-shadow duration-200">
              <div
                className="relative flex h-32 items-center justify-center"
                style={{
                  background: s.theme_image_url
                    ? `center / cover no-repeat url(${s.theme_image_url})`
                    : seasonGradientCss(s),
                }}

              >
                <div className="absolute inset-0 bg-black/25" />
                <div
                  className="relative text-xl font-bold tracking-tight text-white drop-shadow"
                  style={{ fontFamily: `"${fontFamilyFor(s)}", system-ui, sans-serif` }}
                >
                  {s.display_name}
                </div>
                <span className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.active ? "bg-emerald-500 text-white" : "bg-slate-500 text-white"}`}>
                  {s.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">{s.display_name}</div>
                  <div className="text-[11px] text-muted-foreground">🏅 {s.badge_name}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setChallengesSeason(s)}
                    className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-[#7e22ce]"
                    aria-label="Challenges"
                  >
                    <Package className="h-4 w-4" /> Challenges
                  </button>
                  <button
                    onClick={() => setModal({ mode: "edit", season: s })}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#7e22ce]"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => del(s)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <SeasonModal
          editing={modal.mode === "edit" ? modal.season : undefined}
          onClose={() => setModal(null)}
          onSave={(s) => { upsertSeason(s); setModal(null); }}
        />
      )}

      {challengesSeason && (
        <SeasonChallengesModal season={challengesSeason} onClose={() => setChallengesSeason(null)} />
      )}
    </div>
  );
}

/* -------------------- Season challenges manager -------------------- */

function SeasonChallengesModal({ season, onClose }: { season: FlashSeason; onClose: () => void }) {
  const [list, setList] = useState<FlashChallenge[]>(loadFlashChallenges);
  const [categories, setCategories] = useState<string[]>(loadCategories);
  const [product, setProduct] = useState<FlashProductId>("enterprise");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; challenge?: FlashChallenge } | null>(null);

  useEffect(() => {
    setList(loadFlashChallenges());
    setCategories(loadCategories());
    const un1 = subscribeFlashChallenges(() => setList(loadFlashChallenges()));
    const un2 = subscribeCategories(() => setCategories(loadCategories()));
    return () => { un1(); un2(); };
  }, []);

  const filtered = useMemo(
    () => seasonChallengesFor(list, season.id, product),
    [list, season.id, product],
  );

  const save = (cs: FlashChallenge[]) => {
    setList((prev) => {
      const ids = new Set(cs.map((c) => c.id));
      const next = [...prev.filter((x) => !ids.has(x.id)), ...cs];
      persistFlashChallenges(next);
      return next;
    });
  };
  const del = (id: string) => {
    if (!confirm("Delete this challenge?")) return;
    setList((prev) => {
      const next = removeChallengeAndUnsync(prev, id);
      persistFlashChallenges(next);
      return next;
    });
  };
  const addCategory = (name: string) => {
    setCategories((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      persistCategories(next);
      return next;
    });
  };

  return (
    <AccentModal
      background={seasonGradientCss(season)}
      iconTint="#ffffff"
      icon={Sparkles}
      eyebrow="Verbo Flash · Season"
      title={`${season.display_name} Challenges`}
      maxWidth="max-w-3xl"
      zClass="z-40"
      onClose={onClose}
    >
      <div className="max-h-[75vh] overflow-y-auto">
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap gap-2">
            {FLASH_PRODUCT_ORDER.map((p) => (
              <button
                key={p}
                onClick={() => setProduct(p)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  product === p
                    ? "border-[#7e22ce] bg-[#7e22ce]/10 text-[#7e22ce]"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                {FLASH_PRODUCT_LABEL[p]}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {filtered.length} challenge{filtered.length === 1 ? "" : "s"} for {FLASH_PRODUCT_LABEL[product]}
            </div>
            <GhostButton onClick={() => setModal({ mode: "create" })}>
              <Plus className="h-3.5 w-3.5" /> Add Challenge
            </GhostButton>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              <Sparkles className="h-8 w-8 text-muted-foreground/60" />
              No challenges yet for this Season — add one below.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((c) => (
                <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.category ? (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${categoryColor(c.category)}`}>
                        {c.category}
                      </span>
                    ) : (
                      <Pill tone="muted">No category</Pill>
                    )}
                    {c.premium && (
                      <Pill tone="warning" style={{ background: "#d97706", color: "#fff" }}>
                        Premium
                      </Pill>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{c.title || "Untitled"}</div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.description || "No description yet."}</p>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="text-[11px] text-muted-foreground">{c.video_url ? "🎬 Video attached" : "No attachment"}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setModal({ mode: "edit", challenge: c })}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#7e22ce]"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => del(c.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AccentModalFooter>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </AccentModalFooter>

      {modal && (
        <FlashModal
          format="season"
          product={product}
          categories={categories}
          existing={list}
          editing={modal.mode === "edit" ? modal.challenge : undefined}
          seasonId={season.id}
          headerBackground={seasonGradientCss(season)}
          titleOverride={`${modal.mode === "edit" ? "Edit" : "New"} ${season.display_name} Challenge`}
          onAddCategory={addCategory}
          onClose={() => setModal(null)}
          onSave={(cs) => { save(cs); setModal(null); }}
        />
      )}
    </AccentModal>
  );
}

function SeasonModal({
  editing,
  onClose,
  onSave,
}: {
  editing?: FlashSeason;
  onClose: () => void;
  onSave: (s: FlashSeason) => void;
}) {
  const isEdit = !!editing;
  const [displayName, setDisplayName] = useState(editing?.display_name ?? "");
  const [themeImageUrl, setThemeImageUrl] = useState(editing?.theme_image_url ?? "");
  const [watermarkImageUrl, setWatermarkImageUrl] = useState(editing?.watermark_image_url ?? "");
  const [accentColor, setAccentColor] = useState(editing?.accent_color ?? "#7e22ce");
  const [accentColorTo, setAccentColorTo] = useState(editing?.accent_color_to ?? "");
  const [fontPreset, setFontPreset] = useState<FontPreset>(editing?.font_preset ?? "Festive");
  const [customFont, setCustomFont] = useState(editing?.custom_font_name ?? "");
  const [active, setActive] = useState<boolean>(editing?.active ?? false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [fillMode, setFillMode] = useState<SeasonFillMode>(editing?.fill_mode ?? "solid");
  const [stops, setStops] = useState<GradientStop[]>(
    editing?.gradient_stops && editing.gradient_stops.length >= 2
      ? editing.gradient_stops
      : [
          { color: editing?.accent_color || "#7e22ce", position: 0 },
          { color: editing?.accent_color_to || "#111827", position: 100 },
        ],
  );

  const updateStop = (i: number, patch: Partial<GradientStop>) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStop = () =>
    setStops((prev) => [...prev, { color: "#ffffff", position: 50 }]);
  const removeStop = (i: number) =>
    setStops((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const family = fontFamilyFor({ font_preset: fontPreset, custom_font_name: customFont });
  const previewGradient = seasonGradientCss({
    accent_color: accentColor,
    accent_color_to: accentColorTo.trim() || undefined,
    fill_mode: fillMode,
    gradient_stops: stops,
  });
  const barGradient = seasonGradientCss(
    { accent_color: accentColor, accent_color_to: accentColorTo.trim() || undefined, fill_mode: fillMode, gradient_stops: stops },
    90,
  );
  useEffect(() => { ensureGoogleFont(family); }, [family]);

  const handleSave = () => {
    const name = displayName.trim();
    if (!name) return;
    const conflict = active ? conflictingActiveSeason(editing?.id ?? "") : null;
    if (conflict) {
      setActivationError(
        `"${conflict.display_name}" is still active. Only one Season can run at a time — deactivate it first, then activate this one.`,
      );
      return;
    }
    setActivationError(null);
    const id = editing?.id ?? `season-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    onSave({
      id,
      display_name: name,
      theme_image_url: themeImageUrl.trim() || undefined,
      watermark_image_url: watermarkImageUrl.trim() || undefined,
      accent_color: accentColor || undefined,
      accent_color_to: accentColorTo.trim() || undefined,
      fill_mode: fillMode,
      gradient_stops: fillMode === "gradient" ? stops : editing?.gradient_stops,
      font_preset: fontPreset,
      custom_font_name: fontPreset === "Custom" ? customFont.trim() || undefined : undefined,
      active,
      badge_name: `${name} Challenger`,
      created_at: editing?.created_at ?? new Date().toISOString(),
    });
  };

  return (
    <AccentModal
      background={
        themeImageUrl
          ? `center / cover no-repeat url(${themeImageUrl}), ${previewGradient}`
          : previewGradient
      }
      iconTint="#ffffff"
      icon={Sparkles}
      eyebrow="Verbo Flash · Season"
      title={
        <span style={{ fontFamily: `"${family}", system-ui, sans-serif` }}>
          {displayName || (isEdit ? "Edit Season" : "New Season")}
        </span>
      }
      maxWidth="max-w-xl"
      onClose={onClose}
    >
      <div className="max-h-[65vh] overflow-y-auto p-6 space-y-4">
          <Field label="Display Name">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
              placeholder="e.g. Halloween"
              autoFocus
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              Shown to students exactly as typed — must be in English.
            </div>
          </Field>

          <Field label="Theme Image / GIF URL (optional)">
            <input
              value={themeImageUrl}
              onChange={(e) => setThemeImageUrl(e.target.value)}
              className={inputCls}
              placeholder="https://... (image or .gif)"
            />
          </Field>

          <Field label="Watermark Image URL (optional)">
            <input
              value={watermarkImageUrl}
              onChange={(e) => setWatermarkImageUrl(e.target.value)}
              className={inputCls}
              placeholder="https://... (transparent background recommended, e.g. PNG)"
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              Reemplaza el watermark de texto del banner. Se muestra del lado derecho, detrás de los
              círculos de retos, con opacidad tenue. Si se deja vacío, se sigue usando el nombre de la
              season como texto de fondo.
            </div>
          </Field>

          <Field label="Background fill">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFillMode("solid")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fillMode === "solid" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
              >
                Solid color
              </button>
              <button
                type="button"
                onClick={() => setFillMode("gradient")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fillMode === "gradient" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
              >
                Gradient
              </button>
            </div>
          </Field>

          {fillMode === "solid" ? (
            <Field label="Accent Color">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-background"
                />
                <input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className={inputCls}
                  placeholder="#7e22ce"
                />
              </div>
            </Field>
          ) : (
            <Field label="Color stops">
              <div className="space-y-2">
                {stops.map((stop, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={stop.color}
                      onChange={(e) => updateStop(i, { color: e.target.value })}
                      className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-background"
                    />
                    <input
                      value={stop.color}
                      onChange={(e) => updateStop(i, { color: e.target.value })}
                      className={inputCls}
                      placeholder="#7e22ce"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={stop.position}
                        onChange={(e) => updateStop(i, { position: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                        className={`${inputCls} w-20`}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                    <button
                      type="button"
                      disabled={stops.length <= 2}
                      onClick={() => removeStop(i)}
                      title={stops.length <= 2 ? "At least 2 stops required" : "Remove stop"}
                      className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addStop}
                className="mt-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                + Add color stop
              </button>
              <div className="mt-3">
                <div className="mb-1 text-[11px] text-muted-foreground">Preview</div>
                <div className="h-10 w-full rounded-lg border border-border" style={{ background: barGradient }} />
              </div>
            </Field>
          )}





          <Field label="Typography">
            <select
              value={fontPreset}
              onChange={(e) => setFontPreset(e.target.value as FontPreset)}
              className={inputCls}
            >
              {FONT_PRESET_ORDER.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {fontPreset === "Custom" && (
              <input
                value={customFont}
                onChange={(e) => setCustomFont(e.target.value)}
                className={`${inputCls} mt-2`}
                placeholder="Google Font name (e.g. Bebas Neue)"
              />
            )}
          </Field>

          <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-[#7e22ce] focus:ring-[#7e22ce]"
            />
            <span className="flex-1">
              <span className="block text-xs font-semibold text-foreground">Active</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Turning this on shows it to students immediately. No countdown — it stays active until you turn it off.
              </span>
            </span>
          </label>

          {activationError && (
            <p className="rounded-lg border border-[#b52904]/30 bg-[#b52904]/10 px-3 py-2 text-[11px] font-medium text-[#b52904]">
              {activationError}
            </p>
          )}
      </div>
      <AccentModalFooter accent="#5fca16">
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton accentColor="#5fca16" disabled={!displayName.trim()} onClick={handleSave}>
          {isEdit ? "Save Changes" : "Save Season"}
        </PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}


/* -------------------- Shared banner theme editor -------------------- */

type BannerTheme = {
  theme_image_url?: string;
  watermark_image_url?: string;
  accent_color?: string;
  accent_color_to?: string;
  fill_mode?: SeasonFillMode;
  gradient_stops?: GradientStop[];
};

function BannerThemeCard({
  title,
  description,
  value,
  onSave,
}: {
  title: string;
  description: string;
  value: BannerTheme;
  onSave: (theme: BannerTheme) => void;
}) {
  const [themeImageUrl, setThemeImageUrl] = useState(value.theme_image_url ?? "");
  const [watermarkImageUrl, setWatermarkImageUrl] = useState(value.watermark_image_url ?? "");
  const [accentColor, setAccentColor] = useState(value.accent_color ?? "#7e22ce");
  const [accentColorTo, setAccentColorTo] = useState(value.accent_color_to ?? "");
  const [fillMode, setFillMode] = useState<SeasonFillMode>(value.fill_mode ?? "solid");
  const [stops, setStops] = useState<GradientStop[]>(
    value.gradient_stops && value.gradient_stops.length >= 2
      ? value.gradient_stops
      : [
          { color: value.accent_color || "#7e22ce", position: 0 },
          { color: value.accent_color_to || "#111827", position: 100 },
        ],
  );

  const updateStop = (i: number, patch: Partial<GradientStop>) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStop = () => setStops((prev) => [...prev, { color: "#ffffff", position: 50 }]);
  const removeStop = (i: number) =>
    setStops((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const barGradient = seasonGradientCss(
    {
      accent_color: accentColor,
      accent_color_to: accentColorTo.trim() || undefined,
      fill_mode: fillMode,
      gradient_stops: stops,
    },
    90,
  );

  const handleSave = () =>
    onSave({
      theme_image_url: themeImageUrl.trim() || undefined,
      watermark_image_url: watermarkImageUrl.trim() || undefined,
      accent_color: accentColor || undefined,
      accent_color_to: accentColorTo.trim() || undefined,
      fill_mode: fillMode,
      gradient_stops: fillMode === "gradient" ? stops : value.gradient_stops,
    });

  return (
    <Card>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      <div className="mt-4 space-y-4">
        <Field label="Theme Image / GIF URL (optional)">
          <input
            value={themeImageUrl}
            onChange={(e) => setThemeImageUrl(e.target.value)}
            className={inputCls}
            placeholder="https://... (image or .gif)"
          />
        </Field>

        <Field label="Watermark Image URL (optional)">
          <input
            value={watermarkImageUrl}
            onChange={(e) => setWatermarkImageUrl(e.target.value)}
            className={inputCls}
            placeholder="https://... (transparent background recommended, e.g. PNG)"
          />
          <div className="mt-1 text-[11px] text-muted-foreground">
            Reemplaza el watermark de texto del banner. Se muestra del lado derecho, con opacidad
            tenue. Si se deja vacío, se sigue usando el texto de fondo por defecto.
          </div>
        </Field>

        <Field label="Background fill">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFillMode("solid")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fillMode === "solid" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              Solid color
            </button>
            <button
              type="button"
              onClick={() => setFillMode("gradient")}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${fillMode === "gradient" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              Gradient
            </button>
          </div>
        </Field>

        {fillMode === "solid" ? (
          <Field label="Accent Color">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-background"
              />
              <input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className={inputCls}
                placeholder="#7e22ce"
              />
            </div>
          </Field>
        ) : (
          <Field label="Color stops">
            <div className="space-y-2">
              {stops.map((stop, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={stop.color}
                    onChange={(e) => updateStop(i, { color: e.target.value })}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-border bg-background"
                  />
                  <input
                    value={stop.color}
                    onChange={(e) => updateStop(i, { color: e.target.value })}
                    className={inputCls}
                    placeholder="#7e22ce"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={stop.position}
                      onChange={(e) => updateStop(i, { position: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      className={`${inputCls} w-20`}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <button
                    type="button"
                    disabled={stops.length <= 2}
                    onClick={() => removeStop(i)}
                    title={stops.length <= 2 ? "At least 2 stops required" : "Remove stop"}
                    className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStop}
              className="mt-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              + Add color stop
            </button>
            <div className="mt-3">
              <div className="mb-1 text-[11px] text-muted-foreground">Preview</div>
              <div className="h-10 w-full rounded-lg border border-border" style={{ background: barGradient }} />
            </div>
          </Field>
        )}

        <div className="flex justify-end">
          <PrimaryButton accentColor="#5fca16" onClick={handleSave}>Save</PrimaryButton>
        </div>
      </div>
    </Card>
  );
}
