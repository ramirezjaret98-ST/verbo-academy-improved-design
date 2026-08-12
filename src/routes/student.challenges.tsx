import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Lock,
  Trophy,
  CheckCircle2,
  Play,
  Sparkles,
  X,
  Share2,
  Link2,
  Upload,
  Gift,
  Zap,
  Pencil,
  Crown,
  Flame,
  Plus,
  Gem,
  Medal,
  Video,
  Clapperboard,
  Headphones,
  Ear,
  Mail,
  BookOpen,
  PenLine,
  MessagesSquare,
  Users,
  Presentation,
  Handshake,
  Megaphone,
  Briefcase,
  Tag,
  Clock,
  Shield,
  ShieldAlert,

  type LucideIcon,
} from "lucide-react";

import { Card, Pill, PrimaryButton, GhostButton, SuccessButton, AccentModalHeader } from "@/components/verbo/ui";
import { Confetti } from "@/components/verbo/Confetti";
import { useAuth } from "@/lib/auth";
import {
  type Challenge,
  type ChallengeProductId,
  type DifficultyId,
  DIFFICULTY_META,
  DIFFICULTY_ORDER,
  CHALLENGES_PER_DIFFICULTY,
  loadChallenges,
  subscribeChallenges,
  challengesFor,
  challengeProductsFor,
  challengesForAccount,
} from "@/lib/challenges-store";
import { totalCompletedChallenges } from "@/lib/student-model";
import {
  type ChallengeSubmission,
  type ChallengeSubmissionFormat,
  chooseChallenge,
  completeChallenge,
  completeCooldownRemaining,
  hasChosenChallenge,
  hasCompletedChallenge,
  getSharedResult,
  shareChallengeResult,
  getSubmission,
  submitChallenge,
  resubmitChallenge,
  subscribeStudents,
  openMysteryBox,
  mysteryBoxCooldownRemaining,
  activeMysteryBoxPick,
  setMysteryBoxPick,
} from "@/lib/students-store";
import {
  type FlashChallenge,
  type FlashConfig,
  type LightningTheme,
  type FlashProductId,
  type FlashSeason,
  type LightningState,
  loadFlashChallenges,
  loadFlashConfig,
  loadLightningTheme,
  subscribeLightningTheme,
  subscribeFlashChallenges,
  subscribeFlashConfig,
  flashChallengesFor,
  seasonChallengesFor,
  loadLightning,
  subscribeLightning,
  acceptLightning,
  isLightningVisibleForStudents,
  loadSeasons,
  subscribeSeasons,
  fontFamilyFor,
  ensureGoogleFont,
  seasonGradientCss,
} from "@/lib/flash-challenges-store";
import {
  completeLightningChallenge,
  openSeason,
  seasonCooldownRemaining,
  completeSeasonChallenge,
} from "@/lib/students-store";
import { USERS } from "@/lib/mock-data";
import { hydrateTeachers } from "@/lib/teacher-model";
import { groupsByStudentId } from "@/lib/groups-store";
import { setAvatar, useAvatar } from "@/lib/avatar-store";
import {
  getLeaderboardIdentity,
  setLeaderboardIdentity,
  subscribeLeaderboardIdentity,
  colorFromString,
  initialsOf,
  type LeaderboardIdentityMode,
} from "@/lib/leaderboard-identity-store";
import {
  loadBadges as loadProfileBadges,
  subscribeBadges as subscribeProfileBadges,
  isBadgeEarned as isProfileBadgeEarned,
  buildProfileBadgeContext,
  type BadgeDef as ProfileBadgeDef,
} from "@/lib/profile-badges-store";
import { isBadgeManuallyGranted } from "@/lib/badge-override-store";
import {
  loadEquippedBadgeIds,
  setEquippedBadgeIds,
  subscribeEquippedBadges,
  EQUIPPED_MAX,
} from "@/lib/equipped-profile-badges-store";
import { BadgePickerModal, BadgeVisual } from "@/components/verbo/ProfileModal";
import fireIconAsset from "@/assets/fire-animation.svg";
import trophyIconAsset from "@/assets/trophy-animation.svg";
import confettiIconAsset from "@/assets/success-confetti.svg";
import verbotHeroAsset from "@/assets/Verbot_Challenges_hero.svg";
import crownIconAsset from "@/assets/crown-animation.svg";
import winnerBadgeAsset from "@/assets/winner-badge.svg";
import silverCoinAsset from "@/assets/silver-coin.svg";
import bronzeCoinAsset from "@/assets/bronze-coin.svg";

export const Route = createFileRoute("/student/challenges")({ component: Page });

const COOLDOWN_MSG =
  "You've already completed a Challenge in the last 24 hours — come back soon for your next one!";
const MYSTERY_COOLDOWN_MSG =
  "You've already opened today's Mystery Box — come back tomorrow!";

import { PREMIUM_ACCESS, PremiumBadge, AccessGateNotice } from "@/components/verbo/PremiumGate";
import { ReportContentIssueModal } from "@/components/verbo/ReportContentIssueModal";




/* -------------------------------------------------------------------------- */
/* Style tokens — reused from Learning Path so the visual language matches.   */
/* -------------------------------------------------------------------------- */
const PRODUCT_GRADIENTS: Record<string, string> = {
  enterprise: "from-[#01304a] via-[#024366] to-[#0a5e88]",
  go: "from-[#7c2d12] via-[#c2410c] to-[#f97316]",
  international: "from-[#134e4a] via-[#0f766e] to-[#14b8a6]",
  vip: "from-[#4a044e] via-[#7e22ce] to-[#a855f7]",
};



/* -------------------------------------------------------------------------- */
/* Reusable atoms                                                              */
/* -------------------------------------------------------------------------- */
function DifficultyDots({ difficulty, className = "" }: { difficulty: DifficultyId; className?: string }) {
  const { dots } = DIFFICULTY_META[difficulty];
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < dots ? "bg-white/90" : "border border-white/40 bg-transparent"}`}
        />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Challenge card shell — shares the visual language of Resources' spotlight   */
/* cards: rounded-3xl, bespoke vibrant gradient, oversized decorative motif    */
/* bleeding out of the bottom-right corner, content kept on the left column.   */
/* -------------------------------------------------------------------------- */
const DIFFICULTY_GRADIENTS: Record<DifficultyId, string> = {
  esencial: "from-[#0f766e] via-[#12a594] to-[#34d399]",
  intermedio: "from-[#1d4ed8] via-[#0284c7] to-[#22b8d6]",
  avanzado: "from-[#b91c1c] via-[#ea580c] to-[#f59e0b]",
  experto: "from-[#6b21a8] via-[#9333ea] to-[#db2777]",
};

const DIFFICULTY_MOTIF: Record<DifficultyId, typeof Trophy> = {
  esencial: Gem,
  intermedio: Zap,
  avanzado: Medal,
  experto: Trophy,
};

export { categoryTheme } from "@/lib/challenge-theme";
import { categoryTheme } from "@/lib/challenge-theme";
import { ProfilePeekCard } from "@/components/verbo/ProfilePeekCard";

function ChallengeSurface({
  difficulty,
  category,
  className = "",
  motifClassName = "",
  contentClassName = "",
  children,
}: {
  difficulty: DifficultyId;
  category?: string;
  className?: string;
  motifClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const Motif = DIFFICULTY_MOTIF[difficulty];
  const gradient = category ? categoryTheme(category).gradient : DIFFICULTY_GRADIENTS[difficulty];
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br ${gradient} text-white shadow-elevated ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -right-6 text-white/15 transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:rotate-6"
      >
        <Motif className={`verbo-float h-32 w-32 ${motifClassName}`} strokeWidth={1.25} />
      </span>
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tier tile — colored slab per difficulty, ghost numeral, hairline progress.   */
/* Purely presentational: same props, same handlers.                           */
/* -------------------------------------------------------------------------- */
const TIER_THEME: Record<DifficultyId, { surface: string; accent: string; shadow: string }> = {
  esencial: {
    surface: "linear-gradient(155deg, #17b8a0 0%, #0e9c8c 55%, #0b7f78 100%)",
    accent: "#c9fbef",
    shadow: "rgba(14,156,140,0.55)",
  },
  intermedio: {
    surface: "linear-gradient(155deg, #3fa9f5 0%, #1e86dd 55%, #1668b8 100%)",
    accent: "#d9edff",
    shadow: "rgba(30,134,221,0.55)",
  },
  avanzado: {
    surface: "linear-gradient(155deg, #f9a23a 0%, #ef7f22 55%, #d9631b 100%)",
    accent: "#ffe9cd",
    shadow: "rgba(239,127,34,0.55)",
  },
  experto: {
    surface: "linear-gradient(155deg, #f2698a 0%, #e04d78 55%, #bf3a68 100%)",
    accent: "#ffe0e8",
    shadow: "rgba(224,77,120,0.55)",
  },
};

/* -------------------------------------------------------------------------- */
/* Tier banner — light tinted material per difficulty (screen 2 header).       */
/* Alludes to the tier hue instead of flooding the surface with it.            */
/* Purely presentational.                                                      */
/* -------------------------------------------------------------------------- */
const TIER_BANNER: Record<
  DifficultyId,
  { base: string; bloom: string; rail: string; ink: string; eyebrow: string; ring: string; glow: string }
> = {
  esencial: {
    base: "linear-gradient(135deg, #f4fbf9 0%, #eaf7f3 48%, #ddf1ec 100%)",
    bloom: "radial-gradient(120% 140% at 88% -30%, rgba(23,184,160,0.28) 0%, rgba(23,184,160,0) 62%)",
    rail: "linear-gradient(180deg, #17b8a0 0%, #0b7f78 100%)",
    ink: "#0b3b39",
    eyebrow: "#0e8f83",
    ring: "rgba(14,156,140,0.16)",
    glow: "rgba(14,156,140,0.16)",
  },
  intermedio: {
    base: "linear-gradient(135deg, #f5faff 0%, #ecf4fd 48%, #dfecfa 100%)",
    bloom: "radial-gradient(120% 140% at 88% -30%, rgba(63,169,245,0.28) 0%, rgba(63,169,245,0) 62%)",
    rail: "linear-gradient(180deg, #3fa9f5 0%, #1668b8 100%)",
    ink: "#0d2f4d",
    eyebrow: "#1a72c4",
    ring: "rgba(30,134,221,0.16)",
    glow: "rgba(30,134,221,0.16)",
  },
  avanzado: {
    base: "linear-gradient(135deg, #fffaf2 0%, #fdf3e6 48%, #f9e8d4 100%)",
    bloom: "radial-gradient(120% 140% at 88% -30%, rgba(249,162,58,0.30) 0%, rgba(249,162,58,0) 62%)",
    rail: "linear-gradient(180deg, #f9a23a 0%, #d9631b 100%)",
    ink: "#4a2508",
    eyebrow: "#c46512",
    ring: "rgba(217,99,27,0.16)",
    glow: "rgba(239,127,34,0.18)",
  },
  experto: {
    base: "linear-gradient(135deg, #fff7f9 0%, #fdeef2 48%, #f9e2e9 100%)",
    bloom: "radial-gradient(120% 140% at 88% -30%, rgba(242,105,138,0.28) 0%, rgba(242,105,138,0) 62%)",
    rail: "linear-gradient(180deg, #f2698a 0%, #bf3a68 100%)",
    ink: "#4a1226",
    eyebrow: "#c33a63",
    ring: "rgba(191,58,104,0.16)",
    glow: "rgba(224,77,120,0.18)",
  },
};

function TierBanner({
  difficulty,
  label,
  count,
}: {
  difficulty: DifficultyId;
  label: string;
  count: number;
}) {
  const t = TIER_BANNER[difficulty];
  const Motif = DIFFICULTY_MOTIF[difficulty];
  return (
    <div
      className="verbo-stagger-in relative overflow-hidden rounded-[24px] px-6 py-5 sm:px-7 sm:py-6"
      style={{
        backgroundImage: t.base,
        border: `1px solid ${t.ring}`,
        boxShadow: `0 18px 40px -30px ${t.glow}, inset 0 1px 0 rgba(255,255,255,0.85)`,
      }}
    >
      {/* tier bloom — alludes to the difficulty hue without flooding the surface */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: t.bloom }} />
      {/* accent rail */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
        style={{ backgroundImage: t.rail }}
      />
      {/* ghost motif */}
      {Motif && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-4 top-1/2 hidden -translate-y-1/2 opacity-[0.10] sm:block"
          style={{ color: t.eyebrow }}
        >
          <Motif className="h-28 w-28" />
        </div>
      )}

      <div className="relative">
        <div className="flex items-center gap-2.5">
          <DifficultyDots difficulty={difficulty} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: t.eyebrow }}
          >
            {label}
          </span>
        </div>
        <h1
          className="mt-2 text-[26px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[30px]"
          style={{ color: t.ink }}
        >
          {label} Challenges
        </h1>
        <p className="mt-1.5 text-[13.5px]" style={{ color: `color-mix(in oklab, ${t.ink} 62%, transparent)` }}>
          {count} challenge{count === 1 ? "" : "s"} available for your product.
        </p>
      </div>
    </div>
  );
}

function TierTile({
  difficulty,
  index,
  label,
  count,
  target,
  disabled,
  onSelect,
}: {
  difficulty: DifficultyId;
  index: number;
  label: string;
  count: number;
  target: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  const theme = TIER_THEME[difficulty];
  const Motif = DIFFICULTY_MOTIF[difficulty];
  const pct = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      style={{
        ["--tier" as string]: theme.accent,
        ["--tier-shadow" as string]: theme.shadow,
        backgroundImage: theme.surface,
        boxShadow: `0 18px 40px -26px ${theme.shadow}`,
      }}
      className={`verbo-stagger-in group relative block h-full overflow-hidden rounded-[26px] border border-white/20 p-6 text-left text-white outline-none transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-[var(--tier)] focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        disabled
          ? "cursor-not-allowed opacity-45 saturate-0"
          : "hover:-translate-y-1 hover:border-white/45 hover:shadow-[0_28px_60px_-26px_var(--tier-shadow)] active:scale-[0.985] active:duration-100"
      }`}
    >
      {/* accent wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.85),transparent)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.45),transparent_70%)] opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-70"
      />
      {/* ghost numeral */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-5 right-4 text-[86px] font-bold leading-none tracking-[-0.06em] text-white/[0.13]"
      >
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/20 text-white transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-0.5">
            <Motif className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <DifficultyDots difficulty={difficulty} className="pt-3 opacity-80" />
        </div>

        <div className="mt-5 text-[20px] font-semibold leading-[1.1] tracking-[-0.03em] text-white drop-shadow-sm">{label}</div>
        <div className="mt-1 text-[12px] font-medium tracking-[0.01em] text-white/75">
          {count} of {target} challenges
        </div>

        <div className="mt-6 h-px w-full overflow-hidden rounded-full bg-white/25">
          <span
            className="block h-px rounded-full bg-white transition-[width] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">
            {disabled ? "Empty" : "Explore"}
          </span>
          <ChevronRight className="h-4 w-4 text-white/70 transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-1 group-hover:text-white" />
        </div>
      </div>
    </button>
  );
}



// Icon per challenge category. Categories are free text created by admins, so
// unknown names fall back to a generic tag icon.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  video: Video,
  "video + written": Clapperboard,
  audio: Headphones,
  listening: Ear,
  email: Mail,
  reading: BookOpen,
  written: PenLine,
  debate: MessagesSquare,
  roleplay: Users,
  pitch: Presentation,
  negotiation: Handshake,
  persuasion: Megaphone,
  networking: Share2,
  leadership: Crown,
  "business case": Briefcase,
};

export function categoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name.trim().toLowerCase()] ?? Tag;
}

function CategoryBadge({ name, className = "" }: { name: string; className?: string }) {
  if (!name) return <Pill tone="muted">No category</Pill>;
  const Icon = categoryIcon(name);
  const theme = categoryTheme(name);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold shadow-sm ${className}`}
      style={{ color: theme.solid }}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
      {name}
    </span>
  );
}

