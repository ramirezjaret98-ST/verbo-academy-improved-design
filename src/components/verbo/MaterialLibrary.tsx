import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, GhostButton, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import { hasUploadedFile, useCategories, type StoredMaterial } from "@/lib/materials-store";
import type { MaterialType } from "@/lib/mock-data";
import { PremiumBadge } from "@/components/verbo/PremiumGate";
import { useAuth } from "@/lib/auth";
import { groupsByStudentId } from "@/lib/groups-store";
import listeningArt from "@/assets/Listiening.svg";
import grammarArt from "@/assets/Grammar.svg";
import vocabularyArt from "@/assets/Vocabulary_2.svg";
import speakingArt from "@/assets/speaking.svg";
import premiumArt from "@/assets/Premium.svg";
import gettingStartedArt from "@/assets/Getting_Started.svg";
import studyTipsArt from "@/assets/study_tips.svg";
import businessArt from "@/assets/Business.svg";
import troubleshootingArt from "@/assets/Troubleshooting.svg";


import {
  Book,
  FileText,
  ListChecks,
  Video,
  Image as ImageIcon,
  Download,
  Eye,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  X,
  Search,
  Sparkles,
  Lock,
  Headphones,
  SpellCheck,
  Type,
  Mic,
  Crown,
  Rocket,
  Lightbulb,
  Briefcase,
  LifeBuoy,
  Tag,
} from "lucide-react";


const TYPE_ICON: Record<MaterialType, typeof Book> = {
  book: Book,
  pdf: FileText,
  "verb-list": ListChecks,
  video: Video,
  image: ImageIcon,
};

const TYPE_TINT: Record<MaterialType, string> = {
  book: "bg-amber-500/15 text-amber-400",
  pdf: "bg-rose-500/15 text-rose-400",
  "verb-list": "bg-emerald-500/15 text-emerald-400",
  video: "bg-sky-500/15 text-sky-400",
  image: "bg-violet-500/15 text-violet-400",
};

/**
 * Accent colors cycled through by admin-created extra categories. The known
 * categories define their own solid accent inline.
 */
const EXTRA_ACCENTS = ["#024366", "#c2410c", "#0f766e", "#7e22ce", "#a855f7", "#14b8a6"];


const PREMIUM_KEY = "__premium__";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

function letterOf(title: string): string {
  const c = (title.trim()[0] ?? "#").toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

function CoverArt({ m, className = "" }: { m: StoredMaterial; className?: string }) {
  const Icon = TYPE_ICON[m.material_type];
  if (m.cover_image) {
    return <img src={m.cover_image} alt={m.title} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`relative h-full w-full bg-gradient-to-br from-secondary/60 to-secondary/20 ${className}`}>
      <Icon
        className={`absolute bottom-3 right-3 h-16 w-16 ${TYPE_TINT[m.material_type].split(" ").find((c) => c.startsWith("text-")) ?? "text-foreground"}`}
        style={{ opacity: 0.15 }}
      />
    </div>
  );
}


