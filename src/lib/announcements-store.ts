// Announcements — created by the admin in Overview, reflected as dismissible
// banners at the top of the Student and Teacher panels.
//
// Backed by Supabase: `public.announcements` (admin-write, open SELECT) and
// `public.announcement_dismissals` (self-insert, self-or-admin SELECT — one
// row per user per dismissed announcement). Both are kept as small global
// caches hydrated once and refreshed via Postgres Realtime, matching the
// pattern used across this migration.
//
// Note: the old localStorage version tracked dismissals per-BROWSER, not
// per-user (there was no userId parameter). Since Supabase's dismissal table
// requires a real `user_id`, `dismissAnnouncement`/`announcementsForRole` now
// take the caller's (legacy) user id explicitly — this actually fixes a
// latent bug where two different app users sharing a browser would dismiss
// banners for each other.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
import type { Role } from "./mock-data";

export type Audience = "all" | "students" | "teachers";

export interface Announcement {
  id: string;
  message: string;
  audience: Audience;
  published_at: string; // ISO datetime
  expires_at?: string; // ISO date (yyyy-mm-dd); undefined = no expiration
}

export const ANNOUNCEMENT_MAX = 280;
export const ANN_EVENT = "verbo:announcements-updated";

type AnnRow = Database["public"]["Tables"]["announcements"]["Row"];

const SEED: Announcement[] = [];

let cache: Announcement[] = SEED;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

let dismissedCache = new Map<string, Set<string>>(); // legacy userId -> dismissed announcement ids
let dismissedHydrated = false;
let dismissedHydratePromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ANN_EVENT));
}

function mapRow(row: AnnRow): Announcement {
  return {
    id: String(row.id),
    message: row.message,
    audience: row.audience,
    published_at: row.published_at,
    expires_at: row.expires_at ?? undefined,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase.from("announcements").select("*");
    if (error) {
      console.error("[announcements-store] failed to load", error);
      hydrated = true;
      return;
    }
    cache = (data ?? []).map(mapRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

async function hydrateDismissals(): Promise<void> {
  if (dismissedHydrated) return;
  if (dismissedHydratePromise) return dismissedHydratePromise;
  dismissedHydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("announcement_dismissals").select("*");
    if (error) {
      console.error("[announcements-store] failed to load dismissals", error);
      dismissedHydrated = true;
      return;
    }
    const next = new Map<string, Set<string>>();
    for (const row of data ?? []) {
      const legacyId = uuidToLegacySync(row.user_id);
      const set = next.get(legacyId) ?? new Set<string>();
      set.add(String(row.announcement_id));
      next.set(legacyId, set);
    }
    dismissedCache = next;
    dismissedHydrated = true;
  })();
  await dismissedHydratePromise;
  dismissedHydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  void hydrateDismissals();
  supabase
    .channel("announcements-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
  supabase
    .channel("announcement-dismissals-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "announcement_dismissals" }, () => {
      dismissedHydrated = false;
      void hydrateDismissals();
    })
    .subscribe();
}

export function loadAnnouncements(): Announcement[] {
  if (!hydrated) void hydrate();
  return cache;
}

function notExpired(a: Announcement): boolean {
  if (!a.expires_at) return true;
  // active through the end of the expiration day
  const end = new Date(a.expires_at);
  end.setHours(23, 59, 59, 999);
  return end.getTime() >= Date.now();
}

export function activeAnnouncements(): Announcement[] {
  return loadAnnouncements()
    .filter(notExpired)
    .sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
}

export function publishAnnouncement(message: string, audience: Audience, expires_at?: string) {
  const trimmed = message.trim().slice(0, ANNOUNCEMENT_MAX);
  if (!trimmed) return;
  const tempId = `temp-${Date.now()}`;
  const item: Announcement = {
    id: tempId,
    message: trimmed,
    audience,
    published_at: new Date().toISOString(),
    expires_at: expires_at || undefined,
  };
  cache = [item, ...cache];
  notify();

  void (async () => {
    const { data, error } = await supabase
      .from("announcements")
      .insert({ message: trimmed, audience, expires_at: expires_at || null })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[announcements-store] failed to publish", error);
      cache = cache.filter((a) => a.id !== tempId);
      notify();
      return;
    }
    cache = cache.map((a) => (a.id === tempId ? mapRow(data) : a));
    notify();
  })();
}

export function endAnnouncement(id: string) {
  const prev = cache;
  cache = cache.filter((a) => a.id !== id);
  notify();
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return;
  void (async () => {
    const { error } = await supabase.from("announcements").delete().eq("id", numericId);
    if (error) {
      console.error("[announcements-store] failed to end announcement", error);
      cache = prev;
      notify();
    }
  })();
}

// ---- Per-user dismissals (banner close button) ----------------------------
function readDismissed(userId: string): Set<string> {
  if (!dismissedHydrated) void hydrateDismissals();
  return dismissedCache.get(userId) ?? new Set<string>();
}

export function dismissAnnouncement(id: string, userId: string) {
  const set = new Set(readDismissed(userId));
  set.add(id);
  dismissedCache.set(userId, set);
  notify();

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return;
  void (async () => {
    const uuid = await legacyToUuid(userId);
    if (!uuid) return;
    const { error } = await supabase
      .from("announcement_dismissals")
      .insert({ announcement_id: numericId, user_id: uuid });
    if (error) console.error("[announcements-store] failed to save dismissal", error);
  })();
}

// Active announcements targeting a role, minus those the user dismissed.
export function announcementsForRole(role: Role, userId: string): Announcement[] {
  const want: Audience = role === "student" ? "students" : "teachers";
  const dismissed = readDismissed(userId);
  return activeAnnouncements().filter(
    (a) => (a.audience === "all" || a.audience === want) && !dismissed.has(a.id),
  );
}

// ---- React bindings -------------------------------------------------------
export function useAnnouncements(): Announcement[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache,
    () => SEED,
  );
}
