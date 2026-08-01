// Per-student "equipped" badges — the up-to-three badges the student chose
// to showcase on the Dashboard and inside the Profile modal. Same
// load/persist/subscribe pattern as leaderboard-identity-store.ts, entirely
// independent from the Challenge badges "equipped" concept.

const KEY = "verbo:equipped-profile-badges";
const EVT = "verbo:equipped-profile-badges-updated";

export const EQUIPPED_MAX = 3;

type Store = Record<string, string[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Store; } catch { return {}; }
}

function write(m: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch { /* noop */ }
}

export function loadEquippedBadgeIds(studentId: string): string[] {
  const arr = read()[studentId];
  return Array.isArray(arr) ? arr.slice(0, EQUIPPED_MAX) : [];
}

export function setEquippedBadgeIds(studentId: string, ids: string[]): void {
  const clean = Array.from(new Set(ids.filter((s) => typeof s === "string"))).slice(0, EQUIPPED_MAX);
  const m = read();
  m[studentId] = clean;
  write(m);
}

export function subscribeEquippedBadges(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
