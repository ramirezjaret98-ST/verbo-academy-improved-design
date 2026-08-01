// Login streak store — tracks consecutive calendar days (local browser time)
// that a student has opened Verbo Academy. Same localStorage pattern as the
// other stores. Read by profile-badges-store.ts to feed the `loginStreakDays`
// badge metric.

export interface LoginStreakRecord {
  /** YYYY-MM-DD (local calendar date) of the last day the student opened the app. */
  lastActiveDate: string;
  currentStreak: number;
}

export const LOGIN_STREAK_KEY = "verbo:login-streak";
export const LOGIN_STREAK_EVENT = "verbo:login-streak-updated";

type StreakMap = Record<string, LoginStreakRecord>;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readAll(): StreakMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOGIN_STREAK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as StreakMap;
  } catch { /* noop */ }
  return {};
}

function writeAll(map: StreakMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOGIN_STREAK_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(LOGIN_STREAK_EVENT));
  } catch { /* noop */ }
}

/**
 * Register today's visit for a student and return the updated streak.
 * Call ONCE per app session (per local calendar day):
 * - lastActiveDate === yesterday → streak + 1
 * - lastActiveDate === today     → unchanged
 * - anything older / missing     → streak reset to 1
 */
export function touchLoginStreak(studentId: string): number {
  if (typeof window === "undefined" || !studentId) return 0;
  const now = new Date();
  const today = toISODate(now);
  const yesterday = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  const all = readAll();
  const prev = all[studentId];

  if (prev && prev.lastActiveDate === today) return prev.currentStreak;

  const next: LoginStreakRecord = {
    lastActiveDate: today,
    currentStreak: prev && prev.lastActiveDate === yesterday ? (prev.currentStreak ?? 0) + 1 : 1,
  };
  all[studentId] = next;
  writeAll(all);
  return next.currentStreak;
}

/** Read-only streak for a student (never mutates). Returns 0 when unknown. */
export function currentLoginStreak(studentId: string): number {
  if (!studentId) return 0;
  const rec = readAll()[studentId];
  return rec?.currentStreak ?? 0;
}

export function subscribeLoginStreak(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === LOGIN_STREAK_KEY) cb(); };
  window.addEventListener(LOGIN_STREAK_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LOGIN_STREAK_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
