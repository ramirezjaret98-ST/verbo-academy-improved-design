// Per-user avatar images (data URLs / URLs), shown across dashboards, peek
// cards and modals.
//
// Backed by Supabase (`app_users.avatar_url`). Reads are served from an
// in-memory cache (user legacy id -> avatar_url) populated via the
// `user_avatar_for_peek()` RPC — avatars are treated as non-sensitive public
// profile data by design (same precedent as `leaderboard_identities`), so the
// RPC returns every user's avatar with no row filter. The cache is kept in
// sync via Postgres Realtime so `useAvatar()` stays synchronous-read for the
// existing call sites. `setAvatar()` updates the cache optimistically and
// persists to `app_users` in the background (self-or-admin per the existing
// `app_users_update_self` RLS policy).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid } from "./user-id-bridge";

const EVT = "verbo:avatars-updated";

/** user legacy id -> avatar_url. Absent key = no avatar set. */
let cache = new Map<string, string>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // The RPC already returns `legacy_id` per row, so no user-id bridge
    // round-trip is needed on the read path.
    const { data, error } = await supabase.rpc("user_avatar_for_peek");
    if (error) {
      console.error("[avatar-store] failed to load avatars", error);
      hydratePromise = null;
      return;
    }
    const next = new Map<string, string>();
    for (const row of data ?? []) {
      // Skip rows with no avatar set so lookups naturally fall back to null.
      if (!row.legacy_id || !row.avatar_url) continue;
      next.set(row.legacy_id, row.avatar_url);
    }
    cache = next;
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("avatar-peek-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "app_users" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

export function setAvatar(userId: string, dataUrl: string) {
  // Optimistic: update the cache + notify immediately, persist in background.
  cache.set(userId, dataUrl);
  notify();
  void (async () => {
    const uuid = await legacyToUuid(userId);
    if (!uuid) return; // no real account on file — nothing to persist to
    const { error } = await supabase
      .from("app_users")
      .update({ avatar_url: dataUrl })
      .eq("id", uuid);
    if (error) {
      console.error("[avatar-store] failed to persist avatar", error);
    }
  })();
}

export function useAvatar(userId: string | undefined): string | null {
  const [val, setVal] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    const sync = () => setVal(cache.get(userId) ?? null);
    sync();
    window.addEventListener(EVT, sync);
    void hydrate();
    ensureRealtime();
    return () => {
      window.removeEventListener(EVT, sync);
    };
  }, [userId]);
  return val;
}
