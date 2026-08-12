// Challenge Badges catalog — admin-editable list of the badges shown in
// Student > Challenges.
//
// Scope: this store owns ONLY the 8 core Challenge badges. It does NOT
// include the "Lightning Bolt" badge (Verbo Flash-only, rendered separately
// in student.challenges.tsx) nor the dynamic Season badges (owned by
// flash-challenges-store.ts).
//
// Backed by Supabase (`public.badge_defs`, filtered to `system = 'challenge'`
// — that table is shared with Profile Badges, distinguished by that column).
// Reads are served from an in-memory cache kept in sync via Postgres
// Realtime, so `loadBadges()`/`useBadges()` stay synchronous for existing
// call sites. Writes (`addBadge`/`updateBadge`/`deleteBadge`) talk to
// Supabase directly and are therefore async.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";

export type BadgeMetric =
  | "completedCount"
  | "longestStreak"
  | "distinctCategories"
  | "hasCompletedPremium";

export const BADGE_METRIC_META: Record<
  BadgeMetric,
  { label: string; numeric: boolean; hint: string }
> = {
  completedCount: {
    label: "Total challenges completed",
    numeric: true,
    hint: "Number of challenges the student has completed in total.",
  },
  longestStreak: {
    label: "Longest streak",
    numeric: true,
    hint: "Longest run of challenges completed in a row.",
  },
  distinctCategories: {
    label: "Distinct categories completed",
    numeric: true,
    hint: "Number of different challenge categories the student has completed.",
  },
  hasCompletedPremium: {
    label: "Completed a Premium challenge",
    numeric: false,
    hint: "On/off — awarded when the student completes any Premium challenge.",
  },
};

export interface BadgeRule {
  metric: BadgeMetric;
  /** Required for numeric metrics; ignored for boolean metrics. */
  threshold?: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  /** Data URL of the badge image (GIF/PNG/JPG/WebP). Empty string = not yet configured. */
  image: string;
  rule: BadgeRule;
}

export interface BadgeContext {
  completedCount: number;
  longestStreak: number;
  distinctCategories: number;
  hasCompletedPremium: boolean;
}

export function isBadgeEarned(badge: BadgeDef, ctx: BadgeContext): boolean {
  const { metric, threshold } = badge.rule;
  if (metric === "hasCompletedPremium") return ctx.hasCompletedPremium;
  const value = ctx[metric] as number;
  const t = typeof threshold === "number" ? threshold : 1;
  return value >= t;
}

/** Pure helper: pick a fresh `badge-N` id that isn't already taken. Used by
 *  the admin modal to preview/assign an id for a brand-new badge before it's
 *  saved — the actual insert uses this as `code`. */
export function newBadgeId(existing: BadgeDef[]): string {
  const taken = new Set(existing.map((b) => b.id));
  let i = existing.length + 1;
  while (taken.has(`badge-${i}`)) i++;
  return `badge-${i}`;
}

/* ---------------- Supabase-backed store ---------------- */

export const BADGES_EVENT = "verbo:challenge-badges-updated";

type BadgeRow = Database["public"]["Tables"]["badge_defs"]["Row"];

function fromRow(row: BadgeRow): BadgeDef {
  const metric = row.metric as BadgeMetric;
  return {
    id: row.code,
    name: row.name,
    description: row.description ?? "",
    image: row.image_url ?? "",
    rule:
      metric === "hasCompletedPremium"
        ? { metric }
        : { metric, threshold: row.threshold != null ? Number(row.threshold) : undefined },
  };
}

let cache: BadgeDef[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(BADGES_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase
      .from("badge_defs")
      .select("*")
      .eq("system", "challenge")
      .order("id");
    if (error) {
      console.error("[badges-store] failed to load challenge badges", error);
      hydratePromise = null;
      return;
    }
    cache = (data ?? []).map(fromRow);
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate();
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("badge-defs-challenge-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "badge_defs" },
      () => {
        hydrated = false;
        hydratePromise = null;
        void hydrate();
      },
    )
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly so plain (non-hook) readers like
  // `loadBadges()` have data available as soon as possible, without
  // requiring a component to mount `useBadges()` first.
  void hydrate();
  ensureRealtime();
}

/** Synchronous snapshot of the current in-memory cache. May be empty
 * (or stale) until the initial Supabase fetch resolves. */
export function loadBadges(): BadgeDef[] {
  return cache;
}

function getSnapshot(): BadgeDef[] {
  return cache;
}

export async function addBadge(badge: BadgeDef): Promise<BadgeDef> {
  const { data, error } = await supabase
    .from("badge_defs")
    .insert({
      system: "challenge",
      code: badge.id,
      name: badge.name,
      description: badge.description,
      image_url: badge.image,
      metric: badge.rule.metric,
      threshold: badge.rule.threshold ?? null,
    })
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error("Failed to add badge");
  }
  const created = fromRow(data);
  cache = [...cache, created];
  notify();
  return created;
}

export async function updateBadge(badge: BadgeDef): Promise<BadgeDef> {
  const { data, error } = await supabase
    .from("badge_defs")
    .update({
      name: badge.name,
      description: badge.description,
      image_url: badge.image,
      metric: badge.rule.metric,
      threshold: badge.rule.threshold ?? null,
    })
    .eq("system", "challenge")
    .eq("code", badge.id)
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error("Failed to update badge");
  }
  const updated = fromRow(data);
  cache = cache.map((b) => (b.id === updated.id ? updated : b));
  notify();
  return updated;
}

export async function deleteBadge(id: string): Promise<void> {
  const { error } = await supabase
    .from("badge_defs")
    .delete()
    .eq("system", "challenge")
    .eq("code", id);
  if (error) {
    throw error;
  }
  cache = cache.filter((b) => b.id !== id);
  notify();
}

export function subscribeBadges(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

export function useBadges(): BadgeDef[] {
  return useSyncExternalStore(subscribeBadges, getSnapshot, () => []);
}