function ChallengeCard({
  challenge: c,
  locked,
  chosen,
  done,
  shared,
  onOpen,
  onShare,
}: {
  challenge: Challenge;
  locked: boolean;
  chosen: boolean;
  done: boolean;
  shared: boolean;
  onOpen: () => void;
  onShare: () => void;
}) {
  const theme = categoryTheme(c.category);
  const CatIcon = categoryIcon(c.category);
  return (
    <div
      className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:shadow-[0_22px_44px_-24px_rgba(15,23,42,0.35)] active:translate-y-0 active:scale-[0.99]"
      style={{ ["--cat" as string]: theme.solid }}
    >
      {/* Category signature: hairline on top + soft tint bleeding from it */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px]" style={{ background: theme.solid }} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-60 transition-opacity duration-300 group-hover:opacity-90"
        style={{ background: `linear-gradient(180deg, ${theme.solid}1a 0%, transparent 100%)` }}
      />

      <button
        type="button"
        onClick={onOpen}
        className="relative flex flex-1 flex-col gap-3 p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cat)] focus-visible:ring-offset-2"
      >
        {/* Eyebrow: category identity */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${theme.solid}1f`, color: theme.solid }}
          >
            <CatIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span
            className="truncate text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: theme.solid }}
          >
            {c.category || "Challenge"}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {locked && <PremiumBadge />}
            {done ? (
              <Pill tone="success"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Pill>
            ) : chosen ? (
              <Pill tone="muted">In progress</Pill>
            ) : null}
          </span>
        </div>

        {/* Primary: title */}
        <h3 className="line-clamp-2 text-[1.0625rem] font-bold leading-[1.2] tracking-[-0.02em] text-foreground sm:text-[1.125rem]">
          {c.title}
        </h3>

        {/* Secondary: description */}
        <p className="line-clamp-3 text-[13px] leading-[1.55] text-muted-foreground">
          {c.description || "Tap to see the details."}
        </p>

        {/* Footer: skills + affordance */}
        <div className="mt-auto flex min-w-0 items-end justify-between gap-3 border-t border-border/60 pt-3">
          <div className="flex min-w-0 flex-wrap gap-1">
            {(c.skill_tags ?? []).map((s) => <SkillChip key={s} label={s} />)}
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5"
            style={{ color: theme.solid }}
          >
            See details <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>

      {done && (
        <button
          type="button"
          onClick={onShare}
          className="relative inline-flex items-center gap-1.5 border-t border-border/60 px-5 py-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <Share2 className="h-3 w-3" />
          {shared ? "Edit shared result" : "Share result"}
        </button>
      )}
    </div>
  );

}





function SkillChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges catalog — declarative rules stored in badges-store.ts                */
/* -------------------------------------------------------------------------- */
import {
  type BadgeDef,
  type BadgeContext,
  loadBadges,
  subscribeBadges,
  isBadgeEarned,
  BADGE_METRIC_META,
} from "@/lib/badges-store";
import {
  loadEquippedChallengeBadgeIds,
  setEquippedChallengeBadgeIds,
  subscribeEquippedChallengeBadges,
  EQUIPPED_MAX as EQUIPPED_CHALLENGE_MAX,
} from "@/lib/equipped-challenge-badges-store";



/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */
function Page() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>(loadChallenges);
  const [flashList, setFlashList] = useState<FlashChallenge[]>(loadFlashChallenges);
  const [flashConfig, setFlashConfig] = useState(loadFlashConfig);
  const [tick, setTick] = useState(0); // re-render on student profile mutations
  const [difficulty, setDifficulty] = useState<DifficultyId | null>(null);
  const [category, setCategory] = useState<string | "all">("all");
  const [open, setOpen] = useState<Challenge | null>(null);
  const [submitFor, setSubmitFor] = useState<{
    id: string;
    title: string;
    format: ChallengeSubmissionFormat;
    accent: string;
    icon: LucideIcon;
    mode: "submit" | "resubmit";
  } | null>(null);
  const [mystery, setMystery] = useState<{ opening: boolean; reveal: FlashChallenge | null; blocked: boolean }>({ opening: false, reveal: null, blocked: false });
  const [lightning, setLightning] = useState<LightningState>(loadLightning);
  const [lightningOpen, setLightningOpen] = useState<FlashChallenge | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [seasons, setSeasons] = useState<FlashSeason[]>(loadSeasons);
  const [lightningTheme, setLightningTheme] = useState(loadLightningTheme);
  const [seasonState, setSeasonState] = useState<
    { season: FlashSeason; opening: boolean; reveal: FlashChallenge | null; blocked: boolean } | null
  >(null);

  useEffect(() => {
    hydrateTeachers();
    setChallenges(loadChallenges());
    setFlashList(loadFlashChallenges());
    setFlashConfig(loadFlashConfig());
    setLightning(loadLightning());
    setSeasons(loadSeasons());
    const un1 = subscribeChallenges(() => setChallenges(loadChallenges()));
    const un2 = subscribeStudents(() => setTick((t) => t + 1));
    const un3 = subscribeFlashChallenges(() => setFlashList(loadFlashChallenges()));
    const un4 = subscribeFlashConfig(() => setFlashConfig(loadFlashConfig()));
    const un5 = subscribeLightning(() => setLightning(loadLightning()));
    const un6 = subscribeSeasons(() => setSeasons(loadSeasons()));
    setLightningTheme(loadLightningTheme());
    const un7 = subscribeLightningTheme(() => setLightningTheme(loadLightningTheme()));
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => { un1(); un2(); un3(); un4(); un5(); un6(); un7(); clearInterval(timer); };
  }, []);



  // Preload Google Fonts for active seasons so their skin renders.
  useEffect(() => {
    seasons.filter((s) => s.active).forEach((s) => ensureGoogleFont(fontFamilyFor(s)));
  }, [seasons]);

  if (!user) return null;
  const student = USERS.find((u) => u.id === user.id) ?? user;
  const productId = (student.product ?? "go") as ChallengeProductId;
  const gradient = PRODUCT_GRADIENTS[productId] ?? PRODUCT_GRADIENTS.enterprise;
  const hasPremiumAccess = PREMIUM_ACCESS.includes(student.access_plan ?? "");

  // VIP has no dedicated Challenges catalog of its own — it reads the union
  // of every content-bearing product (same engine, same content an Elite
  // student already sees), instead of an always-empty exact-match filter.
  const productChallenges = useMemo(
    () => challenges.filter((c) => challengeProductsFor(productId).includes(c.product)),
    [challenges, productId],
  );

  const countByDifficulty = (d: DifficultyId) =>
    productChallenges.filter((c) => c.difficulty === d).length;

  /** Opens the mandatory submission form for any challenge flavour. */
  const openSubmit = (
    c: { id: string; title: string; category?: string },
    format: ChallengeSubmissionFormat,
    mode: "submit" | "resubmit",
    theme?: { accent: string; icon: LucideIcon },
  ) =>
    setSubmitFor({
      id: c.id,
      title: c.title,
      format,
      mode,
      accent: theme?.accent ?? categoryTheme(c.category ?? "").solid,
      icon: theme?.icon ?? categoryIcon(c.category ?? ""),
    });



  /* ---------------- Screen 2: challenge list ---------------- */
  if (difficulty) {
    const list = challengesForAccount(challenges, productId, difficulty);
    const availableCategories = Array.from(
      new Set(list.map((c) => c.category).filter((c): c is string => !!c)),
    );
    const filtered = category === "all" ? list : list.filter((c) => c.category === category);

    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <GhostButton onClick={() => { setDifficulty(null); setCategory("all"); }}>
            <ArrowLeft className="h-3.5 w-3.5" /> All difficulties
          </GhostButton>
          <TierBanner
            difficulty={difficulty}
            label={DIFFICULTY_META[difficulty].label}
            count={list.length}
          />

        </div>

        {availableCategories.length > 0 && (
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
            <button
              onClick={() => setCategory("all")}
              className={`inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                category === "all"
                  ? "border-transparent bg-foreground text-background shadow-[0_6px_16px_-8px_rgba(15,23,42,0.6)]"
                  : "border-border/70 bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground"
              }`}
            >
              All
            </button>
            {availableCategories.map((cat) => {
              const CatIcon = categoryIcon(cat);
              const t = categoryTheme(cat);
              const active = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className="inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold tracking-[-0.01em] transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
                  style={{
                    borderColor: active ? t.solid : `${t.solid}33`,
                    backgroundColor: active ? t.solid : `${t.solid}0f`,
                    color: active ? "#fff" : t.solid,
                    boxShadow: active ? `0 8px 18px -10px ${t.solid}` : undefined,
                  }}
                >
                  <CatIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  {cat}
                </button>
              );
            })}


          </div>
        )}

        {filtered.length === 0 ? (
          <Card>
            <div className="py-10 text-center text-sm text-muted-foreground">
              No challenges yet in this difficulty.
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => {
              const locked = !!c.premium && !hasPremiumAccess;
              const chosen = hasChosenChallenge(student.id, c.id);
              const done = hasCompletedChallenge(student.id, c.id);
              const shared = !!getSharedResult(student.id, c.id);
              return (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  locked={locked}
                  chosen={chosen}
                  done={done}
                  shared={shared}
                  onOpen={() => setOpen(c)}
                  onShare={() => setOpen(c)}
                />
              );

            })}
          </div>
        )}

        {open && (
          <ChallengeDetail
            challenge={open}
            onClose={() => setOpen(null)}
            hasPremiumAccess={hasPremiumAccess}
            chosen={hasChosenChallenge(student.id, open.id)}
            completed={hasCompletedChallenge(student.id, open.id)}
            cooldownRemaining={completeCooldownRemaining(student.id)}
            onChoose={() => { chooseChallenge(student.id, open.id); }}
            submission={getSubmission(student.id, open.id)}
            onSubmit={() => openSubmit(open, "normal", "submit")}
            onResubmit={() => openSubmit(open, "normal", "resubmit")}
          />
        )}

        {submitFor && (
          <SubmitChallengeModal
            title={submitFor.title}
            accent={submitFor.accent}
            icon={submitFor.icon}
            mode={submitFor.mode}
            onClose={() => setSubmitFor(null)}
            onSubmit={(link, note) => {
              const ok = submitFor.mode === "resubmit"
                ? resubmitChallenge(student.id, submitFor.id, link, note)
                : submitChallenge(student.id, submitFor.id, submitFor.format, link, note);
              if (ok) { setSubmitFor(null); setOpen(null); setTick((t) => t + 1); }
            }}
          />
        )}
      </div>
    );
  }

  /* ---------------- Screen 1: difficulty picker + badges ---------------- */
  return (
    <div className="space-y-8">
      <ChallengesHero
        gradient={gradient}
        currentStreak={student.current_streak ?? 0}
        longestStreak={student.longest_streak ?? 0}
        completed={totalCompletedChallenges(student)}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PlayerProfileCard student={student} />
        <LeaderboardSection currentUserId={student.id} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {DIFFICULTY_ORDER.map((d, i) => {
          const count = countByDifficulty(d);
          const target = CHALLENGES_PER_DIFFICULTY[d];
          const empty = count === 0;
          return (
            <TierTile
              key={d}
              difficulty={d}
              index={i}
              label={DIFFICULTY_META[d].label}
              count={count}
              target={target}
              disabled={empty}
              onSelect={() => { setDifficulty(d); setCategory("all"); }}
            />
          );
        })}
      </div>


      {/* ---------------- Verbo Flash family: Seasons + Lightning + Mystery Box ---------------- */}
      {(["enterprise", "go", "international"] as const).includes(productId as FlashProductId) && (() => {
        const flashProduct = productId as FlashProductId;
        const pool = flashChallengesFor(flashList, "mystery_box", flashProduct);
        const available = pool.length > 0;
        const activeSeasons = seasons.filter((s) => s.active);

        const openSeasonChallenge = (season: FlashSeason, challenge: FlashChallenge) => {
          setSeasonState({ season, opening: false, reveal: challenge, blocked: false });
        };


        const openMystery = () => {
          if (pool.length === 0) return;
          const pendingId = activeMysteryBoxPick(student.id);
          if (pendingId) {
            const pending = pool.find((c) => c.id === pendingId) ?? flashList.find((c) => c.id === pendingId);
            if (pending) {
              setMystery({ opening: false, reveal: pending, blocked: false });
              return;
            }
          }
          if (!openMysteryBox(student.id)) {
            setMystery({ opening: false, reveal: null, blocked: true });
            return;
          }
          setMystery({ opening: true, reveal: null, blocked: false });
          setTimeout(() => {
            const pick = pool[Math.floor(Math.random() * pool.length)];
            setMysteryBoxPick(student.id, pick.id);
            setMystery({ opening: false, reveal: pick, blocked: false });
          }, 900);
        };

        const lightningVisible = isLightningVisibleForStudents(lightning) && lightning.product === productId;
        const lightningChallenge = lightningVisible
          ? flashList.find((c) => c.id === lightning.challenge_id)
          : undefined;

        return (
          <div className="flex flex-col gap-4">
            <style>{`
              @keyframes verbo-box-wiggle {
                0%, 92%, 100% { transform: rotate(0deg); }
                94% { transform: rotate(-6deg); }
                96% { transform: rotate(6deg); }
                98% { transform: rotate(-3deg); }
              }
              @keyframes verbo-lightning-glow {
                0%, 100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.55), 0 0 30px 4px rgba(14, 165, 233, 0.35); }
                50% { box-shadow: 0 0 0 6px rgba(250, 204, 21, 0.0), 0 0 40px 10px rgba(14, 165, 233, 0.6); }
              }
              @keyframes verbo-lightning-urgent {
                0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.65), 0 0 30px 4px rgba(239, 68, 68, 0.5); }
                50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.0), 0 0 40px 12px rgba(239, 68, 68, 0.8); }
              }
              @media (prefers-reduced-motion: reduce) {
                .verbo-box-wiggle, .verbo-lightning-live { animation: none !important; }
              }
            `}</style>

            {activeSeasons.map((s) => (
              <SeasonFlashBanner
                key={s.id}
                season={s}
                challenges={seasonChallengesFor(flashList, s.id, flashProduct)}
                onOpenChallenge={(c) => openSeasonChallenge(s, c)}
                earned={(student.season_completions?.[s.id] ?? 0) >= 1}
              />
            ))}


            {lightningChallenge && (() => {
              const remaining = lightning.expires_at ? +new Date(lightning.expires_at) - nowTick : 0;
              const isLive = lightning.status === "live" && remaining > 0;
              const accepted = lightning.accepted_student_ids.includes(student.id);
              const completed = hasCompletedChallenge(student.id, lightningChallenge.id);
              const acceptedCount = lightning.accepted_student_ids.length;
              const urgent = isLive && remaining > 0 && remaining < 60 * 60 * 1000;
              const ch = lightningChallenge;

              const lightGradient = lightningTheme.accent_color
                ? seasonGradientCss(lightningTheme)
                : "linear-gradient(135deg, #1e3a8a, #0284c7, #facc15)";

              if (!isLive) {
                return (
                  <CompactFlashBanner
                    gradientCss={lightGradient}
                    themeImageUrl={lightningTheme.theme_image_url}
                    watermarkImageUrl={lightningTheme.watermark_image_url}
                    
                    eyebrow={completed ? "⚡ Completed" : "⚡ Expired — you missed this one"}
                    title={ch.title || "Lightning Challenge"}
                    status={completed ? "You completed this Lightning." : "This Lightning has passed. The next one could strike anytime — stay ready."}
                    icon={<Zap className="h-10 w-10 text-white/80 drop-shadow-lg sm:h-12 sm:w-12" strokeWidth={1.4} />}
                    available={false}
                    actionLabel="Lightning Challenge"
                  />
                );
              }

              return (
                <CompactFlashBanner
                  gradientCss={lightGradient}
                  themeImageUrl={lightningTheme.theme_image_url}
                  watermarkImageUrl={lightningTheme.watermark_image_url}
                  eyebrow="🔥 Live now"
                  title={ch.title || "Lightning Challenge"}
                  status={`${formatHMS(remaining)} left · ⚡ ${acceptedCount} student${acceptedCount === 1 ? "" : "s"} accepted this`}
                  icon={<Zap className="h-10 w-10 text-yellow-300 drop-shadow-lg sm:h-12 sm:w-12" strokeWidth={1.4} />}
                  available
                  actionLabel="Accept the Lightning Challenge"
                  actionClassName="verbo-lightning-live"
                  actionStyle={{ animation: urgent ? "verbo-lightning-urgent 0.9s ease-in-out infinite" : "verbo-lightning-glow 1.8s ease-in-out infinite" }}
                  cta={
                    completed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-[#0f172a]">
                        {accepted ? "Continue the challenge →" : "Accept the Challenge ⚡"}
                      </span>
                    )
                  }
                  onAction={() => {
                    if (isLive && !accepted) acceptLightning(student.id);
                    setLightningOpen(ch);
                  }}
                />
              );
            })()}

            <CompactFlashBanner
              gradientCss={
                flashConfig.accent_color
                  ? seasonGradientCss(flashConfig)
                  : "linear-gradient(135deg, #4a044e 0%, #7e22ce 55%, #f59e0b 100%)"
              }
              themeImageUrl={flashConfig.theme_image_url}
              watermarkImageUrl={flashConfig.watermark_image_url}
              eyebrow="Verbo Flash · Mystery Box"
              title="Mystery Box"
              status={available ? "Tap to open" : "Coming soon"}
              available={available}
              actionLabel="Open Mystery Box"
              icon={
                flashConfig.box_art_url ? (
                  <img src={flashConfig.box_art_url} alt="Mystery Box" className="h-full w-full object-contain drop-shadow-lg" />
                ) : (
                  <Gift className="h-10 w-10 text-white drop-shadow-lg sm:h-12 sm:w-12" strokeWidth={1.4} />
                )
              }
              onAction={available ? openMystery : undefined}
            />
          </div>
        );
      })()}








      {lightningOpen && (
        <LightningRevealModal
          challenge={lightningOpen}
          lightningTheme={lightningTheme}
          expiresAt={lightning.expires_at}
          nowTick={nowTick}
          isLive={lightning.status === "live"}
          acceptedCount={lightning.accepted_student_ids.length}
          hasPremiumAccess={hasPremiumAccess}
          completed={hasCompletedChallenge(student.id, lightningOpen.id)}
          submission={getSubmission(student.id, lightningOpen.id)}
          onSubmit={() => openSubmit(lightningOpen, "lightning", "submit", { accent: lightningTheme.accent_color || "#0284c7", icon: Zap })}
          onResubmit={() => openSubmit(lightningOpen, "lightning", "resubmit", { accent: lightningTheme.accent_color || "#0284c7", icon: Zap })}
          onClose={() => setLightningOpen(null)}
        />
      )}


      {mystery.blocked && (
        <MysteryCooldownModal onClose={() => setMystery({ opening: false, reveal: null, blocked: false })} />
      )}
      {(mystery.opening || mystery.reveal) && (
        <MysteryRevealModal
          opening={mystery.opening}
          flashConfig={flashConfig}
          challenge={mystery.reveal}
          hasPremiumAccess={hasPremiumAccess}
          chosen={mystery.reveal ? hasChosenChallenge(student.id, mystery.reveal.id) : false}
          completed={mystery.reveal ? hasCompletedChallenge(student.id, mystery.reveal.id) : false}
          cooldownRemaining={completeCooldownRemaining(student.id)}
          onChoose={() => { if (mystery.reveal) chooseChallenge(student.id, mystery.reveal.id); }}
          submission={mystery.reveal ? getSubmission(student.id, mystery.reveal.id) : null}
          onSubmit={() => { if (mystery.reveal) openSubmit(mystery.reveal, "mystery_box", "submit", { accent: flashConfig.accent_color || "#7e22ce", icon: Gift }); }}
          onResubmit={() => { if (mystery.reveal) openSubmit(mystery.reveal, "mystery_box", "resubmit", { accent: flashConfig.accent_color || "#7e22ce", icon: Gift }); }}
          onClose={() => setMystery({ opening: false, reveal: null, blocked: false })}
        />
      )}

      {seasonState?.blocked && (
        <SeasonCooldownModal
          season={seasonState.season}
          onClose={() => setSeasonState(null)}
        />
      )}
      {seasonState && (seasonState.opening || seasonState.reveal) && (
        <SeasonRevealModal
          season={seasonState.season}
          opening={seasonState.opening}
          challenge={seasonState.reveal}
          hasPremiumAccess={hasPremiumAccess}
          chosen={seasonState.reveal ? hasChosenChallenge(student.id, seasonState.reveal.id) : false}
          completed={seasonState.reveal ? hasCompletedChallenge(student.id, seasonState.reveal.id) : false}
          onChoose={() => { if (seasonState.reveal) chooseChallenge(student.id, seasonState.reveal.id); }}
          submission={seasonState.reveal ? getSubmission(student.id, seasonState.reveal.id) : null}
          onSubmit={() => { if (seasonState.reveal) openSubmit(seasonState.reveal, "season", "submit", { accent: seasonState.season.accent_color || "#7e22ce", icon: Sparkles }); }}
          onResubmit={() => { if (seasonState.reveal) openSubmit(seasonState.reveal, "season", "resubmit", { accent: seasonState.season.accent_color || "#7e22ce", icon: Sparkles }); }}
          onClose={() => setSeasonState(null)}
        />
      )}


      {submitFor && (
        <SubmitChallengeModal
          title={submitFor.title}
          accent={submitFor.accent}
          icon={submitFor.icon}
          mode={submitFor.mode}
          onClose={() => setSubmitFor(null)}
          onSubmit={(link, note) => {
            const ok = submitFor.mode === "resubmit"
              ? resubmitChallenge(student.id, submitFor.id, link, note)
              : submitChallenge(student.id, submitFor.id, submitFor.format, link, note);
            if (ok) {
              setSubmitFor(null);
              setLightningOpen(null);
              setMystery({ opening: false, reveal: null, blocked: false });
              setSeasonState(null);
              setTick((t) => t + 1);
            }
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Verbo Flash — Mystery Box card + reveal modal                              */
/* -------------------------------------------------------------------------- */
/** Full-width Verbo Flash banner — shared shell for Season, Lightning and
 *  Mystery Box. The whole banner uses ONE background; the left zone holds the
 *  art/icon (wiggling) and the right zone the copy + CTA. */
/** Season banner — full-bleed theme image fading into the season gradient,
 *  hero title + watermark, and up to 5 circular challenge pickers. */
function SeasonFlashBanner({
  season,
  challenges,
  onOpenChallenge,
  earned,
}: {
  season: FlashSeason;
  challenges: FlashChallenge[];
  onOpenChallenge: (challenge: FlashChallenge) => void;
  earned: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const available = challenges.length > 0;
  const font = `"${fontFamilyFor(season)}", system-ui, sans-serif`;
  const visible = challenges.length > 5 ? challenges.slice(0, 4) : challenges.slice(0, 5);
  const rest = challenges.length > 5 ? challenges.slice(4) : [];

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const refreshLabel = useMemo(() => {
    const d = new Date(now);
    const day = d.getDay();
    const endOfWeek = new Date(d);
    endOfWeek.setDate(d.getDate() + (7 - day));
    endOfWeek.setHours(23, 59, 59, 999);
    const diffMs = Math.max(0, endOfWeek.getTime() - now);
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, [now]);

  return (
    <div
      className={`relative flex items-center w-full min-h-[210px] overflow-hidden rounded-3xl border border-white/15 shadow-elevated sm:min-h-[260px] ${
        available ? "verbo-season-pulse" : "opacity-60 saturate-50"
      }`}
      style={{
        background: seasonGradientCss(season),
        ...(available ? { animation: "verbo-season-pulse 2.6s ease-in-out infinite" } : null),
      }}
    >
      <style>{`
        @keyframes verbo-season-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.25); }
          50% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
        }
        @keyframes verbo-season-glow {
          0%, 100% { box-shadow: 0 0 0px 0px rgba(255,255,255,0), 0 4px 10px rgba(0,0,0,0.25); }
          50% { box-shadow: 0 0 16px 4px rgba(255,255,255,0.55), 0 4px 10px rgba(0,0,0,0.25); }
        }
        @keyframes verbo-badge-locked-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.18); }
          50% { box-shadow: 0 0 0 6px rgba(255,255,255,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .verbo-season-pulse, .verbo-season-glow, .verbo-badge-locked-pulse { animation: none !important; }
        }
      `}</style>

      {season.theme_image_url && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-left bg-no-repeat"
          style={{
            backgroundImage: `url(${season.theme_image_url})`,
            WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 58%)",
            maskImage: "linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 58%)",
          }}
        />
      )}

      {season.watermark_image_url ? (
        <img
          aria-hidden
          src={season.watermark_image_url}
          alt=""
          className="pointer-events-none absolute right-6 top-1/2 h-[130%] max-h-none -translate-y-1/2 select-none object-contain opacity-10"
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[40%] flex select-none items-center overflow-hidden whitespace-nowrap text-[110px] font-black leading-none tracking-tight text-white/10 sm:text-[150px]"
          style={{ fontFamily: font }}
        >
          {season.display_name}
        </span>
      )}

      {available && (
        <>
          <span className="pointer-events-none absolute left-5 top-5 z-10 inline-flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur">
            <Tag className="h-3 w-3" /> Limited Time
          </span>
          <span className="pointer-events-none absolute right-5 top-5 z-10 inline-flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur">
            Refreshes in {refreshLabel}
          </span>
        </>
      )}

      <div className="relative flex w-full flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-10 sm:pl-[18%]">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          {available && (
            <div className="flex shrink-0 flex-col items-center gap-1.5 text-center">
              <div
                className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 backdrop-blur transition-transform duration-200 sm:h-20 sm:w-20 ${
                  earned
                    ? "border-white/80 bg-white/25"
                    : "verbo-badge-locked-pulse border-dashed border-white/50 bg-white/10"
                }`}
                style={!earned ? { animation: "verbo-badge-locked-pulse 2.2s ease-in-out infinite" } : undefined}
              >
                <Medal className={`h-8 w-8 sm:h-9 sm:w-9 ${earned ? "text-white" : "text-white/70"}`} strokeWidth={1.6} />
                {!earned && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-[1px]">
                    <Lock className="h-5 w-5 text-white sm:h-6 sm:w-6" strokeWidth={2} />
                  </span>
                )}
              </div>
              <div className="max-w-[130px] text-[11px] font-semibold leading-tight text-white/90">
                {season.badge_name}
              </div>
              <div className="max-w-[130px] text-[10px] leading-tight text-white/65">
                Complete all challenges to unlock this badge
              </div>
            </div>
          )}

          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
              Verbo Flash · Season
            </div>
            <div
              className="mt-2 truncate text-5xl font-black tracking-tight text-white drop-shadow-md sm:text-7xl"
              style={{ fontFamily: font }}
            >
              {season.display_name}
            </div>
            <div className="mt-2 text-xs text-white/85">
              {available ? "Complete the challenges to unlock an exclusive badge" : "Coming soon"}
            </div>
          </div>
        </div>

        {available && (
          <div className="flex shrink-0 items-center justify-end gap-3">
            {visible.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenChallenge(c)}
                title={c.title}
                style={{ animation: "verbo-season-glow 2.2s ease-in-out infinite" }}
                className="verbo-season-glow flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white/50 bg-white/15 shadow-lg backdrop-blur transition-transform duration-200 hover:-translate-y-1 hover:border-white sm:h-16 sm:w-16"
              >
                {c.icon_image_url ? (
                  <img src={c.icon_image_url} alt={c.title} className="h-full w-full object-cover" />
                ) : (
                  <Sparkles className="h-7 w-7 text-white" strokeWidth={1.6} />
                )}
              </button>
            ))}
            {rest.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  style={{ animation: "verbo-season-glow 2.2s ease-in-out infinite" }}
                  className="verbo-season-glow flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/50 bg-white/20 text-sm font-bold text-white shadow-lg backdrop-blur transition-transform duration-200 hover:-translate-y-1 hover:border-white sm:h-16 sm:w-16"
                >
                  +{rest.length}
                </button>
                {moreOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-elevated">
                    {rest.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          onOpenChallenge(c);
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                          {c.icon_image_url ? (
                            <img src={c.icon_image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Sparkles className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="truncate">{c.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact Verbo Flash banner — same visual language as SeasonFlashBanner
 *  (theme image with lateral fade, watermark, editable gradient, pulse) at
 *  half the height, with a single square action button as the only click
 *  target. Used by Mystery Box and Lightning. */
function CompactFlashBanner({
  themeImageUrl,
  watermarkImageUrl,
  gradientCss,
  className,
  style,
  eyebrow,
  title,
  status,
  icon,
  available,
  onAction,
  actionLabel,
  actionClassName,
  actionStyle,
  cta,
}: {
  themeImageUrl?: string;
  watermarkImageUrl?: string;
  gradientCss: string;
  className?: string;
  style?: React.CSSProperties;
  eyebrow: string;
  title: string;
  status: string;
  icon: React.ReactNode;
  available: boolean;
  onAction?: () => void;
  actionLabel: string;
  actionClassName?: string;
  actionStyle?: React.CSSProperties;
  cta?: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex items-center w-full min-h-[105px] overflow-hidden rounded-3xl border border-white/15 shadow-elevated sm:min-h-[130px] ${
        available ? "verbo-season-pulse" : "opacity-60 saturate-50"
      } ${className ?? ""}`}
      style={{
        background: gradientCss,
        ...(available ? { animation: "verbo-season-pulse 2.6s ease-in-out infinite" } : null),
        ...style,
      }}
    >
      <style>{`
        @keyframes verbo-season-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.25); }
          50% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
        }
        @keyframes verbo-season-glow {
          0%, 100% { box-shadow: 0 0 0px 0px rgba(255,255,255,0), 0 4px 10px rgba(0,0,0,0.25); }
          50% { box-shadow: 0 0 16px 4px rgba(255,255,255,0.55), 0 4px 10px rgba(0,0,0,0.25); }
        }
        @media (prefers-reduced-motion: reduce) {
          .verbo-season-pulse, .verbo-season-glow { animation: none !important; }
        }
      `}</style>

      {themeImageUrl && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-left bg-no-repeat"
          style={{
            backgroundImage: `url(${themeImageUrl})`,
            WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 58%)",
            maskImage: "linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 58%)",
          }}
        />
      )}

      {watermarkImageUrl ? (
        <img
          aria-hidden
          src={watermarkImageUrl}
          alt=""
          className="pointer-events-none absolute right-6 top-1/2 h-[130%] max-h-none -translate-y-1/2 select-none object-contain opacity-10"
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[40%] flex select-none items-center overflow-hidden whitespace-nowrap text-[110px] font-black leading-none tracking-tight text-white/10 sm:text-[150px]"
        >
          {title}
        </span>
      )}

      <div className="relative flex w-full flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
            {eyebrow}
          </div>
          <div className="mt-2 truncate text-5xl font-black tracking-tight text-white drop-shadow-md sm:text-7xl">
            {title}
          </div>
          <div className="mt-2 text-xs text-white/85">{status}</div>
          {cta && <div className="mt-2">{cta}</div>}
        </div>

        <div className="flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={onAction}
            disabled={!onAction}
            aria-label={actionLabel}
            title={actionLabel}
            style={{ animation: "verbo-season-glow 2.2s ease-in-out infinite", ...actionStyle }}
            className={`verbo-season-glow flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/50 bg-white/15 shadow-lg backdrop-blur transition-transform duration-200 hover:-translate-y-1 hover:border-white disabled:cursor-not-allowed sm:h-20 sm:w-20 ${actionClassName ?? ""}`}
          >
            {icon}
          </button>
        </div>
      </div>
    </div>
  );
}

function VerboFlashBanner({

  icon,
  eyebrow,
  title,
  titleStyle,
  status,
  cta,
  background,
  disabled,
  onClick,
  className,
  style,
}: {
  icon?: React.ReactNode;
  eyebrow: string;
  title: string;
  titleStyle?: React.CSSProperties;
  status: string;
  cta?: React.ReactNode;
  background: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const shell = `group relative w-full overflow-hidden rounded-3xl border border-white/15 text-left shadow-elevated transition-transform duration-300 ease-out ${
    disabled ? "cursor-not-allowed opacity-60 saturate-50" : onClick ? "hover:-translate-y-1.5" : ""
  } ${className ?? ""}`;

  const inner = (
    <div className="flex flex-col sm:flex-row sm:items-center">
      <div className="flex items-center justify-center px-6 pt-6 sm:w-1/4 sm:shrink-0 sm:py-8">
        <div
          className="verbo-box-wiggle flex h-20 w-20 items-center justify-center sm:h-28 sm:w-28"
          style={{ animation: "verbo-box-wiggle 3.4s ease-in-out infinite", transformOrigin: "50% 90%" }}
        >
          {icon}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-8 sm:pl-0">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">{eyebrow}</div>
          <div className="mt-1 truncate text-xl font-semibold tracking-tight text-white drop-shadow-sm" style={titleStyle}>
            {title}
          </div>
          <div className="mt-1 text-xs text-white/85">{status}</div>
        </div>
        {cta && <div className="flex w-full justify-center sm:w-auto sm:shrink-0 sm:justify-end">{cta}</div>}
      </div>
    </div>
  );

  if (!onClick) {
    return <div className={shell} style={{ background, ...style }}>{inner}</div>;
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={shell} style={{ background, ...style }}>
      {inner}
    </button>
  );
}

/* ---- Shared reveal-modal header keyframes (same language as ChallengeDetail) ---- */
const VC_HEADER_KEYFRAMES = `
  @keyframes vc-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes vc-blob { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
  @keyframes vc-logo { from { opacity: 0; transform: scale(0.7) rotate(-15deg); } to { opacity: 1; transform: scale(1) rotate(0deg); } }
  .vc-rise { opacity: 0; animation: vc-rise 0.55s cubic-bezier(0.16,1,0.3,1) forwards; }
  .vc-blob { opacity: 0; animation: vc-blob 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
  .vc-logo { opacity: 0; animation: vc-logo 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
  @media (prefers-reduced-motion: reduce) {
    .vc-rise, .vc-blob, .vc-logo { animation: none !important; opacity: 1 !important; transform: none !important; }
  }
`;



/** "How to submit" block — only rendered when the admin filled in instructions. */
function SubmissionInstructions({ text, delay, accent }: { text?: string; delay?: string; accent?: string }) {
  if (!text || !text.trim()) return null;
  const tone = accent || "hsl(var(--primary))";
  return (
    <div
      className="vc-rise relative mt-5 overflow-hidden rounded-2xl border border-border/70 bg-secondary/35 p-5 pl-6"
      style={delay ? { animationDelay: delay } : undefined}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: tone }} />
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}
        >
          <Upload className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          How to submit
        </span>
      </div>
      <p className="mt-3 text-[16px] font-medium leading-[1.6] tracking-[-0.01em] text-foreground">{text}</p>
    </div>
  );
}


/** Shared footer for the 4 challenge-info modals. Renders the review state of
 *  the student's submission (pending / sent back / rejected) and falls back to
 *  `children` (the modal's own Let's do it! / Submit / Completed action) when
 *  there is no submission or it was already approved. */
function ChallengeModalFooter({
  submission,
  accent,
  onClose,
  onResubmit,
  delay,
  children,
}: {
  submission: ChallengeSubmission | null;
  accent: string;
  onClose: () => void;
  onResubmit: () => void;
  delay?: string;
  children?: ReactNode;
}) {
  const status = submission?.status;
  const feedback = submission?.teacher_feedback?.trim();
  const showFeedback = (status === "needs_resubmission" || status === "rejected") && !!feedback;

  return (
    <div
      className="vc-rise border-t border-border bg-secondary/30 p-4"
      style={delay ? { animationDelay: delay } : undefined}
    >
      {showFeedback && (
        <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          <div className="font-semibold">
            {status === "needs_resubmission"
              ? "Your teacher asked you to try again:"
              : "Your teacher's feedback:"}
          </div>
          <p className="mt-1 leading-relaxed">{feedback}</p>
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <GhostButton onClick={onClose}>Close</GhostButton>
        {status === "pending_review" ? (
          <Pill tone="muted">⏳ Pending review</Pill>
        ) : status === "needs_resubmission" ? (
          <PrimaryButton
            onClick={onResubmit}
            style={{ backgroundColor: accent, color: "#fff", boxShadow: `0 8px 20px -6px ${accent}` }}
          >
            <Upload className="h-3.5 w-3.5" /> Resubmit
          </PrimaryButton>
        ) : status === "rejected" ? (
          <Pill tone="muted">Not approved</Pill>
        ) : (
          children
        )}
      </div>
    </div>
  );
}



function MysteryCooldownModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card p-6 text-center shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4a044e] to-[#7e22ce] text-white">
          <Gift className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">{MYSTERY_COOLDOWN_MSG}</p>
        <div className="mt-4 flex justify-center">
          <GhostButton onClick={onClose}>Got it</GhostButton>
        </div>
      </div>
    </div>
  );
}

function MysteryRevealModal({
  opening,
  challenge,
  flashConfig,
  hasPremiumAccess,
  chosen,
  completed,
  cooldownRemaining,
  onChoose,
  onSubmit,
  onResubmit,
  submission,
  onClose,
}: {
  opening: boolean;
  challenge: FlashChallenge | null;
  flashConfig: FlashConfig;
  hasPremiumAccess: boolean;
  chosen: boolean;
  completed: boolean;
  cooldownRemaining: number | null;
  onChoose: () => void;
  onSubmit: () => void;
  onResubmit: () => void;
  submission: ChallengeSubmission | null;
  onClose: () => void;
}) {
  const locked = !!challenge?.premium && !hasPremiumAccess;
  const { user } = useAuth();
  const [issueOpen, setIssueOpen] = useState(false);
  const onCooldown = !completed && chosen && cooldownRemaining !== null;
  const accent = flashConfig.accent_color || "#7e22ce";
  const headerBg = flashConfig.theme_image_url
    ? `center / cover no-repeat url(${flashConfig.theme_image_url}), ${seasonGradientCss(flashConfig)}`
    : seasonGradientCss(flashConfig);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      {challenge && !opening && <Confetti />}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <style>{`
          @keyframes verbo-box-shake {
            0%, 100% { transform: translateX(0) rotate(0); }
            20% { transform: translateX(-6px) rotate(-8deg); }
            40% { transform: translateX(6px) rotate(8deg); }
            60% { transform: translateX(-4px) rotate(-6deg); }
            80% { transform: translateX(4px) rotate(6deg); }
          }
          @media (prefers-reduced-motion: reduce) { .verbo-box-shake { animation: none !important; } }
          ${VC_HEADER_KEYFRAMES}
        `}</style>
        <div className="relative overflow-hidden px-5 pb-4 pt-3.5 text-white" style={{ background: headerBg }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 70%)" }}
          />
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-1 z-0 select-none whitespace-nowrap text-[54px] font-black leading-none tracking-tighter text-white/[0.12]"
          >
            MYSTERY BOX
          </span>
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="vc-rise text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55" style={{ animationDelay: "0.1s" }}>
              Verbo Flash · Mystery Box
            </div>
            {user && challenge && (
              <button
                className="verbo-report-btn verbo-report-btn-on-color"
                onClick={() => setIssueOpen(true)}
                aria-label="Report"
                title="Report a technical issue"
              >
                <span className="sign"><ShieldAlert className="h-4 w-4" /></span>
                <span className="text">Report</span>
              </button>
            )}
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 transition-colors hover:bg-white/20 hover:text-white" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative z-10 mt-2">
            {challenge && !opening && (
              <>
                <h3 className="vc-rise text-[22px] font-bold leading-[1.15] tracking-[-0.02em]" style={{ animationDelay: "0.2s", textShadow: "0 2px 16px rgba(0,0,0,0.55)" }}>
                  {challenge.title}
                </h3>
                <div className="vc-rise mt-2 flex flex-wrap items-center gap-2" style={{ animationDelay: "0.25s" }}>
                  <CategoryBadge name={challenge.category} />
                  {challenge.premium && <PremiumBadge />}
                </div>
              </>
            )}
          </div>
        </div>



        {opening || !challenge ? (
          <div className="flex flex-col items-center justify-center gap-4 p-10">
            <div
              className="verbo-box-shake flex h-32 w-32 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4a044e] to-[#7e22ce] text-white shadow-elevated"
              style={{ animation: "verbo-box-shake 0.5s ease-in-out infinite" }}
            >
              <Gift className="h-16 w-16" />
            </div>
            <p className="text-sm text-muted-foreground">Opening your Mystery Box…</p>
          </div>
        ) : (
          <>
            <div className="relative p-6">
              <div className={locked ? "pointer-events-none select-none blur-sm" : ""}>
                <p className="text-[17px] leading-[1.55] tracking-[-0.01em] text-foreground">
                  {challenge.description || "No description available."}
                </p>
                <SubmissionInstructions text={challenge.submission_instructions} delay="0.4s" accent={accent} />
                {challenge.video_url && (
                  <a
                    href={challenge.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    <Play className="h-3.5 w-3.5" /> Watch reference video
                  </a>
                )}
                {onCooldown && (
                  <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-foreground">
                    {COOLDOWN_MSG}
                  </div>
                )}
              </div>
              {locked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-b-2xl bg-white/70 p-6 text-center backdrop-blur-md">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 ring-2 ring-amber-400/40">
                    <Lock className="h-6 w-6" />
                  </span>
                  <AccessGateNotice accent="#7e22ce" />


                </div>
              )}
            </div>
            <ChallengeModalFooter submission={submission} accent={accent} onClose={onClose} onResubmit={onResubmit}>
              {locked ? null : completed ? (
                <Pill tone="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Completed</Pill>
              ) : chosen ? (
                <SuccessButton onClick={onSubmit} disabled={onCooldown} title={onCooldown ? COOLDOWN_MSG : undefined} style={{ backgroundColor: accent, color: "#fff", boxShadow: `0 8px 20px -6px ${accent}` }}>
                  <Upload className="h-3.5 w-3.5" /> Submit Challenge
                </SuccessButton>
              ) : (
                <PrimaryButton onClick={onChoose} style={{ backgroundColor: accent, color: "#fff", boxShadow: `0 8px 20px -6px ${accent}` }}>Let's do it!</PrimaryButton>
              )}
            </ChallengeModalFooter>
          </>
        )}
      </div>

      {user && challenge && (
        <ReportContentIssueModal
          studentId={user.id}
          entityType="challenge"
          entityId={challenge.id}
          entityTitle={challenge.title}
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
        />
      )}
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Detail modal                                                                */
/* -------------------------------------------------------------------------- */
function ChallengeDetail({
  challenge,
  onClose,
  hasPremiumAccess,
  chosen,
  completed,
  cooldownRemaining,
  onChoose,
  onSubmit,
  onResubmit,
  submission,
}: {
  challenge: Challenge;
  onClose: () => void;
  hasPremiumAccess: boolean;
  chosen: boolean;
  completed: boolean;
  cooldownRemaining: number | null;
  onChoose: () => void;
  onSubmit: () => void;
  onResubmit: () => void;
  submission: ChallengeSubmission | null;
}) {
  const { user } = useAuth();
  const [issueOpen, setIssueOpen] = useState(false);
  const locked = !!challenge.premium && !hasPremiumAccess;
  const onCooldown = !completed && chosen && cooldownRemaining !== null;
  const theme = categoryTheme(challenge.category);
  const CatIcon = categoryIcon(challenge.category);
  const catLabel = (challenge.category || "Challenge").toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <style>{`
        @keyframes vc-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes vc-blob { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        @keyframes vc-logo { from { opacity: 0; transform: scale(0.7) rotate(-15deg); } to { opacity: 1; transform: scale(1) rotate(0deg); } }
        .vc-rise { opacity: 0; animation: vc-rise 0.55s cubic-bezier(0.16,1,0.3,1) forwards; }
        .vc-blob { opacity: 0; animation: vc-blob 0.8s cubic-bezier(0.16,1,0.3,1) forwards; }
        .vc-logo { opacity: 0; animation: vc-logo 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .vc-rise, .vc-blob, .vc-logo { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-elevated" onClick={(e) => e.stopPropagation()}>
        {/* HEADER — solid category color + decorative radial blobs + watermark */}
        <div className="relative overflow-hidden px-5 pb-4 pt-3.5 text-white" style={{ backgroundColor: theme.solid }}>
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%)" }}
          />
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 70%)" }}
          />

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="vc-logo flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-md"
                style={{ color: theme.solid }}
              >
                <CatIcon className="h-4 w-4" />
              </span>
              <span className="vc-rise truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-white/80" style={{ animationDelay: "0.1s" }}>
                {catLabel}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {challenge.premium && <PremiumBadge />}
              {user && (
                <button
                  className="verbo-report-btn verbo-report-btn-on-color"
                  onClick={() => setIssueOpen(true)}
                  aria-label="Report"
                  title="Report a technical issue"
                >
                  <span className="sign"><ShieldAlert className="h-4 w-4" /></span>
                  <span className="text">Report</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 transition-colors duration-150 hover:bg-white/20 hover:text-white active:scale-[0.94]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative z-10 mt-2.5">
            <h3 className="vc-rise text-[28px] font-bold leading-[1.1] tracking-[-0.03em]" style={{ animationDelay: "0.18s" }}>
              {challenge.title}
            </h3>
            {challenge.skill_tags && challenge.skill_tags.length > 0 && (
              <div className="vc-rise mt-2 flex flex-wrap gap-1" style={{ animationDelay: "0.24s" }}>
                {challenge.skill_tags.map((s) => <SkillChip key={s} label={s} />)}
              </div>
            )}
          </div>
        </div>


        {/* Stats row — only rendered for the fields the challenge actually has.
            While the real content is undefined, nothing is shown (no empty "—"). */}
        {(() => {
          const meta = challenge as Partial<Record<"duration" | "format" | "reward" | "validity", string>>;
          const stats = [
            { label: "Duration", Icon: Clock, value: meta.duration },
            { label: "Format", Icon: Tag, value: meta.format },
            { label: "Reward", Icon: Trophy, value: meta.reward },
            { label: "Validity", Icon: Shield, value: meta.validity },
          ].filter((s) => !!s.value && String(s.value).trim() !== "");
          if (stats.length === 0) return null;
          return (
            <div
              className="vc-rise grid border-b border-border bg-secondary/40"
              style={{ animationDelay: "0.3s", gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
            >
              {stats.map(({ label, Icon, value }, i) => (
                <div key={label} className={`flex flex-col items-center gap-1 px-2 py-3 ${i > 0 ? "border-l border-border/70" : ""}`}>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
                  <span className="text-sm font-bold text-foreground">{value}</span>
                </div>
              ))}
            </div>
          );
        })()}


        <div className="relative p-6">
          <div className={locked ? "pointer-events-none select-none blur-sm" : ""}>
            <p className="vc-rise text-[17px] leading-[1.55] tracking-[-0.01em] text-foreground" style={{ animationDelay: "0.3s" }}>
              {challenge.description || "No description available."}
            </p>
            <SubmissionInstructions text={challenge.submission_instructions} delay="0.36s" accent={theme.solid} />

            {challenge.video_url && (
              <a
                href={challenge.video_url}
                target="_blank"
                rel="noreferrer"
                className="vc-rise mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                style={{ animationDelay: "0.4s" }}
              >
                <Play className="h-3.5 w-3.5" /> Watch reference video
              </a>
            )}
            {onCooldown && (
              <div className="vc-rise mt-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-foreground" style={{ animationDelay: "0.45s" }}>
                {COOLDOWN_MSG}
              </div>
            )}
          </div>

          {locked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-b-2xl bg-white/70 p-6 text-center backdrop-blur-md">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 ring-2 ring-amber-400/40">
                <Lock className="h-6 w-6" />
              </span>
              <AccessGateNotice accent="#f38934" />

            </div>
          )}
        </div>

        <ChallengeModalFooter
          submission={submission}
          accent={theme.solid}
          onClose={onClose}
          onResubmit={onResubmit}
          delay="0.6s"
        >
          {locked ? null : completed ? (
            <Pill tone="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Completed</Pill>
          ) : chosen ? (
            <SuccessButton
              onClick={onSubmit}
              disabled={onCooldown}
              title={onCooldown ? COOLDOWN_MSG : undefined}
              style={{ backgroundColor: theme.solid, color: "#fff", boxShadow: `0 8px 20px -6px ${theme.solid}` }}
            >
              <Upload className="h-3.5 w-3.5" /> Submit Challenge
            </SuccessButton>
          ) : (
            <PrimaryButton onClick={onChoose} style={{ backgroundColor: theme.solid, color: "#fff", boxShadow: `0 8px 20px -6px ${theme.solid}` }}>
              Let's do it!
            </PrimaryButton>
          )}
        </ChallengeModalFooter>
      </div>

      {user && (
        <ReportContentIssueModal
          studentId={user.id}
          entityType="challenge"
          entityId={challenge.id}
          entityTitle={challenge.title}
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
        />
      )}
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Share Result modal — optional URL + locked "Upload File" (Coming soon).    */
/* -------------------------------------------------------------------------- */
/** Mandatory submission modal. A challenge is only ever "delivered" through
 *  this form — the student must provide a link (uploads coming later) plus an
 *  optional note, and the result goes to the teacher as "pending_review". */
function SubmitChallengeModal({
  title,
  accent,
  icon,
  mode,
  onClose,
  onSubmit,
}: {
  title: string;
  accent: string;
  icon: LucideIcon;
  mode: "submit" | "resubmit";
  onClose: () => void;
  onSubmit: (link: string, note: string) => void;
}) {
  const [source, setSource] = useState<"url" | "upload">("url");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const valid = source === "url" && link.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center verbo-backdrop p-4">
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <AccentModalHeader
          background={accent}
          iconTint={accent}
          icon={icon}
          eyebrow={mode === "resubmit" ? "Try again" : "Submit your work"}
          title={title}
          watermark={{ type: "text", value: "SUBMIT" }}
          onClose={onClose}
        />

        <div className="space-y-4 p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Your teacher will review this submission
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSource("url")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${source === "url" ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
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

          {source === "url" ? (
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a link (video, doc, portfolio, etc.)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-3 text-xs text-muted-foreground">
              <Upload className="h-4 w-4" /> Coming soon — file uploads (pdf / video / image, max 10MB) will be available soon.
            </div>
          )}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add a note for your teacher (optional)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border bg-secondary/30 p-4">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton
            onClick={() => onSubmit(link.trim(), note.trim())}
            disabled={!valid}
            style={{ backgroundColor: accent, color: "#fff" }}
          >
            <Upload className="h-3.5 w-3.5" /> {mode === "resubmit" ? "Resubmit" : "Submit"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Verbo Flash — Lightning card + reveal modal                                */
/* -------------------------------------------------------------------------- */
function formatHMS(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function LightningRevealModal({
  challenge,
  lightningTheme,
  expiresAt,
  nowTick,
  isLive,
  acceptedCount,
  hasPremiumAccess,
  completed,
  onSubmit,
  onResubmit,
  submission,
  onClose,
}: {
  challenge: FlashChallenge;
  lightningTheme: LightningTheme;
  expiresAt: string | null;
  nowTick: number;
  isLive: boolean;
  acceptedCount: number;
  hasPremiumAccess: boolean;
  completed: boolean;
  onSubmit: () => void;
  onResubmit: () => void;
  submission: ChallengeSubmission | null;
  onClose: () => void;
}) {
  const remaining = expiresAt ? +new Date(expiresAt) - nowTick : 0;
  const { user } = useAuth();
  const [issueOpen, setIssueOpen] = useState(false);
  const locked = !!challenge.premium && !hasPremiumAccess;
  const canComplete = isLive && remaining > 0 && !completed && !locked;
  const accent = lightningTheme.accent_color || "#0284c7";
  const headerBg = lightningTheme.theme_image_url
    ? `center / cover no-repeat url(${lightningTheme.theme_image_url}), ${seasonGradientCss(lightningTheme)}`
    : seasonGradientCss(lightningTheme);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      {completed && <Confetti theme="lightning" />}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <style>{VC_HEADER_KEYFRAMES}</style>
        <div className="relative overflow-hidden px-5 pb-4 pt-3.5 text-white" style={{ background: headerBg }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 70%)" }}
          />
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-1 z-0 select-none whitespace-nowrap text-[54px] font-black leading-none tracking-tighter text-white/[0.12]"
          >
            LIGHTNING
          </span>
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="vc-rise text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55" style={{ animationDelay: "0.1s" }}>
              Verbo Flash · Lightning
            </div>
            {user && (
              <button
                className="verbo-report-btn verbo-report-btn-on-color"
                onClick={() => setIssueOpen(true)}
                aria-label="Report"
                title="Report a technical issue"
              >
                <span className="sign"><ShieldAlert className="h-4 w-4" /></span>
                <span className="text">Report</span>
              </button>
            )}
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 transition-colors hover:bg-white/20 hover:text-white" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative z-10 mt-2">
            <h3 className="vc-rise text-[22px] font-bold leading-[1.15] tracking-[-0.02em]" style={{ animationDelay: "0.2s", textShadow: "0 2px 16px rgba(0,0,0,0.55)" }}>
              {challenge.title}
            </h3>
            <div className="vc-rise mt-2 flex flex-wrap items-center gap-2" style={{ animationDelay: "0.25s" }}>
              <CategoryBadge name={challenge.category} />
              {challenge.premium && <PremiumBadge />}
              {isLive && (
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums">
                  {formatHMS(remaining)}
                </span>
              )}
            </div>
            <div className="vc-rise mt-1 text-xs text-white/80" style={{ animationDelay: "0.3s" }}>⚡ {acceptedCount} student{acceptedCount === 1 ? "" : "s"} accepted this</div>
          </div>
        </div>



        <div className="relative p-6">
          <div className={locked ? "pointer-events-none select-none blur-sm" : ""}>
            <p className="text-sm leading-relaxed text-foreground">
              {challenge.description || "No description available."}
            </p>
            <SubmissionInstructions text={challenge.submission_instructions} delay="0.4s" accent={accent} />
            {challenge.video_url && (
              <a
                href={challenge.video_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <Play className="h-3.5 w-3.5" /> Watch reference video
              </a>
            )}
            {!isLive && !completed && (
              <div className="mt-4 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                This Lightning has passed. The next one could strike anytime — stay ready.
              </div>
            )}
          </div>
          {locked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-b-2xl bg-white/70 p-6 text-center backdrop-blur-md">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 ring-2 ring-amber-400/40">
                <Lock className="h-6 w-6" />
              </span>
              <AccessGateNotice accent="#0284c7" />

            </div>
          )}
        </div>

        <ChallengeModalFooter submission={submission} accent={accent} onClose={onClose} onResubmit={onResubmit}>
          {completed ? (
            <Pill tone="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Completed</Pill>
          ) : canComplete ? (
            <SuccessButton onClick={onSubmit} style={{ backgroundColor: accent, color: "#fff", boxShadow: `0 8px 20px -6px ${accent}` }}>
              <Upload className="h-3.5 w-3.5" /> Submit Challenge
            </SuccessButton>
          ) : null}
        </ChallengeModalFooter>
      </div>

      {user && challenge && (
        <ReportContentIssueModal
          studentId={user.id}
          entityType="challenge"
          entityId={challenge.id}
          entityTitle={challenge.title}
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Season — cooldown + reveal modals (skinned per Season)                     */
/* -------------------------------------------------------------------------- */
function SeasonCooldownModal({ season, onClose }: { season: FlashSeason; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card p-6 text-center shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white"
          style={{ background: seasonGradientCss(season) }}
        >

          <Sparkles className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          You've already opened this Season's challenge today — come back tomorrow!
        </p>
        <div className="mt-4 flex justify-center">
          <GhostButton onClick={onClose}>Got it</GhostButton>
        </div>
      </div>
    </div>
  );
}

function SeasonRevealModal({
  season,
  opening,
  challenge,
  hasPremiumAccess,
  chosen,
  completed,
  onChoose,
  onSubmit,
  onResubmit,
  submission,
  onClose,
}: {
  season: FlashSeason;
  opening: boolean;
  challenge: FlashChallenge | null;
  hasPremiumAccess: boolean;
  chosen: boolean;
  completed: boolean;
  onChoose: () => void;
  onSubmit: () => void;
  onResubmit: () => void;
  submission: ChallengeSubmission | null;
  onClose: () => void;
}) {
  const locked = !!challenge?.premium && !hasPremiumAccess;
  const { user } = useAuth();
  const [issueOpen, setIssueOpen] = useState(false);
  const seasonGradient = seasonGradientCss(season);
  const family = fontFamilyFor(season);
  const headerBg = season.theme_image_url
    ? `center / cover no-repeat url(${season.theme_image_url}), ${seasonGradient}`
    : seasonGradient;
  const accent = season.accent_color || "#7e22ce";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      {challenge && !opening && <Confetti />}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <style>{`
          @keyframes verbo-box-shake {
            0%, 100% { transform: translateX(0) rotate(0); }
            20% { transform: translateX(-6px) rotate(-8deg); }
            40% { transform: translateX(6px) rotate(8deg); }
            60% { transform: translateX(-4px) rotate(-6deg); }
            80% { transform: translateX(4px) rotate(6deg); }
          }
          @media (prefers-reduced-motion: reduce) { .verbo-box-shake { animation: none !important; } }
          ${VC_HEADER_KEYFRAMES}
        `}</style>
        <div className="relative overflow-hidden px-5 pb-4 pt-3.5 text-white" style={{ background: headerBg }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 70%)" }}
          />
          <span
            aria-hidden
            className="vc-blob pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 70%)" }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-1 z-0 select-none whitespace-nowrap text-[54px] font-black leading-none tracking-tighter text-white/[0.12]"
          >
            {season.display_name.toUpperCase()}
          </span>
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="vc-rise text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60" style={{ animationDelay: "0.1s" }}>
              Verbo Flash · {season.display_name}
            </div>
            {user && challenge && (
              <button
                className="verbo-report-btn verbo-report-btn-on-color"
                onClick={() => setIssueOpen(true)}
                aria-label="Report"
                title="Report a technical issue"
              >
                <span className="sign"><ShieldAlert className="h-4 w-4" /></span>
                <span className="text">Report</span>
              </button>
            )}
            <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 transition-colors hover:bg-white/20 hover:text-white" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative z-10 mt-2">
            {challenge && !opening && (
              <>
                <h3
                  className="vc-rise text-[22px] font-bold leading-[1.15] tracking-[-0.02em]"
                  style={{ fontFamily: `"${family}", system-ui, sans-serif`, animationDelay: "0.2s", textShadow: "0 2px 16px rgba(0,0,0,0.55)" }}
                >
                  {challenge.title}
                </h3>
                <div className="vc-rise mt-2 flex flex-wrap items-center gap-2" style={{ animationDelay: "0.25s" }}>
                  <CategoryBadge name={challenge.category} />
                  {challenge.premium && <PremiumBadge />}
                </div>
              </>
            )}
          </div>
        </div>



        {opening || !challenge ? (
          <div className="flex flex-col items-center justify-center gap-4 p-10">
            <div
              className="verbo-box-shake flex h-32 w-32 items-center justify-center rounded-2xl text-white shadow-elevated"
              style={{ animation: "verbo-box-shake 0.5s ease-in-out infinite", background: seasonGradient }}
            >
              <Sparkles className="h-16 w-16" />
            </div>
            <p className="text-sm text-muted-foreground">Opening your {season.display_name} challenge…</p>
          </div>
        ) : (
          <>
            <div className="relative p-6">
              <div className={locked ? "pointer-events-none select-none blur-sm" : ""}>
                <p className="text-[17px] leading-[1.55] tracking-[-0.01em] text-foreground">
                  {challenge.description || "No description available."}
                </p>
                <SubmissionInstructions text={challenge.submission_instructions} delay="0.4s" accent={accent} />
                {challenge.video_url && (
                  <a
                    href={challenge.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    <Play className="h-3.5 w-3.5" /> Watch reference video
                  </a>
                )}
              </div>
              {locked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-b-2xl bg-white/70 p-6 text-center backdrop-blur-md">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 ring-2 ring-amber-400/40">
                    <Lock className="h-6 w-6" />
                  </span>
                  <AccessGateNotice accent={season.accent_color || "#7e22ce"} />

                </div>
              )}
            </div>
            <ChallengeModalFooter submission={submission} accent={accent} onClose={onClose} onResubmit={onResubmit}>
              {locked ? null : completed ? (
                <Pill tone="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Completed</Pill>
              ) : chosen ? (
                <SuccessButton onClick={onSubmit} style={{ backgroundColor: accent, color: "#fff", boxShadow: `0 8px 20px -6px ${accent}` }}>
                  <Upload className="h-3.5 w-3.5" /> Submit Challenge
                </SuccessButton>
              ) : (
                <PrimaryButton onClick={onChoose} style={{ backgroundColor: accent, color: "#fff", boxShadow: `0 8px 20px -6px ${accent}` }}>Let's do it!</PrimaryButton>
              )}
            </ChallengeModalFooter>
          </>
        )}
      </div>

      {user && challenge && (
        <ReportContentIssueModal
          studentId={user.id}
          entityType="challenge"
          entityId={challenge.id}
          entityTitle={challenge.title}
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
        />
      )}
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Leaderboard — top challenge completers within the same product cohort.     */
/*                                                                            */
/* All ranking logic runs on the raw USERS + per-user LeaderboardIdentity     */
/* stores; the component is a pure renderer that re-derives on each render    */
/* and re-subscribes to student + identity mutations so podium updates are    */
/* live (nickname edited in ProfileModal, new completions, etc.).             */
/* -------------------------------------------------------------------------- */

interface LeaderboardRow {
  userId: string;
  displayName: string;
  useRealAvatar: boolean;
  avatarSeed: string; // used for the initials + color when useRealAvatar=false
  completed: number;
}

function useLeaderboardRows(): LeaderboardRow[] {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const un1 = subscribeStudents(() => setTick((t) => t + 1));
    const un2 = subscribeLeaderboardIdentity(() => setTick((t) => t + 1));
    return () => { un1(); un2(); };
  }, []);
  return useMemo(() => {
    void tick;
    // Tie-break key: the student's REAL name (falling back to the stable id),
    // never displayName — otherwise the order would shift with the purely
    // visual nickname/real-name preference even at identical scores.
    const sortKey = new Map<string, string>();
    return USERS
      .filter((u) => u.role === "student")
      .map<LeaderboardRow>((u) => {
        const id = getLeaderboardIdentity(u.id);
        const useReal = id.mode === "real" || !id.nickname.trim();
        const displayName = useReal ? u.name : id.nickname.trim();
        sortKey.set(u.id, u.name || u.id);
        return {
          userId: u.id,
          displayName,
          useRealAvatar: useReal,
          avatarSeed: useReal ? u.name : id.nickname.trim(),
          completed: totalCompletedChallenges(u),
        };
      })
      .sort((a, b) =>
        b.completed - a.completed
        || (sortKey.get(a.userId) ?? a.userId).localeCompare(sortKey.get(b.userId) ?? b.userId)
        || a.userId.localeCompare(b.userId),
      );

  }, [tick]);
}

function NicknameAvatar({ seed, className = "" }: { seed: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold ${className}`}
      style={{ background: colorFromString(seed || "?") }}
    >
      {initialsOf(seed || "?")}
    </span>
  );
}

function RowAvatar({ row, size }: { row: LeaderboardRow; size: "sm" | "lg" }) {
  const realAvatar = useAvatar(row.useRealAvatar ? row.userId : undefined);
  const cls = size === "lg" ? "h-16 w-16 text-lg" : "h-9 w-9 text-xs";
  const inner =
    row.useRealAvatar && realAvatar ? (
      <img src={realAvatar} alt="" className={`${cls} rounded-full object-cover`} />
    ) : (
      <NicknameAvatar seed={row.avatarSeed} className={cls} />
    );
  return (
    <ProfilePeekCard
      userId={row.userId}
      displayName={row.displayName}
      showRealIdentity={row.useRealAvatar}
    >
      {inner}
    </ProfilePeekCard>
  );
}


const PODIUM_STYLES: Record<number, {
  frame: string; medal: string; label: string; halo: string; delay: number;
  surface: string; shadow: string; ghost: string; ghostColor: string; rankPill: string;
}> = {
  0: {
    frame: "bg-gradient-to-br from-[#fde68a] via-[#fbbf24] to-[#d97706] p-[5px] shadow-[0_0_0_3px_rgba(251,191,36,0.35)]",
    medal: "bg-gradient-to-br from-[#fbbf24] to-[#d97706] text-white ring-2 ring-white/70",
    label: "1",
    halo: "from-[#fbbf24]/60",
    delay: 0,
    surface:
      "linear-gradient(165deg, #fffaf0 0%, #fff2d1 46%, #ffe3a6 100%)",
    shadow:
      "0 26px 48px -18px rgba(217,119,6,0.45), 0 8px 18px -10px rgba(217,119,6,0.30), inset 0 1px 0 rgba(255,255,255,0.9)",
    ghost: "1",
    ghostColor: "rgba(217,119,6,0.13)",
    rankPill: "bg-[#d97706] text-white",
  },
  1: {
    frame: "bg-gradient-to-br from-[#f1f5f9] via-[#cbd5e1] to-[#94a3b8] p-[4px] shadow-[0_0_0_2px_rgba(203,213,225,0.5)]",
    medal: "bg-gradient-to-br from-[#e2e8f0] to-[#94a3b8] text-slate-800 ring-2 ring-white/70",
    label: "2",
    halo: "from-[#cbd5e1]/50",
    delay: 120,
    surface:
      "linear-gradient(165deg, #ffffff 0%, #f2f6fb 48%, #dfe7f1 100%)",
    shadow:
      "0 20px 38px -18px rgba(71,85,105,0.38), 0 6px 14px -8px rgba(71,85,105,0.22), inset 0 1px 0 rgba(255,255,255,0.95)",
    ghost: "2",
    ghostColor: "rgba(71,85,105,0.11)",
    rankPill: "bg-[#64748b] text-white",
  },
  2: {
    frame: "bg-gradient-to-br from-[#fdba74] via-[#c2764a] to-[#92400e] p-[3px]",
    medal: "bg-gradient-to-br from-[#c2764a] to-[#92400e] text-amber-50 ring-2 ring-white/60",
    label: "3",
    halo: "from-[#c2764a]/40",
    delay: 220,
    surface:
      "linear-gradient(165deg, #fffaf6 0%, #fbeade 48%, #f3d6c2 100%)",
    shadow:
      "0 20px 38px -18px rgba(146,64,14,0.40), 0 6px 14px -8px rgba(146,64,14,0.22), inset 0 1px 0 rgba(255,255,255,0.9)",
    ghost: "3",
    ghostColor: "rgba(146,64,14,0.12)",
    rankPill: "bg-[#b45309] text-white",
  },
};


/** FLIP: animates rows sliding from their previous position to the new one. */
function useFlipPositions(orderKey: string) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    nodes.current.forEach((el, key) => {
      const after = el.getBoundingClientRect();
      const before = prev.current.get(key);
      if (before && !reduce) {
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          el.style.transition = "none";
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform 560ms cubic-bezier(0.23,1,0.32,1)";
            el.style.transform = "";
          });
        }
      }
      prev.current.set(key, after);
    });
  }, [orderKey]);

  return (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };
}

function LeaderboardSection({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const rows = useLeaderboardRows();
  const flipRef = useFlipPositions(rows.map((r) => r.userId).join("|"));
  if (rows.length === 0) return null;

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  // Ensure a visual "3-2-1-...” ordering: put #1 in the middle when there are 3+.
  const podiumOrdered = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const podiumRankOf = (r: LeaderboardRow) => podium.indexOf(r); // 0..2

  // Derived: gap between the current user and the leader.
  const leader = rows[0];
  const me = rows.find((r) => r.userId === currentUserId);
  const isLeader = !!me && leader.userId === me.userId;
  const gapToFirst = me && !isLeader ? leader.completed - me.completed + 1 : 0;

  return (
    <section>
      <style>{`
        @keyframes verbo-podium-in {
          from { opacity: 0; transform: scale(0.86) translateY(28px) rotate(-3.5deg); }
          62% { opacity: 1; transform: scale(1.06) translateY(-8px) rotate(1.2deg); }
          82% { transform: scale(0.985) translateY(2px) rotate(-0.4deg); }
          to { opacity: 1; transform: none; }
        }
        @keyframes verbo-podium-crown-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.55), 0 0 18px 2px rgba(251,191,36,0.35); }
          50% { box-shadow: 0 0 0 12px rgba(251,191,36,0), 0 0 36px 10px rgba(251,191,36,0.6); }
        }
        @keyframes verbo-podium-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes verbo-podium-sheen {
          0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
          12% { opacity: 0.85; }
          55% { opacity: 0.55; }
          100% { transform: translateX(240%) skewX(-18deg); opacity: 0; }
        }
        @keyframes verbo-board-drift {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(2%, -3%, 0) scale(1.06); }
        }
        .verbo-podium-in { animation: verbo-podium-in 820ms cubic-bezier(0.34,1.56,0.44,1) both; }
        .verbo-podium-glow { animation: verbo-podium-crown-glow 2.2s ease-in-out infinite; }
        .verbo-podium-card { transition: transform 320ms cubic-bezier(0.23,1,0.32,1), box-shadow 320ms cubic-bezier(0.23,1,0.32,1); }
        .verbo-podium-card:hover { transform: translateY(-8px) scale(1.025); }
        .verbo-podium-card:active { transform: translateY(-2px) scale(0.985); }
        .verbo-podium-float { animation: verbo-podium-float 4.5s ease-in-out infinite; }
        .verbo-podium-sheen::after {
          content: ""; position: absolute; inset: -30% -10%;
          background: linear-gradient(100deg, transparent 35%, rgba(255,255,255,0.85) 50%, transparent 65%);
          animation: verbo-podium-sheen 4.6s ease-in-out infinite; pointer-events: none;
        }
        .verbo-board-blob { animation: verbo-board-drift 14s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .verbo-podium-in, .verbo-podium-glow, .verbo-podium-float,
          .verbo-podium-sheen::after, .verbo-board-blob { animation: none !important; }
          .verbo-podium-card:hover { transform: none; }
          .verbo-flip { transition: none !important; }
        }
      `}</style>
      <div className="mb-4">
        <h2 className="text-[22px] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground">Leaderboard</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Total Challenges and Flash completed by all students.</p>
      </div>
      <Card className="relative overflow-hidden rounded-[28px] border-[color-mix(in_oklab,var(--accent)_18%,transparent)] !p-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #fbfdff 0%, #f3f7fc 55%, #eef4fa 100%)",
          }}
        />
        <div
          aria-hidden
          className="verbo-board-blob pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(251,191,36,0.28), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="verbo-board-blob pointer-events-none absolute -right-20 top-4 h-64 w-64 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.22), transparent 70%)", animationDelay: "-6s" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
          style={{ background: "linear-gradient(180deg, transparent, rgba(126,224,45,0.10))" }}
        />
        <div className="relative p-6">
          {/* Top 3 podium */}
          <div className={`grid items-end gap-3 ${podium.length === 3 ? "grid-cols-3" : podium.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {podiumOrdered.map((row) => {
              const rank = podiumRankOf(row);
              const style = PODIUM_STYLES[rank];
              const isYou = row.userId === currentUserId;
              const first = rank === 0;
              return (
                <div
                  key={row.userId}
                  ref={flipRef(row.userId)}
                  className={`verbo-podium-in verbo-podium-card verbo-flip relative flex flex-col items-center gap-2 overflow-hidden rounded-[1.5rem] border border-white/70 px-3 text-center ring-1 ring-inset ring-white/60 ${first ? "verbo-podium-sheen pb-5 pt-9" : "pb-4 pt-7"} ${first ? "-mb-1 scale-[1.03]" : ""}`}
                  style={{
                    animationDelay: `${style.delay}ms`,
                    background: style.surface,
                    boxShadow: style.shadow,
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-6 right-1 select-none font-black leading-none"
                    style={{
                      fontSize: first ? "7.5rem" : "6rem",
                      color: style.ghostColor,
                      letterSpacing: "-0.06em",
                    }}
                  >
                    {style.ghost}
                  </span>
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${style.halo} to-transparent opacity-55`}
                  />
                  {first && (
                    <img
                      src={crownIconAsset}
                      alt=""
                      aria-hidden
                      className="verbo-podium-float pointer-events-none absolute -top-1 left-1/2 h-10 w-10 -translate-x-1/2 object-contain drop-shadow"
                    />
                  )}
                  <span
                    className={`absolute left-3 top-3 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black tabular-nums shadow-sm ${style.rankPill}`}
                  >
                    {style.label}
                  </span>
                  <div className="relative z-10">
                    <div className={`rounded-full ${style.frame} ${first ? "verbo-podium-glow" : ""}`}>
                      <div className="rounded-full bg-[#7ee02d]/15 p-[2px]">
                        <RowAvatar row={row} size="lg" />
                      </div>
                    </div>
                    <img
                      src={rank === 0 ? winnerBadgeAsset : rank === 1 ? silverCoinAsset : bronzeCoinAsset}
                      alt={`Rank ${style.label}`}
                      className="absolute -bottom-3 left-1/2 h-12 w-12 -translate-x-1/2 object-contain drop-shadow"
                    />

                  </div>
                  <div className={`relative z-10 mt-2 line-clamp-1 font-bold tracking-[-0.02em] text-foreground ${first ? "text-[1.0625rem]" : "text-sm"}`}>
                    {row.displayName}
                    {isYou && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-accent">You</span>}
                  </div>
                  <div className="relative z-10 text-[11px] text-muted-foreground">
                    <span className={`font-black tabular-nums tracking-[-0.03em] text-foreground ${first ? "text-lg" : "text-base"}`}>{row.completed}</span>{" "}
                    <span className="opacity-70">
                      {row.completed === 1 ? "completed" : "completed"}
                    </span>
                  </div>

                </div>
              );
            })}
          </div>

          {me && (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              {isLeader
                ? "You're #1! 🏆"
                : `You are only ${gapToFirst} challenge${gapToFirst === 1 ? "" : "s"} away from 1st place`}
            </p>
          )}

          {/* Rest of the ranking */}
          {rest.length > 0 && (
            <ul className="mt-5 divide-y divide-border rounded-xl border border-border bg-background">
              {rest.map((row, idx) => {
                const pos = idx + 4;
                const isYou = row.userId === currentUserId;
                return (
                  <li
                    key={row.userId}
                    ref={flipRef(row.userId)}
                    className={`verbo-flip flex items-center gap-3 px-4 py-2.5 text-sm ${isYou ? "bg-accent/10" : ""}`}
                  >
                    <span className="w-6 text-right text-xs font-semibold text-muted-foreground">{pos}</span>
                    <span className="rounded-full bg-[#7ee02d]/15 p-[2px]">
                      <RowAvatar row={row} size="sm" />
                    </span>
                    <span className="flex-1 truncate font-medium text-foreground">
                      {row.displayName}
                      {isYou && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-accent">You</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.completed}{" "}
                      <span className="opacity-70">
                        {row.completed === 1 ? "Challenge completed" : "Challenges completed"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </section>
  );
}


/* -------------------------------------------------------------------------- */
/* Screen-1 hero — gamified header with animated entrance + stat tiles.       */
/* -------------------------------------------------------------------------- */
function ChallengesHero({
  gradient,
  currentStreak,
  longestStreak,
  completed,
}: {
  gradient: string;
  currentStreak: number;
  longestStreak: number;
  completed: number;
}) {
  const stats = [
    { icon: fireIconAsset, label: "Current streak", value: currentStreak },
    { icon: trophyIconAsset, label: "Longest streak", value: longestStreak },
    { icon: confettiIconAsset, label: "Completed", value: completed },
  ];
  return (
    <div className={`verbo-hero-enter relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} p-7 text-white shadow-elevated`}>
      <style>{`
        @keyframes verbo-hero-in {
          from { opacity: 0; transform: translateY(12px) scale(0.985); }
          to { opacity: 1; transform: none; }
        }
        @keyframes verbo-hero-shine {
          0% { transform: translateX(-120%) skewX(-18deg); }
          60%, 100% { transform: translateX(260%) skewX(-18deg); }
        }
        .verbo-hero-enter { animation: verbo-hero-in 520ms cubic-bezier(0.23,1,0.32,1) both; }
        .verbo-hero-shine { animation: verbo-hero-shine 4.5s cubic-bezier(0.23,1,0.32,1) infinite; }
        .verbo-stat-in { animation: verbo-hero-in 520ms cubic-bezier(0.23,1,0.32,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .verbo-hero-enter, .verbo-hero-shine, .verbo-stat-in { animation: none !important; }
        }
      `}</style>

      {/* decorative texture */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="verbo-hero-shine absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* Verbot mascot — cropped at the banner's right edge */}
      <img
        src={verbotHeroAsset}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-[19%] right-[-4%] hidden h-[140%] w-auto select-none object-contain sm:block"
      />



      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90 shadow-inner">
          <Sparkles className="h-3.5 w-3.5" /> Weekly Challenges
        </div>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Pick a difficulty to explore
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/80">
          Complementary practice — completing challenges keeps your streak alive and unlocks badges.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="verbo-stat-in flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 shadow-inner ring-1 ring-white/20"
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <img src={s.icon} alt="" aria-hidden className="h-8 w-8 object-contain" />
              </span>
              <div>
                <div className="text-2xl font-bold leading-none tracking-tight">{s.value}</div>
                <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-white/70">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Player profile card — avatar, editable display name and one showcase badge */
/* -------------------------------------------------------------------------- */
function PlayerProfileCard({ student }: { student: (typeof USERS)[number] }) {
  const avatar = useAvatar(student.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [picker, setPicker] = useState(false);
  const [challengeBadges, setChallengeBadges] = useState(false);

  const [mode, setMode] = useState<LeaderboardIdentityMode>("real");
  const [nickname, setNickname] = useState("");

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const un1 = subscribeLeaderboardIdentity(bump);
    const un2 = subscribeProfileBadges(bump);
    const un3 = subscribeEquippedBadges(bump);
    return () => { un1(); un2(); un3(); };
  }, []);

  useEffect(() => {
    const cur = getLeaderboardIdentity(student.id);
    setMode(cur.mode);
    setNickname(cur.nickname);
  }, [student.id, tick]);

  const identity = useMemo(() => { void tick; return getLeaderboardIdentity(student.id); }, [student.id, tick]);
  const displayName = identity.mode === "nickname" && identity.nickname.trim()
    ? identity.nickname.trim()
    : student.name;

  const { earned, equipped } = useMemo(() => {
    void tick;
    const all = loadProfileBadges();
    const ctx = buildProfileBadgeContext(student);
    return {
      earned: all.filter((b) => isProfileBadgeEarned(b, ctx) || isBadgeManuallyGranted(student.id, b.id, "profile")),
      equipped: loadEquippedBadgeIds(student.id),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student, tick]);

  const slotBadge: ProfileBadgeDef | null = equipped[0]
    ? earned.find((b) => b.id === equipped[0]) ?? null
    : null;
  const available = earned.filter((b) => !equipped.slice(1, EQUIPPED_MAX).includes(b.id));

  const commit = (next: { mode: LeaderboardIdentityMode; nickname: string }) => {
    setMode(next.mode);
    setNickname(next.nickname);
    setLeaderboardIdentity(student.id, next);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(student.id, String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <section>
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c8801a]">Identity</div>
        <h2 className="mt-1 text-[22px] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground">Your player card</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Customize how you show up on the leaderboard.</p>
      </div>

      <div className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(152deg,#2b2140_0%,#3a2a55_44%,#5b3f56_78%,#7a5442_100%)] text-white shadow-[0_24px_60px_-32px_rgba(58,42,85,0.8)]">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(240,183,110,0.6),transparent)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(168,126,224,0.35),transparent_70%)] blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(243,181,102,0.3),transparent_70%)] blur-3xl"
        />

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)", backgroundSize: "22px 22px" }}
        />

        <div className="relative z-10 p-6">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-1 rounded-full bg-[conic-gradient(from_200deg,rgba(243,181,102,0.85),rgba(168,126,224,0.85),rgba(243,181,102,0.85))] opacity-60 blur-[2px]"
              />
              {avatar ? (
                <img src={avatar} alt="" className="relative h-[84px] w-[84px] rounded-full border border-white/20 object-cover" />
              ) : (
                <span
                  className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full border border-white/20 text-[26px] font-bold tracking-[-0.02em] text-white"
                  style={{ background: colorFromString(student.name) }}
                >
                  {initialsOf(student.name)}
                </span>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Change photo"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(140deg,#8b63c9,#e8a35c)] text-white shadow-[0_6px_16px_-6px_rgba(139,99,201,0.9)] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:scale-110 active:scale-[0.94]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-[24px] font-semibold leading-[1.08] tracking-[-0.035em] text-white">{displayName}</div>
                <button
                  type="button"
                  onClick={() => setEditingName((v) => !v)}
                  aria-label="Edit display name"
                  className="shrink-0 rounded-lg p-1.5 text-white/45 transition-colors duration-200 hover:bg-white/10 hover:text-white active:scale-[0.94]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1">
                <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">{totalCompletedChallenges(student)}</span>
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">challenges done</span>
              </div>
            </div>
          </div>

          {editingName && (
            <div className="verbo-fade-up mt-5 space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Show on leaderboard as
              </div>
              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="radio"
                  checked={mode === "real"}
                  onChange={() => commit({ mode: "real", nickname })}
                />
                My name <span className="text-white/45">({student.name})</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="radio"
                  checked={mode === "nickname"}
                  onChange={() => commit({ mode: "nickname", nickname })}
                />
                Custom nickname
              </label>
              {mode === "nickname" && (
                <input
                  value={nickname}
                  onChange={(e) => commit({ mode: "nickname", nickname: e.target.value })}
                  placeholder="Your nickname"
                  className="w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none transition-colors focus:border-[#e8a35c]"
                />
              )}
            </div>
          )}

          <div className="my-5 h-px w-full bg-white/10" />

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">Showcase badge</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPicker(true)}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-left transition-[transform,border-color,background-color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:border-[#e8a35c]/70 hover:bg-white/[0.09] active:scale-[0.98] active:duration-100"
              >
                {slotBadge ? (
                  <>
                    <BadgeVisual badge={slotBadge} earned size="sm" />
                    <div>
                      <div className="text-sm font-semibold tracking-[-0.01em] text-white">{slotBadge.name}</div>
                      <div className="text-[11px] text-white/45">Tap to change</div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/20 text-white/50">
                      <Plus className="h-5 w-5" />
                    </span>
                    <div className="text-sm font-medium text-white/60">Add badge</div>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setChallengeBadges(true)}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold tracking-[-0.01em] text-white transition-[transform,border-color,background-color] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:border-[#e8a35c]/70 hover:bg-white/[0.09] active:scale-[0.98] active:duration-100"
              >
                Badges
              </button>
            </div>
          </div>
        </div>
      </div>


      <BadgePickerModal
        open={picker}
        onOpenChange={setPicker}
        available={available}
        earnedCount={earned.length}
        onPick={(id) => {
          const next = [...equipped];
          next[0] = id;
          setEquippedBadgeIds(student.id, next.filter(Boolean) as string[]);
          setPicker(false);
        }}
      />

      <ChallengeBadgesModal
        open={challengeBadges}
        onOpenChange={setChallengeBadges}
        student={student}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Challenge Badges modal — the 8 core badges (equippable), the Lightning Bolt */
/* badge and the dynamic Season badges (display-only). Fully independent from  */
/* the Profile Badges system in ProfileModal.tsx.                              */
/* -------------------------------------------------------------------------- */
type ChallengeBadgeTile = {
  key: string;
  name: string;
  earned: boolean;
  image?: string;
  requirement: string;
  equippable: boolean;
  badgeId?: string;
};

function ChallengeBadgesModal({
  open,
  onOpenChange,
  student,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  student: (typeof USERS)[number];
}) {
  const [tick, setTick] = useState(0);
  const [badges, setBadges] = useState<BadgeDef[]>(loadBadges);
  const [challenges, setChallenges] = useState<Challenge[]>(loadChallenges);
  const [seasons, setSeasons] = useState<FlashSeason[]>(loadSeasons);
  const [equipped, setEquipped] = useState<string[]>([]);

  useEffect(() => {
    setBadges(loadBadges());
    setChallenges(loadChallenges());
    setSeasons(loadSeasons());
    setEquipped(loadEquippedChallengeBadgeIds(student.id));
    const bump = () => setTick((t) => t + 1);
    const un1 = subscribeBadges(() => setBadges(loadBadges()));
    const un2 = subscribeChallenges(() => setChallenges(loadChallenges()));
    const un3 = subscribeSeasons(() => setSeasons(loadSeasons()));
    const un4 = subscribeEquippedChallengeBadges(() => {
      setEquipped(loadEquippedChallengeBadgeIds(student.id));
      bump();
    });
    const un5 = subscribeStudents(bump);
    return () => { un1(); un2(); un3(); un4(); un5(); };
  }, [student.id]);

  const ctx: BadgeContext = useMemo(() => {
    void tick;
    const done = student.completed_challenges ?? [];
    const map = new Map(challenges.map((c) => [c.id, c]));
    const cats = new Set<string>();
    let premiumDone = false;
    for (const entry of done) {
      const ch = map.get(entry.challenge_id);
      if (!ch) continue;
      if (ch.category) cats.add(ch.category);
      if (ch.premium) premiumDone = true;
    }
    return {
      completedCount: done.length,
      longestStreak: student.longest_streak ?? 0,
      distinctCategories: cats.size,
      hasCompletedPremium: premiumDone,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges, student.completed_challenges, student.longest_streak, tick]);

  const tiles: ChallengeBadgeTile[] = useMemo(() => {
    const core: ChallengeBadgeTile[] = badges.map((b) => {
      const meta = BADGE_METRIC_META[b.rule.metric];
      const requirement = meta
        ? meta.numeric
          ? `${meta.label}: ${b.rule.threshold ?? 1}`
          : meta.label
        : b.description;
      return {
        key: `core-${b.id}`,
        badgeId: b.id,
        name: b.name,
        earned: isBadgeEarned(b, ctx) || isBadgeManuallyGranted(student.id, b.id, "challenge"),
        image: b.image || undefined,
        requirement: b.description || requirement,
        equippable: true,
      };
    });
    const bolt: ChallengeBadgeTile = {
      key: "lightning",
      badgeId: "lightning",
      name: "⚡ Lightning Bolt",
      earned: (student.lightning_completions ?? 0) >= 1,
      requirement: "Complete a Lightning challenge within its live window.",
      equippable: true,
    };
    const seasonTiles: ChallengeBadgeTile[] = seasons.map((s) => ({
      key: `season-${s.id}`,
      badgeId: `season-${s.id}`,
      name: s.badge_name,
      earned: (student.season_completions?.[s.id] ?? 0) >= 1,
      requirement: `Complete a challenge during the ${s.display_name} Season.`,
      equippable: true,
    }));
    return [...core, bolt, ...seasonTiles];
  }, [badges, ctx, seasons, student.lightning_completions, student.season_completions]);

  if (!open) return null;

  const toggle = (badgeId: string) => {
    const next = equipped.includes(badgeId)
      ? equipped.filter((id) => id !== badgeId)
      : [...equipped, badgeId].slice(-EQUIPPED_CHALLENGE_MAX);
    setEquippedChallengeBadgeIds(student.id, next);
    setEquipped(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-elevated">
        <style>{`
          @keyframes verbo-badge-glow {
            0%, 100% { box-shadow: 0 0 0px 0px rgba(245,158,11,0), 0 2px 6px rgba(0,0,0,0.15); }
            50% { box-shadow: 0 0 14px 3px rgba(245,158,11,0.55), 0 2px 6px rgba(0,0,0,0.15); }
          }
          @keyframes verbo-badge-lock-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(100,116,139,0.25); }
            50% { box-shadow: 0 0 0 6px rgba(100,116,139,0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .verbo-badge-glow, .verbo-badge-lock-pulse { animation: none !important; }
          }
        `}</style>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-foreground">Challenge badges</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Earned automatically by completing challenges and building streaks. Tap an unlocked badge to equip it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-5 sm:grid-cols-4">
          {tiles.map((t) => {
            const isEquipped = !!t.badgeId && equipped.includes(t.badgeId);
            const clickable = t.equippable && t.earned && !!t.badgeId;
            const Wrapper = clickable ? "button" : "div";
            return (
              <div key={t.key} className="group relative flex flex-col items-center gap-2 text-center">
                <Wrapper
                  {...(clickable ? { type: "button" as const, onClick: () => toggle(t.badgeId!) } : {})}
                  className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-transform ${
                    clickable ? "cursor-pointer hover:scale-105" : ""
                  } ${
                    t.earned
                      ? "verbo-badge-glow bg-amber-500/15 text-amber-600 ring-2 ring-amber-400/50"
                      : "verbo-badge-lock-pulse bg-secondary text-muted-foreground grayscale"
                  } ${isEquipped ? "ring-4 ring-[#f38934]" : ""}`}
                  style={{ animation: t.earned ? "verbo-badge-glow 2.2s ease-in-out infinite" : "verbo-badge-lock-pulse 2.6s ease-in-out infinite" }}
                >
                  {t.image ? (
                    <img src={t.image} alt="" className={`h-full w-full rounded-full object-cover ${t.earned ? "" : "grayscale opacity-60"}`} />
                  ) : (
                    <Trophy className="h-7 w-7" />
                  )}
                  {!t.earned && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35">
                      <Lock className="h-5 w-5 text-white" />
                    </span>
                  )}
                  {isEquipped && (
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#f38934] text-white">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </Wrapper>
                <div className="text-[11px] font-semibold leading-tight text-foreground">{t.name}</div>
                {!t.earned && (
                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 w-44 -translate-x-1/2 -translate-y-full rounded-xl bg-foreground px-3 py-2 text-[11px] font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {t.requirement}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

