// Manual badge overrides — an append-only event log (same pattern as the unit
// access override log in activities-store.ts). Admins can grant a badge that a
// student hasn't earned by rule, or return it to automatic evaluation.
// The most recent event for a (studentId, badgeId, system) triple wins.

export type BadgeSystem = "profile" | "challenge";
export type BadgeOverrideAction = "granted" | "revoked";

export interface BadgeOverrideEvent {
  id: string;
  studentId: string;
  badgeId: string;
  system: BadgeSystem;
  action: BadgeOverrideAction;
  actorId: string;
  actorRole: "admin";
  at: string;
}

export const BADGE_OVERRIDE_LOG_KEY = "verbo:badge-override-log";
export const BADGE_OVERRIDE_EVENT = "verbo:badge-override-updated";

export function loadBadgeOverrideLog(): BadgeOverrideEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BADGE_OVERRIDE_LOG_KEY);
    if (raw) return JSON.parse(raw) as BadgeOverrideEvent[];
  } catch { /* noop */ }
  return [];
}

export function setBadgeOverride(
  studentId: string,
  badgeId: string,
  system: BadgeSystem,
  action: BadgeOverrideAction,
  actorId: string,
): void {
  if (typeof window === "undefined") return;
  const log = loadBadgeOverrideLog();
  log.push({
    id: `bo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    studentId, badgeId, system, action, actorId, actorRole: "admin",
    at: new Date().toISOString(),
  });
  try {
    localStorage.setItem(BADGE_OVERRIDE_LOG_KEY, JSON.stringify(log));
    window.dispatchEvent(new CustomEvent(BADGE_OVERRIDE_EVENT));
  } catch { /* noop */ }
}

export function getBadgeOverride(
  studentId: string,
  badgeId: string,
  system: BadgeSystem,
): BadgeOverrideAction | null {
  const log = loadBadgeOverrideLog();
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.studentId === studentId && e.badgeId === badgeId && e.system === system) return e.action;
  }
  return null;
}

export function isBadgeManuallyGranted(
  studentId: string,
  badgeId: string,
  system: BadgeSystem,
): boolean {
  return getBadgeOverride(studentId, badgeId, system) === "granted";
}

export function subscribeBadgeOverrides(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === BADGE_OVERRIDE_LOG_KEY) cb(); };
  window.addEventListener(BADGE_OVERRIDE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(BADGE_OVERRIDE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
