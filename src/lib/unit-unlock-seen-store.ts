// Tracks which units a student has already seen "unlock" (become current) so the
// unlock flip animation in the Learning Path plays exactly once per unit.
// localStorage only, same pattern as the other stores.

export const UNIT_UNLOCK_SEEN_PREFIX = "verbo:unit-unlock-seen:";

function keyFor(studentId: string) {
  return `${UNIT_UNLOCK_SEEN_PREFIX}${studentId}`;
}

export function loadUnlockSeen(studentId: string): string[] {
  if (typeof window === "undefined" || !studentId) return [];
  try {
    const raw = localStorage.getItem(keyFor(studentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch { /* noop */ }
  return [];
}

export function hasSeenUnlock(studentId: string, unitId: string): boolean {
  return loadUnlockSeen(studentId).includes(unitId);
}

/** Marks the unit as seen. Returns true when this call was the first time. */
export function markUnlockSeen(studentId: string, unitId: string): boolean {
  if (typeof window === "undefined" || !studentId || !unitId) return false;
  const seen = loadUnlockSeen(studentId);
  if (seen.includes(unitId)) return false;
  try {
    localStorage.setItem(keyFor(studentId), JSON.stringify([...seen, unitId]));
  } catch { /* noop */ }
  return true;
}
