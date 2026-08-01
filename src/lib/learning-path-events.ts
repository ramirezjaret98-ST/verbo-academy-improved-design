// Lightweight per-student achievement timeline for the student Learning Path.
// Stored in localStorage; broadcast via a custom event so open tabs update.

export type LearningPathEventKind =
  | "unit_unlocked"
  | "unit_completed"
  | "level_completed";

export interface LearningPathEvent {
  ts: string; // ISO
  kind: LearningPathEventKind;
  ref: string; // level name or unit id
  label?: string; // pre-computed display label
}

const KEY = "verbo:learning-path-events";
export const EVENT = "verbo:learning-path-events-updated";

type Store = Record<string, LearningPathEvent[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as Store; } catch { return {}; }
}
function write(s: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

export function loadEvents(studentId: string): LearningPathEvent[] {
  return read()[studentId] ?? [];
}

export function pushEvent(studentId: string, ev: Omit<LearningPathEvent, "ts"> & { ts?: string }) {
  const s = read();
  const list = s[studentId] ?? [];
  // Deduplicate identical (kind, ref) entries within the last minute.
  const now = ev.ts ?? new Date().toISOString();
  const dupe = list.find(
    (e) => e.kind === ev.kind && e.ref === ev.ref && Math.abs(+new Date(e.ts) - +new Date(now)) < 60_000,
  );
  if (dupe) return;
  list.unshift({ ...ev, ts: now });
  s[studentId] = list.slice(0, 100);
  write(s);
}

export function subscribeEvents(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
