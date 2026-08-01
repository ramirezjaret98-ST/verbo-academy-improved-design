// Shared course/unit state — single source of truth for Admin + Student views.
// Persisted to localStorage and broadcast via a custom event so any open
// tab/route updates in real-time.
import { LEVELS as SEED_LEVELS, type Level } from "./mock-data";

export const COURSES_KEY = "verbo:levels";
export const COURSES_EVENT = "verbo:levels-updated";

export function loadLevels(): Level[] {
  if (typeof window === "undefined") return SEED_LEVELS;
  try {
    const raw = localStorage.getItem(COURSES_KEY);
    if (raw) return JSON.parse(raw) as Level[];
  } catch { /* noop */ }
  // Initialize storage with seed on first read so admin + student share it.
  try { localStorage.setItem(COURSES_KEY, JSON.stringify(SEED_LEVELS)); } catch { /* noop */ }
  return SEED_LEVELS;
}

export function persistLevels(levels: Level[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COURSES_KEY, JSON.stringify(levels));
    window.dispatchEvent(new CustomEvent(COURSES_EVENT));
  } catch { /* noop */ }
}

/** Subscribe to course updates from this tab or other tabs. Returns unsubscribe. */
export function subscribeLevels(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === COURSES_KEY) cb(); };
  window.addEventListener(COURSES_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(COURSES_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