function PreviewModal({ m, onClose }: { m: StoredMaterial; onClose: () => void }) {
  const isPdf = m.material_type === "pdf";
  const isVideo = m.material_type === "video";
  return (
    <div className="verbo-overlay-in fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Pill tone="muted">{m.material_type}</Pill>
            <h3 className="text-sm font-semibold text-foreground">{m.title}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-secondary/30 p-5">
          {isPdf ? (
            <iframe title={m.title} src={m.upload_url} className="h-[60vh] w-full rounded-lg border border-border bg-background" />
          ) : isVideo ? (
            <video src={m.upload_url} controls className="h-[60vh] w-full rounded-lg bg-black">
              Your browser does not support embedded video.
            </video>
          ) : (
            <div className="mx-auto flex max-w-sm flex-col items-center">
              <div className="aspect-[3/4] w-full overflow-hidden rounded-xl border border-border">
                <CoverArt m={m} />
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">Open or download this resource to view its full contents.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <GhostButton onClick={onClose}>Close</GhostButton>
          <a href={m.upload_url} target="_blank" rel="noreferrer">
            <PrimaryButton>
              <Download className="h-3.5 w-3.5" /> Download
            </PrimaryButton>
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Upgrade modal for the dedicated Premium category. Same access rule and the
 * same group-vs-individual distinction as AccessGateNotice, with warmer,
 * benefit-led copy for this commercial showcase.
 */
function PremiumUpsellModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const isGroup = !!(user && groupsByStudentId().has(user.id));
  return (
    <div className="verbo-overlay-in fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <PremiumBadge />
            <h3 className="text-sm font-semibold text-foreground">Premium resources</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <Lock className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-foreground">There's a whole library waiting for you</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {isGroup
              ? "Premium resources — deep-dive guides, curated workbooks and exclusive practice packs — come with Advance tier and up. They're not part of your group's plan yet: ask your admin to expand access and unlock them for everyone."
              : "Premium resources — deep-dive guides, curated workbooks and exclusive practice packs — come with Advance tier and up. Move up an access level and they're all yours, instantly."}
          </p>
          {!isGroup && (
            <Link
              to="/student/access-levels"
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/25"
            >
              <Sparkles className="h-3.5 w-3.5" /> See what Premium unlocks
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Category tile — light shell, category color lives only in accents:
 * a 4px top accent bar, a tinted icon chip, a very subtle corner blob and a
 * text CTA with an arrow. `art` renders an optional decorative pattern behind.
 */
function SpotlightCategoryCard({
  name,
  subtitle,
  accent,
  icon: Icon,
  iconImage,
  compact = false,
  noBlob = false,
  badge,
  art,
  onClick,
}: {
  name: string;
  subtitle: string;
  accent: string;
  icon: typeof Book;
  iconImage?: string;
  compact?: boolean;
  noBlob?: boolean;
  badge?: React.ReactNode;
  art?: { src: string; className: string };
  onClick: () => void;
}) {

  return (
    <div
      className={`verbo-tile group relative flex h-full ${compact ? "min-h-[132px]" : "min-h-[168px]"} flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-elevated`}
    >
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 h-1 rounded-t-2xl"
        style={{ backgroundColor: accent }}
      />
      {!noBlob && (
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${accent}1A, transparent 70%)` }}
        />
      )}
      {art && (
        <img
          src={art.src}
          alt=""
          aria-hidden="true"
          className={"pointer-events-none absolute z-0 select-none " + art.className}
        />
      )}

      <div className="relative z-10 flex items-start gap-4">
        {iconImage ? (
          <img
            src={iconImage}
            alt=""
            aria-hidden="true"
            className={`verbo-ease-out-expo shrink-0 select-none object-contain transition-transform duration-500 group-hover:scale-[1.06] ${
              compact ? "h-14 w-14" : "h-[72px] w-[72px]"
            }`}
          />
        ) : (
          <div
            className={`verbo-ease-out-expo flex shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:scale-[1.06] ${
              compact ? "h-12 w-12" : "h-16 w-16"
            }`}
            style={{ backgroundColor: `${accent}1F` }}
          >
            <Icon className={compact ? "h-6 w-6" : "h-8 w-8"} style={{ color: accent }} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[19px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
              {name}
            </h3>
            {badge}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.5] text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-4 flex justify-start">
        <button
          type="button"
          onClick={onClick}
          className="verbo-press inline-flex cursor-pointer items-center gap-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ color: accent, "--tw-ring-color": `${accent}66` } as React.CSSProperties}
        >
          Browse Material
          <ArrowRight className="verbo-ease-out-expo h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}


function MaterialCard({ m, onPreview }: { m: StoredMaterial; onPreview: (m: StoredMaterial) => void }) {
  const TypeIcon = TYPE_ICON[m.material_type];
  return (
    <Card className="!p-0 overflow-hidden verbo-card-hover">
      <div className="relative">
        <div className="aspect-video w-full overflow-hidden border-b border-border">
          <CoverArt m={m} />
        </div>
        <div
          className={`absolute -bottom-4 left-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 shadow-sm ${TYPE_TINT[m.material_type].split(" ").find((c) => c.startsWith("text-")) ?? ""}`}
        >
          <TypeIcon className="h-4.5 w-4.5" />
        </div>
      </div>
      <div className="space-y-3 p-4 pt-6">
        <div>
          <div className="text-base font-semibold text-foreground">{m.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ring-current/30 ${TYPE_TINT[m.material_type]}`}
            >
              {m.material_type}
            </span>
            {m.premium && <PremiumBadge />}
          </div>
        </div>


        {hasUploadedFile(m) ? (
          <div className="flex gap-2">
            <GhostButton className="flex-1 justify-center" onClick={() => onPreview(m)}>
              <Eye className="h-3.5 w-3.5" /> Preview
            </GhostButton>
            <a href={m.upload_url} target="_blank" rel="noreferrer" className="flex-1">
              <PrimaryButton className="w-full justify-center">
                <Download className="h-3.5 w-3.5" /> Download
              </PrimaryButton>
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <GhostButton disabled className="flex-1 justify-center cursor-not-allowed opacity-50">
                <Eye className="h-3.5 w-3.5" /> Preview
              </GhostButton>
              <GhostButton disabled className="flex-1 justify-center cursor-not-allowed opacity-50">
                <Download className="h-3.5 w-3.5" /> Download
              </GhostButton>
            </div>
            <p className="text-xs text-muted-foreground">Coming soon — file pending upload</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export function MaterialLibrary({
  items,
  title = "Resources",
  hasPremiumAccess = true,
}: {
  items: StoredMaterial[];
  title?: string;
  hasPremiumAccess?: boolean;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [preview, setPreview] = useState<StoredMaterial | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [query, setQuery] = useState("");
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Premium materials leave their original category and live in the dedicated
  // "Premium" showcase instead.
  const { grouped, premiumItems } = useMemo(() => {
    const g: Record<string, StoredMaterial[]> = {};
    const prem: StoredMaterial[] = [];
    for (const m of items) {
      if (m.premium) prem.push(m);
      else (g[m.category] ||= []).push(m);
    }
    return { grouped: g, premiumItems: prem };
  }, [items]);

  // Seeded categories are included even when they still have zero materials.
  const storeCategories = useCategories();

  const isPremiumView = category === PREMIUM_KEY;
  const active = isPremiumView ? premiumItems : category ? grouped[category] ?? [] : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? active.filter((m) => m.title.toLowerCase().includes(q)) : active;
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [active, query]);

  const availableLetters = useMemo(() => new Set(filtered.map((m) => letterOf(m.title))), [filtered]);

  const byLetter = useMemo(() => {
    const map: Record<string, StoredMaterial[]> = {};
    for (const m of filtered) (map[letterOf(m.title)] ||= []).push(m);
    return map;
  }, [filtered]);

  const openCategory = (key: string) => {
    if (key === PREMIUM_KEY && !hasPremiumAccess) {
      setUpsell(true);
      return;
    }
    setQuery("");
    setCategory(key);
  };

  const scrollToLetter = (l: string) => {
    letterRefs.current[l]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const knownNames = [
    "Grammar",
    "Vocabulary",
    "Business",
    "Speaking",
    "Listening",
    "Troubleshooting",
    "Getting Started",
    "Study Tips",
  ];
  const extraCategories = Array.from(new Set([...storeCategories, ...Object.keys(grouped)]))
    .filter((c) => !knownNames.includes(c))
    .sort();

  const mainCards: {
    name: string;
    subtitle: string;
    accent: string;
    icon: typeof Book;
    iconImage?: string;
    badge?: React.ReactNode;
    onClick: () => void;
  }[] = [
    {
      name: "Listening",
      subtitle: "Audio practice and listening exercises to train your ear.",
      accent: "#ef8f14",
      icon: Headphones,
      iconImage: listeningArt,
      onClick: () => openCategory("Listening"),
    },
    {
      name: "Grammar",
      subtitle: "Structures and practice sheets to sharpen your grammar.",
      accent: "#157f36",
      icon: SpellCheck,
      iconImage: grammarArt,
      onClick: () => openCategory("Grammar"),
    },
    {
      name: "Vocabulary",
      subtitle: "Word lists and expressions to grow your everyday vocabulary.",
      accent: "#2f6fe4",
      icon: Type,
      iconImage: vocabularyArt,
      onClick: () => openCategory("Vocabulary"),
    },
    {
      name: "Speaking",
      subtitle: "Prompts and exercises to build real speaking confidence.",
      accent: "#d13da4",
      icon: Mic,
      iconImage: speakingArt,
      onClick: () => openCategory("Speaking"),
    },
    {
      name: "Premium",
      subtitle: "Deep-dive guides and exclusive practice packs for Advance tier and up.",
      accent: "#b45309",
      icon: Crown,
      iconImage: premiumArt,
      badge: <PremiumBadge />,
      onClick: () => openCategory(PREMIUM_KEY),
    },
    {
      name: "Getting Started",
      subtitle: "Everything you need to take your first steps with confidence.",
      accent: "#f97316",
      icon: Rocket,
      iconImage: gettingStartedArt,
      onClick: () => openCategory("Getting Started"),
    },
    {
      name: "Study Tips",
      subtitle: "Habits, routines and techniques to study smarter every week.",
      accent: "#a41630",
      icon: Lightbulb,
      iconImage: studyTipsArt,
      onClick: () => openCategory("Study Tips"),
    },
    {
      name: "Business",
      subtitle: "Templates and phrases for professional communication.",
      accent: "#01304a",
      icon: Briefcase,
      iconImage: businessArt,
      onClick: () => openCategory("Business"),
    },
    ...extraCategories.map((c, i) => ({
      name: c,
      subtitle: "Complementary resources for this category.",
      accent: EXTRA_ACCENTS[i % EXTRA_ACCENTS.length],
      icon: Tag as typeof Book,
      onClick: () => openCategory(c),
    })),
  ];



  const headerLabel = isPremiumView ? "Premium" : category;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button onClick={() => setCategory(null)} className={category ? "hover:text-foreground" : "font-medium text-foreground"}>
          {title}
        </button>
        {category && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{headerLabel}</span>
          </>
        )}
      </div>

      {!category ? (
        <div key="cat-root" className="verbo-crossfade space-y-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.26em]" style={{ color: "#c8801a" }}>
                Library
              </div>
              <h1 className="mt-1.5 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
                {title}
              </h1>
              <p className="mt-2.5 max-w-xl text-[15px] leading-[1.6] text-muted-foreground">
                Complementary resources to help you keep improving between sessions.
              </p>
            </div>
            {/* Troubleshooting — deliberately detached from the content categories */}
            <div className="w-full lg:w-80">
              <SpotlightCategoryCard
                name="Troubleshooting"
                subtitle="Quick fixes and answers for common technical issues."
                accent="#64748b"
                icon={LifeBuoy}
                iconImage={troubleshootingArt}
                noBlob
                compact
                onClick={() => openCategory("Troubleshooting")}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mainCards.map((c) => (
              <SpotlightCategoryCard
                key={c.name}
                name={c.name}
                subtitle={c.subtitle}
                accent={c.accent}
                icon={c.icon}
                iconImage={c.iconImage}
                badge={c.badge}
                onClick={c.onClick}
              />
            ))}

          </div>
        </div>

      ) : (
        <div key={`cat-${category}`} className="verbo-crossfade space-y-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.26em]" style={{ color: "#c8801a" }}>
                {title}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                <h1 className="text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
                  {headerLabel}
                </h1>
                {isPremiumView && <PremiumBadge />}
              </div>
            </div>
            <GhostButton onClick={() => setCategory(null)}>
              <ArrowLeft className="h-3.5 w-3.5" /> All categories
            </GhostButton>
          </div>

          {/* Search + A-Z index (single compact row) */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/95 px-2 py-2 backdrop-blur">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title…"
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-1">
              {LETTERS.filter((l) => availableLetters.has(l)).map((l) => (
                <button
                  key={l}
                  onClick={() => scrollToLetter(l)}
                  className="h-7 w-7 rounded-md text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>


          <SectionTitle>
            {filtered.length} {filtered.length === 1 ? "resource" : "resources"}
          </SectionTitle>

          {filtered.length === 0 ? (
            <Card className="text-sm text-muted-foreground">
              {isPremiumView && premiumItems.length === 0
                ? "Premium resources are on their way — we're curating them right now. Check back soon."
                : query
                  ? "No resources match your search."
                  : "No resources in this category yet."}
            </Card>
          ) : (
            <div className="space-y-8">
              {LETTERS.filter((l) => byLetter[l]?.length).map((l) => (
                <div
                  key={l}
                  ref={(el) => {
                    letterRefs.current[l] = el;
                  }}
                  className="scroll-mt-20 space-y-3"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{l}</div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {byLetter[l].map((m) => (
                      <MaterialCard key={m.id} m={m} onPreview={setPreview} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preview && <PreviewModal m={preview} onClose={() => setPreview(null)} />}
      {upsell && <PremiumUpsellModal onClose={() => setUpsell(false)} />}
    </div>
  );
}
