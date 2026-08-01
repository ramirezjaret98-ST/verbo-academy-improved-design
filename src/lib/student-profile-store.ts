// ============================================================================
// Student profile store — editable presentation data for students
// (headline phrase + personality tags picked from a fixed catalog).
//
// Mirrors the shape of staff-profile-store.ts (read/write/subscribe over
// localStorage + a hook), but uses its own storage key and its own rules:
// personality tags come from a closed catalog and are capped.
// ============================================================================
import { useEffect, useState } from "react";

const KEY = "verbo:student-profiles";
const EVT = "verbo:student-profiles-updated";

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

type Store = Record<string, StudentProfile>;

const EMPTY: StudentProfile = { headline: "", personalityTags: [] };

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

export function loadStudentProfile(userId: string | undefined): StudentProfile {
  if (!userId) return EMPTY;
  const p = read()[userId];
  return {
    headline: p?.headline ?? "",
    personalityTags: Array.isArray(p?.personalityTags) ? p.personalityTags : [],
  };
}

/** Persists the profile after trimming/validating. Returns the stored value. */
export function saveStudentProfile(userId: string, patch: Partial<StudentProfile>): StudentProfile {
  const cur = loadStudentProfile(userId);
  const allowed = new Set<string>(PERSONALITY_TAG_OPTIONS);
  const next: StudentProfile = {
    headline: (patch.headline ?? cur.headline).slice(0, MAX_HEADLINE_CHARS),
    personalityTags: (patch.personalityTags ?? cur.personalityTags)
      .filter((t, i, arr) => allowed.has(t) && arr.indexOf(t) === i)
      .slice(-MAX_PERSONALITY_TAGS),
  };
  const m = read();
  m[userId] = next;
  write(m);
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
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVT, fn);
    window.removeEventListener("storage", fn);
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
