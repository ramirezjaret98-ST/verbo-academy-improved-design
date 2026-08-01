// Tracks which badges a student has already had their "unlock celebration"
// modal shown for automatically, so BadgeUnlockModal's full animation plays
// exactly once per badge. localStorage only.

export const BADGE_UNLOCK_SEEN_PREFIX = "verbo:badge-unlock-seen:";
export const BADGE_UNLOCK_SEEN_EVENT = "verbo:badge-unlock-seen-updated";


function keyFor(studentId: string) {
  return `${BADGE_UNLOCK_SEEN_PREFIX}${studentId}`;
}

export function loadBadgeUnlockSeen(studentId: string): string[] {
  if (typeof window === "undefined" || !studentId) return [];
  try {
    const raw = localStorage.getItem(keyFor(studentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* noop */
  }
  return [];
}

export function hasSeenBadgeUnlock(studentId: string, badgeStorageId: string): boolean {
  return loadBadgeUnlockSeen(studentId).includes(badgeStorageId);
}

/** Marks the badge as seen. Returns true when this call was the first time. */
export function markBadgeUnlockSeen(studentId: string, badgeStorageId: string): boolean {
  if (typeof window === "undefined" || !studentId || !badgeStorageId) return false;
  const seen = loadBadgeUnlockSeen(studentId);
  if (seen.includes(badgeStorageId)) return false;
  try {
    localStorage.setItem(keyFor(studentId), JSON.stringify([...seen, badgeStorageId]));
    window.dispatchEvent(new CustomEvent(BADGE_UNLOCK_SEEN_EVENT));
  } catch {

    /* noop */
  }
  return true;
}
