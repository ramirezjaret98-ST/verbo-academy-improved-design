import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { X, Play, Zap, Gift, Sparkles } from "lucide-react";
import { Eye } from "lucide-react";
import { Card, Pill, GhostButton, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import { categoryTheme, categoryBackground } from "@/lib/challenge-theme";
import { categoryColor } from "@/lib/challenges-store";
import {
  type FlashChallenge,
  type FlashProductId,
  type FlashFormat,
  type FlashSeason,
  type LightningState,
  FLASH_PRODUCT_ORDER,
  FLASH_PRODUCT_LABEL,
  loadFlashChallenges,
  subscribeFlashChallenges,
  flashChallengesFor,
  loadLightning,
  subscribeLightning,
  loadSeasons,
  subscribeSeasons,
  fontFamilyFor,
  ensureGoogleFont,
} from "@/lib/flash-challenges-store";

export const Route = createFileRoute("/teacher/flash")({
  head: () => ({
    meta: [
      { title: "Verbo Flash — Verbo Academy" },
      { name: "description", content: "Preview Flash challenges, Seasons and the live Lightning across all products." },
    ],
  }),
  component: Page,
});

type Tab = "mystery_box" | "lightning" | "season";

const TAB_META: Record<Tab, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  mystery_box: { label: "Mystery Box", icon: Gift },
  lightning: { label: "Lightning", icon: Zap },
  season: { label: "Seasons", icon: Sparkles },
};

