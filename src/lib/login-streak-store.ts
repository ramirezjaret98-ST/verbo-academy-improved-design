// Login streak store — tracks consecutive calendar days (local browser time)
// that a student has opened Verbo Academy. Read by profile-badges-store.ts
// to feed the `loginStreakDays` badge metric.
//
// Backed by Supabase (`public.login_streaks`, one row per student).
// Self-scoped only (every call site passes the CURRENT student's own id —
// there's no "view another student's streak" surface), so reads are served
// from a lazily-hydrated per-student in-memory cache: `currentLoginStreak()`
// stays synchronous for existing call sites, kicking off a background fetch
// the first time it's asked about a given student. `touchLoginStreak()`
// talks to Supabase directly and is therefore async (its single call site
// already discarded the return value, so this is a non-breaking change).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { legacyToUuid } from "@/lib/user-id-bridge";

export interface LoginStreakRecord {
  /** YYYY-MM-DD (local calendar date) of the last day the student opened the app. */
  lastActiveDate: string;
  currentStreak: number;
}

export const LOGIN_STREAK_EVENT = "verbo:login-streak-updated";

type LoginStreakRow = Database["public"]["Tables"]["login_streaks"]["Row"];

function fromRow(row: LoginStreakRow): LoginStreakRecord {
  return { lastActiveDate: row.last_active_date, currentStreak: row.current_streak };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const cache = new Map<string, LoginStreakRecord>(); // legacy studentId -> record
const hydratedFor = new Set<string>();
const hydratingFor = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOGIN_STREAK_EVENT));
  }
}

async function hydrateFor(studentId: string): Promise<void> {
  if (!studentId || hydratedFor.has(studentId)) return;
  const existing = hydratingFor.get(studentId);
  if (existing) return existing;
  const promise = (async () => {
    const uuid = await legacyToUuid(studentId);
    if (!uuid) {
      hydratedFor.add(studentId);
      return;
    }
    const { data, error } = await supabase
      .from("login_streaks")
      .select("*")
      .eq("student_id", uuid)
      .maybeSingle();
    if (error) {
      console.error("[login-streak-store] failed to load streak", error);
      hydratedFor.add(studentId);
      return;
    }
    if (data) cache.set(studentId, fromRow(data));
    hydratedFor.add(studentId);
  })();
  hydratingFor.set(studentId, promise);
  try {
    await promise;
  } finally {
    hydratingFor.delete(studentId);
  }
}

/** Read-only streak for a student (never mutates). Returns 0 when unknown
 *  or not yet hydrated — kicks off a background fetch and notifies
 *  listeners once it resolves. */
export function currentLoginStreak(studentId: string): number {
  if (!studentId) return 0;
  if (!hydratedFor.has(studentId)) void hydrateFor(studentId).then(notify);
  return cache.get(studentId)?.currentStreak ?? 0;
}

/**
 * Registers today's visit for a student and persists the updated streak.
 * Call ONCE per app session (per local calendar day):
 * - lastActiveDate === yesterday → streak + 1
 * - lastActiveDate === today     → unchanged
 * - anything older / missing     → streak reset to 1
 */
export async function touchLoginStreak(studentId: string): Promise<number> {
  if (!studentId) return 0;
  await hydrateFor(studentId);
  const now = new Date();
  const today = toISODate(now);
  const yesterday = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  const prev = cache.get(studentId);
  if (prev && prev.lastActiveDate === today) return prev.currentStreak;

  const nextStreak = prev && prev.lastActiveDate === yesterday ? (prev.currentStreak ?? 0) + 1 : 1;

  const uuid = await legacyToUuid(studentId);
  if (!uuid) return nextStreak;

  const { data, error } = await supabase
    .from("login_streaks")
    .upsert({ student_id: uuid, last_active_date: today, current_streak: nextStreak }, { onConflict: "student_id" })
    .select()
    .single();
  if (error || !data) {
    console.error("[login-streak-store] failed to save streak", error);
    return nextStreak;
  }
  cache.set(studentId, fromRow(data));
  notify();
  return nextStreak;
}

/** Not currently consumed anywhere (kept for API parity with the
 *  localStorage version, in case a future surface needs to react live). */
export function subscribeLoginStreak(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
