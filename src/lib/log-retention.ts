// ============================================================================
// Log retention — single configurable period (months) applied to the two logs
// that grow unbounded: KPI overrides and the Payments log.
//
// Backed by Supabase (`public.log_retention_config`, a singleton settings
// row — `id` is a fixed boolean primary key (`true`), `months` the only real
// column). Reads are served from an in-memory cache kept in sync via
// Postgres Realtime, so `getRetentionMonths()` stays synchronous for
// existing call sites. `setRetentionMonths()` talks to Supabase directly and
// is therefore async.
//
// RLS note: reading requires `is_admin()`; writing requires
// `is_super_admin()` specifically — a coordinator (ops/fin) admin can view
// this page but a save attempt will fail. That matches the reviewed
// schema/RLS checklist (retention policy is a super-admin-only setting).
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

export const LOG_RETENTION_DEFAULT = 12;
export const LOG_RETENTION_EVENT = "verbo:log-retention-updated";

let cache = LOG_RETENTION_DEFAULT;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOG_RETENTION_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase
      .from("log_retention_config")
      .select("months")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      console.error("[log-retention] failed to load retention config", error);
      hydratePromise = null;
      return;
    }
    cache = data?.months ?? LOG_RETENTION_DEFAULT;
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
    .channel("log-retention-config-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "log_retention_config" },
      () => {
        hydrated = false;
        hydratePromise = null;
        void hydrate();
      },
    )
    .subscribe();
}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

/** Synchronous snapshot; reads as `LOG_RETENTION_DEFAULT` until the initial
 *  Supabase fetch resolves. */
export function getRetentionMonths(): number {
  return cache;
}

export async function setRetentionMonths(v: number): Promise<void> {
  const n = Math.max(1, Math.min(120, Math.round(v)));
  const { error } = await supabase
    .from("log_retention_config")
    .upsert({ id: true, months: n }, { onConflict: "id" });
  if (error) {
    console.error("[log-retention] failed to save retention months", error);
    throw error;
  }
  cache = n;
  notify();
}

export function subscribeLogRetention(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

/** Cutoff timestamp (ms). Entries with date < cutoff are considered old. */
export function retentionCutoffMs(months = getRetentionMonths()): number {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

export function downloadJson(filename: string, data: unknown) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
