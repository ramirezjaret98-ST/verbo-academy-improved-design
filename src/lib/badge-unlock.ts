// Shared badge-unlock logic (no JSX) — computes every badge a student has
// earned across core Challenge badges, Lightning, Seasons and Profile Badges.
// Consumed by BadgeUnlockCelebration.tsx and notifications-store.ts.

import { USERS } from "./mock-data";
import { loadChallenges } from "./challenges-store";
import {
  loadBadges as loadChallengeBadges,
  isBadgeEarned as isChallengeBadgeEarned,
} from "./badges-store";
import {
  loadBadges as loadProfileBadges,
  isBadgeEarned as isProfileBadgeEarned,
  buildProfileBadgeContext,
} from "./profile-badges-store";
import { loadSeasons } from "./flash-challenges-store";
import { isBadgeManuallyGranted } from "./badge-override-store";

export type BadgeKind = "core" | "lightning" | "season" | "profile";

type StudentLike = (typeof USERS)[number];

export interface UnlockBadge {
  /** Globally unique id used for "seen" tracking and React keys. */
  storageId: string;
  /** Raw id used by the relevant equip store (unprefixed). */
  equipId: string;
  kind: BadgeKind;
  name: string;
  image?: string;
  iconKind: "award" | "zap" | "medal";
}

export function computeAllEarnedBadges(student: StudentLike): UnlockBadge[] {
  const out: UnlockBadge[] = [];

  const done = student.completed_challenges ?? [];
  const map = new Map(loadChallenges().map((c) => [c.id, c]));
  const cats = new Set<string>();
  let premiumDone = false;
  for (const entry of done) {
    const ch = map.get(entry.challenge_id);
    if (!ch) continue;
    if (ch.category) cats.add(ch.category);
    if (ch.premium) premiumDone = true;
  }
  const ctx = {
    completedCount: done.length,
    longestStreak: student.longest_streak ?? 0,
    distinctCategories: cats.size,
    hasCompletedPremium: premiumDone,
  };
  for (const b of loadChallengeBadges()) {
    if (isChallengeBadgeEarned(b, ctx) || isBadgeManuallyGranted(student.id, b.id, "challenge")) {
      out.push({
        storageId: b.id,
        equipId: b.id,
        kind: "core",
        name: b.name,
        image: b.image || undefined,
        iconKind: "award",
      });
    }
  }

  if ((student.lightning_completions ?? 0) >= 1) {
    out.push({
      storageId: "lightning",
      equipId: "lightning",
      kind: "lightning",
      name: "Lightning Bolt",
      iconKind: "zap",
    });
  }

  for (const s of loadSeasons()) {
    if ((student.season_completions?.[s.id] ?? 0) >= 1) {
      out.push({
        storageId: `season-${s.id}`,
        equipId: `season-${s.id}`,
        kind: "season",
        name: s.badge_name,
        iconKind: "medal",
      });
    }
  }

  const profileCtx = buildProfileBadgeContext(student);
  for (const b of loadProfileBadges()) {
    if (isProfileBadgeEarned(b, profileCtx) || isBadgeManuallyGranted(student.id, b.id, "profile")) {
      out.push({
        storageId: `profile-${b.id}`,
        equipId: b.id,
        kind: "profile",
        name: b.name,
        image: b.image || undefined,
        iconKind: "award",
      });
    }
  }

  return out;
}
