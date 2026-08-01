// Per-student "equipped" CHALLENGE badges — the up-to-three Challenge Badges
// (src/lib/badges-store.ts) the student chose to showcase. Same
// load/persist/subscribe pattern as equipped-profile-badges-store.ts, but with
// its own namespace: both catalogs reuse ids ("first", "explorer", "master"),
// so the two stores must never share storage.

const KEY = "verbo:equipped-challenge-badges";
const EVT = "verbo:equipped-challenge-badges-updated";

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

export function loadEquippedChallengeBadgeIds(studentId: string): string[] {
  const arr = read()[studentId];
  return Array.isArray(arr) ? arr.slice(0, EQUIPPED_MAX) : [];
}

export function setEquippedChallengeBadgeIds(studentId: string, ids: string[]): void {
  const clean = Array.from(new Set(ids.filter((s) => typeof s === "string"))).slice(0, EQUIPPED_MAX);
  const m = read();
  m[studentId] = clean;
  write(m);
}

export function subscribeEquippedChallengeBadges(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
