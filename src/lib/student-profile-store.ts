// ============================================================================
// Student profile store — editable presentation data for students
// (headline phrase + personality tags picked from a fixed catalog).
//
// Backed by Supabase (`public.student_profiles`, keyed by user_id). RLS is
// open SELECT / self-or-admin write, so we keep a single global cache
// hydrated once and refreshed via Postgres Realtime — mirrors
// `staff-profile-store.ts`. Writes stay synchronous-looking (optimistic
// update, background persist) so existing call sites don't need to change.
// ============================================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export const EVT = "verbo:student-profiles-updated";

export const MAX_HEADLINE_CHARS = 200;
export const MAX_PERSONALITY_TAGS = 5;

/** Fixed catalog of personality adjectives a student can toggle. */
export const PERSONALITY_TAG_OPTIONS = [
  "Cheerful",
  "Talkative",
  "Curious",
  "Creative",
  "Energetic",
  "Friendly",
  "Funny",
  "Adventurous",
  "Calm",
  "Thoughtful",
  "Patient",
  "Focused",
  "Observant",
  "Independent",
  "Reserved",
  "Practical",
  "Confident",
  "Easygoing",
] as const;

export interface StudentProfile {
  /** Short presentation phrase (<= MAX_HEADLINE_CHARS). */
  headline: string;
  /** Active personality tags, all from PERSONALITY_TAG_OPTIONS. */
  personalityTags: string[];
}

type Row = Database["public"]["Tables"]["student_profiles"]["Row"];

const EMPTY: StudentProfile = { headline: "", personalityTags: [] };

let cache = new Map<string, StudentProfile>(); // legacy userId -> profile
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT));
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("student_profiles").select("*");
    if (error) {
      console.error("[student-profile-store] failed to load", error);
      hydrated = true;
      return;
    }
    const next = new Map<string, StudentProfile>();
    for (const row of (data ?? []) as Row[]) {
      next.set(uuidToLegacySync(row.user_id), {
        headline: row.headline ?? "",
        personalityTags: row.personality_tags ?? [],
      });
    }
    cache = next;
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("student-profiles-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "student_profiles" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

export function loadStudentProfile(userId: string | undefined): StudentProfile {
  if (!userId) return EMPTY;
  if (!hydrated) void hydrate();
  return cache.get(userId) ?? EMPTY;
}

/** Persists the profile after trimming/validating. Returns the stored value
 *  immediately (optimistic) — the Supabase write happens in the background. */
export function saveStudentProfile(userId: string, patch: Partial<StudentProfile>): StudentProfile {
  const cur = loadStudentProfile(userId);
  const allowed = new Set<string>(PERSONALITY_TAG_OPTIONS);
  const next: StudentProfile = {
    headline: (patch.headline ?? cur.headline).slice(0, MAX_HEADLINE_CHARS),
    personalityTags: (patch.personalityTags ?? cur.personalityTags)
      .filter((t, i, arr) => allowed.has(t) && arr.indexOf(t) === i)
      .slice(-MAX_PERSONALITY_TAGS),
  };
  cache.set(userId, next);
  notify();
  void (async () => {
    const uuid = await legacyToUuid(userId);
    if (!uuid) return;
    const { error } = await supabase
      .from("student_profiles")
      .upsert({ user_id: uuid, headline: next.headline, personality_tags: next.personalityTags }, { onConflict: "user_id" });
    if (error) console.error("[student-profile-store] failed to save", error);
  })();
  return next;
}

/**
 * Toggles one catalog tag. When the cap is reached, activating a new tag
 * replaces the oldest active one.
 */
export function togglePersonalityTag(userId: string, tag: string): StudentProfile {
  const cur = loadStudentProfile(userId);
  const active = cur.personalityTags.includes(tag);
  const next = active
    ? cur.personalityTags.filter((t) => t !== tag)
    : [...cur.personalityTags, tag].slice(-MAX_PERSONALITY_TAGS);
  return saveStudentProfile(userId, { personalityTags: next });
}

export function subscribeStudentProfiles(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useStudentProfile(userId: string | undefined): StudentProfile {
  const [val, setVal] = useState<StudentProfile>(EMPTY);
  useEffect(() => {
    if (!userId) return;
    const sync = () => setVal(loadStudentProfile(userId));
    sync();
    return subscribeStudentProfiles(sync);
  }, [userId]);
  return val;
}
