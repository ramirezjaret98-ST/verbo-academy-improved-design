// ============================================================================
// Bonus threshold — extracted into its own module so the KPI history store can
// read it without importing teacher-kpis.ts (which itself imports the history
// store). Prevents a circular dependency.
//
// Backed by Supabase (`public.bonus_threshold_setting`, a single admin-wide
// setting row). Reads are served from an in-memory cache kept in sync via
// Postgres Realtime, so `getBonusThreshold()` stays synchronous for the many
// call sites that use it as a default parameter value (some evaluated during
// render). `setBonusThreshold()` updates the cache optimistically and
// persists in the background (admin-only per RLS — every other signed-in
// role can only SELECT this row, which is what lets teachers see their own
// bonus status against the real threshold).
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

/** No longer a real localStorage key (Supabase-backed now) — kept only
 *  because `teacher-kpis.ts` re-exports it for backward compatibility. */
export const BONUS_THRESHOLD_KEY = "verbo:bonus-threshold";
export const BONUS_THRESHOLD_DEFAULT = 85;

let cache = BONUS_THRESHOLD_DEFAULT;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase
      .from("bonus_threshold_setting")
      .select("threshold")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      console.error("[teacher-kpis-threshold] failed to load bonus threshold", error);
      hydratePromise = null;
      return;
    }
    if (data && typeof data.threshold === "number") cache = data.threshold;
    hydrated = true;
  })();
  return hydratePromise;
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("bonus-threshold-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "bonus_threshold_setting" },
      () => {
        hydrated = false;
        hydratePromise = null;
        void hydrate();
      },
    )
    .subscribe();
}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly — `getBonusThreshold()` is called
  // synchronously (often as a default parameter value), so the cache needs
  // to be warm as early as possible.
  void hydrate();
  ensureRealtime();
}

/** Synchronous snapshot of the current threshold. May briefly be the
 *  hardcoded default until the initial Supabase fetch resolves. */
export function getBonusThreshold(): number {
  return cache;
}

export function setBonusThreshold(v: number): void {
  const clamped = Math.max(0, Math.min(100, Math.round(v)));
  // Optimistic: update the cache immediately, persist in background.
  cache = clamped;
  void (async () => {
    const { error } = await supabase
      .from("bonus_threshold_setting")
      .update({ threshold: clamped })
      .eq("id", true);
    if (error) {
      console.error("[teacher-kpis-threshold] failed to save bonus threshold", error);
    }
  })();
}
