// Holidays reference list.
//
// Admin-managed collection of official holiday dates. NOTHING in the system
// blocks or auto-cancels based on this list — it exists purely as a reference
// for Admin so that when a teacher retro-annotates a Session Report with
// "Cancelled Holiday" (or a student justifies with the same), the Admin has
// a canonical date list to cross-check.
//
// Backed by Supabase (`public.holidays`). Reads are served from an in-memory
// cache kept in sync via Postgres Realtime, so `loadHolidays()`/`useHolidays()`
// stay synchronous for existing call sites. Writes (`addHoliday`/
// `removeHoliday`) talk to Supabase directly and are therefore async.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export interface Holiday {
  id: string;
  /** ISO date only, YYYY-MM-DD. */
  date: string;
  label: string;
  created_at: string;
}

export const HOLIDAYS_EVENT = "verbo:holidays-updated";

type HolidayRow = Database["public"]["Tables"]["holidays"]["Row"];

function fromRow(row: HolidayRow): Holiday {
  return {
    id: String(row.id),
    date: row.date,
    label: row.label,
    created_at: row.created_at,
  };
}

function sorted(list: Holiday[]): Holiday[] {
  return list.slice().sort((a, b) => a.date.localeCompare(b.date));
}

let cache: Holiday[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  cache = sorted(cache);
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HOLIDAYS_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase.from("holidays").select("*");
    if (error) {
      console.error("[holidays-store] failed to load holidays", error);
      hydratePromise = null;
      return;
    }
    cache = (data ?? []).map(fromRow);
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
    .channel("holidays-store-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "holidays" },
      () => {
        hydrated = false;
        hydratePromise = null;
        void hydrate();
      },
    )
    .subscribe();
}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly so plain (non-hook) readers like
  // `loadHolidays()` have data available as soon as possible, without
  // requiring a component to mount `useHolidays()` first.
  void hydrate();
  ensureRealtime();
}

/** Synchronous snapshot of the current in-memory cache. May be empty
 * (or stale) until the initial Supabase fetch resolves. */
export function loadHolidays(): Holiday[] {
  return cache;
}

function getSnapshot(): Holiday[] {
  return cache;
}

export async function addHoliday(input: { date: string; label: string }): Promise<Holiday> {
  const { data, error } = await supabase
    .from("holidays")
    .insert({ date: input.date, label: input.label.trim() || "Holiday" })
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error("Failed to add holiday");
  }
  const holiday = fromRow(data);
  cache = [...cache, holiday];
  notify();
  return holiday;
}

export async function removeHoliday(id: string): Promise<void> {
  const numericId = Number(id);
  const { error } = await supabase.from("holidays").delete().eq("id", numericId);
  if (error) {
    throw error;
  }
  cache = cache.filter((h) => h.id !== id);
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

export function useHolidays(): Holiday[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => []);
}
