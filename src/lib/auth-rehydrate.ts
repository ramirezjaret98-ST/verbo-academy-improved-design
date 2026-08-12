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
const rehydrateCallbacks = new Set<() => void>();
let lastAuthId: string | null | undefined;

export function registerRehydrate(callback: () => void): void {
  rehydrateCallbacks.add(callback);
  // Lazy-start the auth listener on first registration.
  if (!authListenerStarted && typeof window !== "undefined") {
    authListenerStarted = true;
    supabase.auth.onAuthStateChange((_event, session) => {
      const authId = session?.user?.id ?? null;
      if (authId !== lastAuthId) {
        lastAuthId = authId;
        // Call all registered rehydrate callbacks.
        rehydrateCallbacks.forEach((cb) => cb());
      }
    });
  }
}

export function unregisterRehydrate(callback: () => void): void {
  rehydrateCallbacks.delete(callback);
}
