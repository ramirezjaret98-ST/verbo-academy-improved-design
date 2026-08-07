// Core plan freemium tracker — one complimentary Insight + one Book Club +
// one Spotlight per contract for every Core student. This is fully
// independent from the monthly cap (`PLAN_DEFAULTS`, which for Core is 0):
// the freemium credit is one-shot and NEVER resets. Also persists a
// per-type "silenced" flag once the student clicks "don't show again", so
// the corresponding kind can be hidden from their surfaces from then on.
//
// Backed by Supabase (`public.freemium_state`, one row per
// student/kind pair). Self-scoped only (every call site passes the CURRENT
// student's own id), so reads are served from a lazily-hydrated per-student
// in-memory cache: `getFreemiumState()`/`hasCreditUsed()`/`isSilenced()`
// stay synchronous for existing call sites. `markCreditUsed()`/
// `markSilenced()` talk to Supabase directly and are therefore async.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { legacyToUuid } from "@/lib/user-id-bridge";

export type FreemiumKind = "insight" | "book" | "spotlight";

export interface FreemiumState {
  /** ISO timestamp when the courtesy credit was claimed. Undefined = still available. */
  used?: Partial<Record<FreemiumKind, string>>;
  /** ISO timestamp when the student silenced the type. Undefined = still visible. */
  silenced?: Partial<Record<FreemiumKind, string>>;
}

export const FREEMIUM_EVENT = "verbo:core-freemium-updated";

type FreemiumRow = Database["public"]["Tables"]["freemium_state"]["Row"];

const cache = new Map<string, FreemiumState>(); // legacy studentId -> state
const hydratedFor = new Set<string>();
const hydratingFor = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const SERVER: FreemiumState = {};
let snapshotToken: FreemiumState = SERVER;

function notify() {
  // A fresh reference on every change so `useSyncExternalStore` (which only
  // re-renders when the snapshot is referentially different) actually
  // re-renders `useFreemium()` callers.
  snapshotToken = {};
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FREEMIUM_EVENT));
  }
}

function applyRows(studentId: string, rows: FreemiumRow[]) {
  const state: FreemiumState = {};
  for (const row of rows) {
    const kind = row.kind as FreemiumKind;
    if (row.used_at) state.used = { ...state.used, [kind]: row.used_at };
    if (row.silenced_at) state.silenced = { ...state.silenced, [kind]: row.silenced_at };
  }
  cache.set(studentId, state);
}

async function hydrateFor(studentId: string): Promise<void> {
  if (!studentId || hydratedFor.has(studentId)) return;
  const existing = hydratingFor.get(studentId);
  if (existing) return existing;
  const promise = (async () => {
    const uuid = await legacyToUuid(studentId);
    if (!uuid) {
      hydratedFor.add(studentId);
      return;
    }
    const { data, error } = await supabase.from("freemium_state").select("*").eq("student_id", uuid);
    if (error) {
      console.error("[core-freemium-store] failed to load freemium state", error);
      hydratedFor.add(studentId);
      return;
    }
    applyRows(studentId, data ?? []);
    hydratedFor.add(studentId);
  })();
  hydratingFor.set(studentId, promise);
  try {
    await promise;
  } finally {
    hydratingFor.delete(studentId);
  }
}

/** Synchronous snapshot for a student. May read as empty until the
 *  background fetch (kicked off here) resolves. */
export function getFreemiumState(studentId: string): FreemiumState {
  if (!studentId) return {};
  if (!hydratedFor.has(studentId)) void hydrateFor(studentId).then(notify);
  return cache.get(studentId) ?? {};
}

export function hasCreditUsed(studentId: string, kind: FreemiumKind): boolean {
  return Boolean(getFreemiumState(studentId).used?.[kind]);
}

export function isSilenced(studentId: string, kind: FreemiumKind): boolean {
  return Boolean(getFreemiumState(studentId).silenced?.[kind]);
}

export async function markCreditUsed(studentId: string, kind: FreemiumKind): Promise<void> {
  if (!studentId) return;
  await hydrateFor(studentId);
  if (hasCreditUsed(studentId, kind)) return; // already used — idempotent
  const uuid = await legacyToUuid(studentId);
  if (!uuid) return;
  const usedAt = new Date().toISOString();
  const { error } = await supabase
    .from("freemium_state")
    .upsert({ student_id: uuid, kind, used_at: usedAt }, { onConflict: "student_id,kind" });
  if (error) {
    console.error("[core-freemium-store] failed to mark credit used", error);
    return;
  }
  const state = cache.get(studentId) ?? {};
  cache.set(studentId, { ...state, used: { ...state.used, [kind]: usedAt } });
  notify();
}

export async function markSilenced(studentId: string, kind: FreemiumKind): Promise<void> {
  if (!studentId) return;
  await hydrateFor(studentId);
  if (isSilenced(studentId, kind)) return;
  const uuid = await legacyToUuid(studentId);
  if (!uuid) return;
  const silencedAt = new Date().toISOString();
  const { error } = await supabase
    .from("freemium_state")
    .upsert({ student_id: uuid, kind, silenced_at: silencedAt }, { onConflict: "student_id,kind" });
  if (error) {
    console.error("[core-freemium-store] failed to mark silenced", error);
    return;
  }
  const state = cache.get(studentId) ?? {};
  cache.set(studentId, { ...state, silenced: { ...state.silenced, [kind]: silencedAt } });
  notify();
}

// ---- React binding -------------------------------------------------------
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Not scoped to a specific student — existing callers (CoreFreemiumFlow)
 *  only use this for its side effect: re-rendering when ANY freemium row
 *  changes, then re-reading `isSilenced`/`hasCreditUsed` synchronously. */
export function useFreemium(): FreemiumState {
  return useSyncExternalStore(subscribe, () => snapshotToken, () => SERVER);
}
