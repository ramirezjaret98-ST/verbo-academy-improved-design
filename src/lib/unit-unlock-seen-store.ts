// Tracks which units a student has already seen "unlock" (become current) so
// the unlock flip animation in the Learning Path plays exactly once per
// unit, per student.
//
// Backed by Supabase (`public.unit_unlock_seen`, one row per
// student/unit pair). Reads are served from a per-student in-memory cache
// (there's no global list to hydrate eagerly — each student's rows are
// fetched lazily, on first check for that student), so `loadUnlockSeen()`/
// `hasSeenUnlock()` stay synchronous for existing call sites as long as
// `hydrateUnlockSeen(studentId)` (or a prior `markUnlockSeen` for that
// student) has resolved at least once. `markUnlockSeen()` talks to Supabase
// directly and is therefore async.
//
// RLS note: `unit_unlock_seen_select`/writes only allow the student
// themselves or an admin. A teacher browsing a student's read-only course
// page can't read or write that student's rows — same effective behavior as
// the old localStorage version, where a teacher's own browser never had
// another student's local flag either (each viewer's storage was already
// independent). `markUnlockSeen` swallows that failure so the flip animation
// still plays locally for that page view; it just won't persist as "seen"
// across future visits by someone who isn't the student or an admin.
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid } from "@/lib/user-id-bridge";

const cache = new Map<string, Set<string>>(); // legacy studentId -> seen unit ids
const hydratedFor = new Set<string>();
const hydratingFor = new Map<string, Promise<void>>();

async function hydrateFor(studentId: string): Promise<void> {
  if (!studentId || hydratedFor.has(studentId)) return;
  const existing = hydratingFor.get(studentId);
  if (existing) return existing;
  const promise = (async () => {
    const uuid = await legacyToUuid(studentId);
    if (!uuid) {
      cache.set(studentId, new Set());
      hydratedFor.add(studentId);
      return;
    }
    const { data, error } = await supabase
      .from("unit_unlock_seen")
      .select("unit_id")
      .eq("student_id", uuid);
    if (error) {
      // Expected (not a real error) for a viewer who is neither the student
      // nor an admin — RLS just returns nothing. Treat as "nothing seen yet"
      // for this view, same as the old per-browser localStorage behavior.
      cache.set(studentId, new Set());
      hydratedFor.add(studentId);
      return;
    }
    cache.set(studentId, new Set((data ?? []).map((r) => r.unit_id)));
    hydratedFor.add(studentId);
  })();
  hydratingFor.set(studentId, promise);
  try {
    await promise;
  } finally {
    hydratingFor.delete(studentId);
  }
}

/** Awaits the initial fetch for this student so a subsequent
 *  `hasSeenUnlock`/`loadUnlockSeen` call reflects real DB state instead of a
 *  "not loaded yet" false negative. Safe to call redundantly. */
export function hydrateUnlockSeen(studentId: string): Promise<void> {
  return hydrateFor(studentId);
}

/** Synchronous snapshot for this student. May read as empty until
 *  `hydrateUnlockSeen(studentId)` (kicked off automatically here, but not
 *  awaited) resolves at least once. */
export function loadUnlockSeen(studentId: string): string[] {
  if (!studentId) return [];
  if (!hydratedFor.has(studentId)) void hydrateFor(studentId);
  return Array.from(cache.get(studentId) ?? []);
}

export function hasSeenUnlock(studentId: string, unitId: string): boolean {
  return loadUnlockSeen(studentId).includes(unitId);
}

/** Marks the unit as seen. Returns true when this call was the first time.
 *  Awaits hydration for this student first, so the answer reflects real DB
 *  state rather than a cold, empty cache. */
export async function markUnlockSeen(studentId: string, unitId: string): Promise<boolean> {
  if (!studentId || !unitId) return false;
  await hydrateFor(studentId);
  const seen = cache.get(studentId) ?? new Set<string>();
  if (seen.has(unitId)) return false;
  seen.add(unitId);
  cache.set(studentId, seen);
  try {
    const uuid = await legacyToUuid(studentId);
    if (uuid) {
      const { error } = await supabase
        .from("unit_unlock_seen")
        .insert({ student_id: uuid, unit_id: unitId });
      if (error) {
        console.error("[unit-unlock-seen-store] failed to persist unlock-seen flag", error);
      }
    }
  } catch (err) {
    console.error("[unit-unlock-seen-store] failed to persist unlock-seen flag", err);
  }
  return true;
}
