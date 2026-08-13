// Tracks which Verbot guided tours a student has already seen, so the
// dashboard welcome tour fires exactly once and each page's help nudge
// speech-bubble only auto-opens the first time. localStorage only, same
// pattern as unit-unlock-seen-store.ts / badge-unlock-seen-store.ts.

export const TOUR_SEEN_PREFIX = "verbo:tour-seen:";

function keyFor(studentId: string) {
  return `${TOUR_SEEN_PREFIX}${studentId}`;
}

export function loadSeenTours(studentId: string): string[] {
  if (typeof window === "undefined" || !studentId) return [];
  try {
    const raw = localStorage.getItem(keyFor(studentId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch { /* noop */ }
  return [];
}

export function hasSeenTour(studentId: string, tourId: string): boolean {
  return loadSeenTours(studentId).includes(tourId);
}

/** Marks the tour/nudge as seen. Returns true when this call was the first time. */
export function markTourSeen(studentId: string, tourId: string): boolean {
  if (typeof window === "undefined" || !studentId || !tourId) return false;
  const seen = loadSeenTours(studentId);
  if (seen.includes(tourId)) return false;
  try {
    localStorage.setItem(keyFor(studentId), JSON.stringify([...seen, tourId]));
  } catch { /* noop */ }
  return true;
}
