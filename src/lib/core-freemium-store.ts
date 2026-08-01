// Core plan freemium tracker — one complimentary Insight + one Book Club +
// one Spotlight per contract for every Core student. This is fully
// independent from the monthly cap (`PLAN_DEFAULTS`, which for Core is 0):
// the freemium credit is one-shot and NEVER resets. Also persists a
// per-type "silenced" flag once the student clicks "don't show again", so
// the corresponding kind can be hidden from their surfaces from then on.
//
// Same persistence pattern as `clubs-store` / `club-bookings-store`:
// localStorage + a CustomEvent for cross-tab reactivity.
import { useSyncExternalStore } from "react";

export type FreemiumKind = "insight" | "book" | "spotlight";

export interface FreemiumState {
  /** ISO timestamp when the courtesy credit was claimed. Undefined = still available. */
  used?: Partial<Record<FreemiumKind, string>>;
  /** ISO timestamp when the student silenced the type. Undefined = still visible. */
  silenced?: Partial<Record<FreemiumKind, string>>;
}

type AllStates = Record<string, FreemiumState>; // studentId → state

const KEY = "verbo:core-freemium";
const EVENT = "verbo:core-freemium-updated";

function safeRead(): AllStates {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AllStates) : {};
  } catch { return {}; }
}
function safeWrite(all: AllStates) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    cache = null;
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

let cache: AllStates | null = null;
function snapshot(): AllStates {
  if (cache === null) cache = safeRead();
  return cache;
}

export function getFreemiumState(studentId: string): FreemiumState {
  return snapshot()[studentId] ?? {};
}

export function hasCreditUsed(studentId: string, kind: FreemiumKind): boolean {
  return Boolean(getFreemiumState(studentId).used?.[kind]);
}

export function isSilenced(studentId: string, kind: FreemiumKind): boolean {
  return Boolean(getFreemiumState(studentId).silenced?.[kind]);
}

export function markCreditUsed(studentId: string, kind: FreemiumKind) {
  const all = { ...snapshot() };
  const prev = all[studentId] ?? {};
  const used = { ...(prev.used ?? {}) };
  if (used[kind]) return; // already used — idempotent
  used[kind] = new Date().toISOString();
  all[studentId] = { ...prev, used };
  safeWrite(all);
}

export function markSilenced(studentId: string, kind: FreemiumKind) {
  const all = { ...snapshot() };
  const prev = all[studentId] ?? {};
  const silenced = { ...(prev.silenced ?? {}) };
  if (silenced[kind]) return;
  silenced[kind] = new Date().toISOString();
  all[studentId] = { ...prev, silenced };
  safeWrite(all);
}

// ---- React binding -------------------------------------------------------
function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = () => { cache = null; cb(); };
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onEvent(); };
  window.addEventListener(EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}
const SERVER: AllStates = {};
export function useFreemium(): AllStates {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}
