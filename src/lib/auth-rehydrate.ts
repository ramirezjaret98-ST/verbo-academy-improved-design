/**
 * Shared auth-aware rehydration helper — registers a callback to re-hydrate
 * a store's cache whenever the authenticated user changes (login/logout/tab switch).
 *
 * Problem: stores hydrate eagerly on module load with `void hydrate()`, but that
 * call can execute BEFORE Supabase has restored the auth session from localStorage.
 * If hydrate() runs with role=anon (session not ready yet), RLS returns 0 rows,
 * the cache stays empty, and nothing re-tries until a Realtime event for that
 * table arrives — which may never happen. F5 "fixes" it by reloading the module
 * AFTER localStorage restoration is complete.
 *
 * Solution: each store calls `registerRehydrate(invalidateAndRehydrate)` once to
 * subscribe to auth changes. When the authenticated user ID changes, we call the
 * callback — which sets `hydrated = false` + calls `hydrate()` again with the
 * correct role/permissions. One global listener, many callbacks.
 *
 * Stores already guard with `onAuthStateChange` directly (activities-store.ts)
 * do NOT need this — they can keep their inline listener. New stores should call
 * this once per module.
 */

import { supabase } from "@/integrations/supabase/client";

let authListenerStarted = false;
type RefreshReason = "auth" | "refresh";
const rehydrateCallbacks = new Set<(reason?: RefreshReason) => void>();
const criticalCallbacks = new Set<(reason?: RefreshReason) => void>();
let lastAuthId: string | null | undefined;
let lastForegroundRefresh = 0;

function refreshCallbacks(callbacks: Set<(reason?: RefreshReason) => void>, reason: RefreshReason) {
  // Supabase auth callbacks must return before stores call authenticated APIs.
  setTimeout(() => callbacks.forEach(callback => {
    try { callback(reason); } catch (error) { console.error("[store-refresh] refresh failed", error); }
  }), 0);
}

export function registerRehydrate(callback: (reason?: RefreshReason) => void, options?: { critical?: boolean }): void {
  rehydrateCallbacks.add(callback);
  if (options?.critical) criticalCallbacks.add(callback);
  // Lazy-start the auth listener on first registration.
  if (!authListenerStarted && typeof window !== "undefined") {
    authListenerStarted = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      const authId = session?.user?.id ?? null;
      if (authId !== lastAuthId) {
        lastAuthId = authId;
        // Call all registered rehydrate callbacks.
        refreshCallbacks(rehydrateCallbacks, "auth");
      }
    });
    const foregroundRefresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || !lastAuthId) return;
      if (Date.now() - lastForegroundRefresh < 15_000) return;
      lastForegroundRefresh = Date.now();
      refreshCallbacks(rehydrateCallbacks, "refresh");
    };
    window.addEventListener("focus", foregroundRefresh);
    window.addEventListener("online", foregroundRefresh);
    document.addEventListener("visibilitychange", foregroundRefresh);
    // Realtime is the fast path. A bounded fallback protects the calendar
    // when a websocket disconnects or an event is missed, without polling all stores.
    setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && lastAuthId) {
        refreshCallbacks(criticalCallbacks, "refresh");
      }
    }, 60_000);
  }
}

export function unregisterRehydrate(callback: () => void): void {
  rehydrateCallbacks.delete(callback);
  criticalCallbacks.delete(callback);
}