function CategoryBadge({ name }: { name: string }) {
  if (!name) return <Pill tone="muted">No category</Pill>;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${categoryColor(name)}`}>
      {name}
    </span>
  );
}

function SkillChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function Page() {
  const [challenges, setChallenges] = useState<FlashChallenge[]>(loadFlashChallenges);
  const [lightning, setLightning] = useState<LightningState>(loadLightning);
  const [seasons, setSeasons] = useState<FlashSeason[]>(loadSeasons);
  const [productId, setProductId] = useState<FlashProductId>("enterprise");
  const [tab, setTab] = useState<Tab>("mystery_box");
  const [preview, setPreview] = useState<FlashChallenge | null>(null);

  useEffect(() => {
    setChallenges(loadFlashChallenges());
    const u1 = subscribeFlashChallenges(() => setChallenges(loadFlashChallenges()));
    const u2 = subscribeLightning(() => setLightning(loadLightning()));
    const u3 = subscribeSeasons(() => setSeasons(loadSeasons()));
    return () => { u1(); u2(); u3(); };
  }, []);

  const lightningChallenge = useMemo(
    () => (lightning.challenge_id ? challenges.find((c) => c.id === lightning.challenge_id) ?? null : null),
    [challenges, lightning.challenge_id],
  );

  const activeSeasons = useMemo(() => seasons.filter((s) => s.active), [seasons]);

  useEffect(() => {
    activeSeasons.forEach((s) => ensureGoogleFont(fontFamilyFor(s)));
  }, [activeSeasons]);

  const list = flashChallengesFor(challenges, tab as FlashFormat, productId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Verbo Flash</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Browse Flash challenges and Seasons across all products — try them without affecting any student's streak, cooldown, or the live Lightning event.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FLASH_PRODUCT_ORDER.map((pid) => {
          const active = pid === productId;
          return (
            <button
              key={pid}
              onClick={() => setProductId(pid)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              {FLASH_PRODUCT_LABEL[pid]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border">
        {(Object.keys(TAB_META) as Tab[]).map((t) => {
          const active = t === tab;
          const Icon = TAB_META[t].icon;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {TAB_META[t].label}
            </button>
          );
        })}
      </div>

      {tab === "lightning" && (
        <div className="space-y-4">
          {lightning.status === "live" && lightningChallenge ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Pill tone="warning"><Zap className="mr-1 h-3 w-3" /> Live now</Pill>
                    <span className="text-xs text-muted-foreground">
                      {FLASH_PRODUCT_LABEL[lightning.product ?? "enterprise"]}
                    </span>
                  </div>
                  <div className="mt-2 text-base font-semibold text-foreground">{lightningChallenge.title}</div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {lightningChallenge.description || "No description available."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <CategoryBadge name={lightningChallenge.category} />
                    {(lightningChallenge.skill_tags ?? []).map((s) => <SkillChip key={s} label={s} />)}
                  </div>
                  {lightning.expires_at && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Expires {new Date(lightning.expires_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <GhostButton onClick={() => setPreview(lightningChallenge)}>Preview</GhostButton>
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
                Preview only — accepting or completing this Lightning wouldn't affect the live event, so the accept action is disabled.
              </div>
            </Card>
          ) : (
            <Card>
              <div className="py-8 text-center text-sm text-muted-foreground">
                No Lightning is live right now.
              </div>
            </Card>
          )}

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lightning bank · {FLASH_PRODUCT_LABEL[productId]}
            </div>
            <ChallengeGrid list={list} onOpen={setPreview} />
          </div>
        </div>
      )}

      {tab === "mystery_box" && (
        <ChallengeGrid list={list} onOpen={setPreview} />
      )}

      {tab === "season" && (
        <div className="space-y-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Seasons</div>
            {activeSeasons.length === 0 ? (
              <Card>
                <div className="py-6 text-center text-sm text-muted-foreground">No Seasons active right now.</div>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeSeasons.map((s) => (
                  <Card key={s.id}>
                    <div className="flex items-center gap-3">
                      {s.theme_image_url && (
                        <img src={s.theme_image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      )}
                      <div>
                        <div
                          className="text-base font-semibold text-foreground"
                          style={{ fontFamily: fontFamilyFor(s), color: s.accent_color }}
                        >
                          {s.display_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{s.badge_name}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Season challenge bank · {FLASH_PRODUCT_LABEL[productId]}
            </div>
            <ChallengeGrid list={list} onOpen={setPreview} />
          </div>
        </div>
      )}

      {preview && <PreviewModal challenge={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ChallengeGrid({ list, onOpen }: { list: FlashChallenge[]; onOpen: (c: FlashChallenge) => void }) {
  if (list.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-muted-foreground">
          No challenges yet in this bank.
        </div>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((c) => (
        <button
          key={c.id}
          onClick={() => onOpen(c)}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-soft verbo-lift hover:border-accent hover:shadow-elevated"
        >
          <div className="flex items-start justify-between gap-2">
            <CategoryBadge name={c.category} />
            <Pill tone="muted">Preview</Pill>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{c.title}</div>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.description || "Tap to see the details."}</p>
          </div>
          {c.skill_tags && c.skill_tags.length > 0 && (
            <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
              {c.skill_tags.map((s) => <SkillChip key={s} label={s} />)}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function PreviewModal({ challenge, onClose }: { challenge: FlashChallenge; onClose: () => void }) {
  const theme = categoryTheme(challenge.category);
  return (
    <AccentModal
      maxWidth="max-w-xl"
      background={categoryBackground(challenge.category)}
      iconTint="rgba(255,255,255,0.18)"
      icon={Eye}
      eyebrow={`Preview · ${FLASH_PRODUCT_LABEL[challenge.product]} · ${challenge.format.replace("_", " ")}`}
      title={challenge.title}
      watermark={{ type: "icon", icon: Eye }}
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <CategoryBadge name={challenge.category} />
        <Pill tone="muted">Preview</Pill>
        {challenge.skill_tags?.map((s) => <SkillChip key={s} label={s} />)}
      </div>
      <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-foreground">
            {challenge.description || "No description available."}
          </p>
          {challenge.video_url && (
            <a
              href={challenge.video_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
            >
              <Play className="h-3.5 w-3.5" /> Watch reference video
            </a>
          )}
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
            Preview mode — nothing here affects any student's streak, cooldown, badges, or the live Lightning event.
          </div>
        </div>

      <AccentModalFooter accent={theme.solid}>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </AccentModalFooter>
    </AccentModal>
  );
}
