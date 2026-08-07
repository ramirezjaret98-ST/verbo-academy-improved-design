// ============================================================================
// Staff profile store — editable presentation data for teachers and admins
// (headline phrase, specializations) plus a lightweight presence heartbeat
// used to show the online/offline dot on the profile modal.
//
// Backed by Supabase: `public.staff_profiles` (headline/specializations,
// keyed by user_id) and `public.user_presence` (last_seen_at, keyed by
// user_id) — both open-SELECT / self-or-admin-write, so each is kept as a
// small global cache hydrated once and refreshed via Postgres Realtime.
// Writes stay synchronous-looking (optimistic update, background persist) so
// existing call sites don't need to change.
//
// All derived values (stats, tenure label, online state) are computed here;
// components only read and dispatch.
// ============================================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
import { USERS, type User } from "./mock-data";
import { avgRating, assignedStudents } from "./teacher-model";
import { activeTenureDays, teacherTier } from "./teacher-tiers";
import { computeCurrentProgress } from "./product-courses-store";

export const EVT = "verbo:staff-profiles-updated";

export const MAX_HEADLINE_CHARS = 200;
export const MAX_SPECIALIZATIONS = 6;
/** A user counts as online when their heartbeat is newer than this. */
export const PRESENCE_TTL_MS = 5 * 60 * 1000;

export interface StaffProfile {
  /** Short presentation phrase shown to students (<= MAX_HEADLINE_CHARS). */
  headline: string;
  /** Free-form tags: "Business English", "IELTS", ... */
  specializations: string[];
}

type ProfileRow = Database["public"]["Tables"]["staff_profiles"]["Row"];
type PresenceRow = Database["public"]["Tables"]["user_presence"]["Row"];

const EMPTY: StaffProfile = { headline: "", specializations: [] };

let profileCache = new Map<string, StaffProfile>(); // legacy userId -> profile
let profileHydrated = false;
let profileHydratePromise: Promise<void> | null = null;

let presenceCache = new Map<string, number>(); // legacy userId -> last_seen_at (ms)
let presenceHydrated = false;
let presenceHydratePromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT));
}

async function hydrateProfiles(): Promise<void> {
  if (profileHydrated) return;
  if (profileHydratePromise) return profileHydratePromise;
  profileHydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("staff_profiles").select("*");
    if (error) {
      console.error("[staff-profile-store] failed to load profiles", error);
      profileHydrated = true;
      return;
    }
    const next = new Map<string, StaffProfile>();
    for (const row of (data ?? []) as ProfileRow[]) {
      next.set(uuidToLegacySync(row.user_id), {
        headline: row.headline ?? "",
        specializations: row.specializations ?? [],
      });
    }
    profileCache = next;
    profileHydrated = true;
  })();
  await profileHydratePromise;
  profileHydratePromise = null;
  notify();
}

async function hydratePresence(): Promise<void> {
  if (presenceHydrated) return;
  if (presenceHydratePromise) return presenceHydratePromise;
  presenceHydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("user_presence").select("*");
    if (error) {
      console.error("[staff-profile-store] failed to load presence", error);
      presenceHydrated = true;
      return;
    }
    const next = new Map<string, number>();
    for (const row of (data ?? []) as PresenceRow[]) {
      next.set(uuidToLegacySync(row.user_id), new Date(row.last_seen_at).getTime());
    }
    presenceCache = next;
    presenceHydrated = true;
  })();
  await presenceHydratePromise;
  presenceHydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrateProfiles();
  void hydratePresence();
  supabase
    .channel("staff-profiles-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "staff_profiles" }, () => {
      profileHydrated = false;
      void hydrateProfiles();
    })
    .subscribe();
  supabase
    .channel("user-presence-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => {
      presenceHydrated = false;
      void hydratePresence();
    })
    .subscribe();
}

export function loadStaffProfile(userId: string | undefined): StaffProfile {
  if (!userId) return EMPTY;
  if (!profileHydrated) void hydrateProfiles();
  return profileCache.get(userId) ?? EMPTY;
}

/** Persists the profile after trimming/validating. Returns the stored value
 *  immediately (optimistic) — the Supabase write happens in the background. */
export function saveStaffProfile(userId: string, patch: Partial<StaffProfile>): StaffProfile {
  const cur = loadStaffProfile(userId);
  const next: StaffProfile = {
    headline: (patch.headline ?? cur.headline).slice(0, MAX_HEADLINE_CHARS),
    specializations: (patch.specializations ?? cur.specializations)
      .map((s) => s.trim())
      .filter((s, i, arr) => s.length > 0 && arr.indexOf(s) === i)
      .slice(0, MAX_SPECIALIZATIONS),
  };
  profileCache.set(userId, next);
  notify();
  void (async () => {
    const uuid = await legacyToUuid(userId);
    if (!uuid) return;
    const { error } = await supabase
      .from("staff_profiles")
      .upsert({ user_id: uuid, headline: next.headline, specializations: next.specializations }, { onConflict: "user_id" });
    if (error) console.error("[staff-profile-store] failed to save profile", error);
  })();
  return next;
}

export function subscribeStaffProfiles(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useStaffProfile(userId: string | undefined): StaffProfile {
  const [val, setVal] = useState<StaffProfile>(EMPTY);
  useEffect(() => {
    if (!userId) return;
    const sync = () => setVal(loadStaffProfile(userId));
    sync();
    return subscribeStaffProfiles(sync);
  }, [userId]);
  return val;
}

// ----------------------------------------------------------------------------
// Presence
// ----------------------------------------------------------------------------
export function touchPresence(userId: string) {
  presenceCache.set(userId, Date.now());
  notify();
  void (async () => {
    const uuid = await legacyToUuid(userId);
    if (!uuid) return;
    const { error } = await supabase
      .from("user_presence")
      .upsert({ user_id: uuid, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) console.error("[staff-profile-store] failed to save presence", error);
  })();
}

export function isOnline(userId: string | undefined): boolean {
  if (!userId) return false;
  if (!presenceHydrated) void hydratePresence();
  const at = presenceCache.get(userId);
  return typeof at === "number" && Date.now() - at < PRESENCE_TTL_MS;
}

/** Heartbeat for the signed-in user; returns their live online state. */
export function usePresence(userId: string | undefined, self = false): boolean {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    if (!userId) return;
    const beat = () => {
      if (self) touchPresence(userId);
      setOnline(isOnline(userId));
    };
    beat();
    const id = setInterval(beat, 60_000);
    const un = subscribeStaffProfiles(() => setOnline(isOnline(userId)));
    return () => { clearInterval(id); un(); };
  }, [userId, self]);
  return online;
}

// ----------------------------------------------------------------------------
// Derived display data
// ----------------------------------------------------------------------------
export interface StaffStat {
  key: "rating" | "students" | "sessions" | "team";
  value: string;
  label: string;
}

export function tenureLabel(u: User): string {
  const from = u.role === "teacher" ? activeTenureDays(u) : legacyTenureDays(u);
  if (from < 30) return "New";
  const months = Math.floor(from / 30);
  if (months < 12) return `${months} mo${months === 1 ? "" : "s"} tenure`;
  const years = Math.floor(months / 12);
  return `${years} yr${years === 1 ? "" : "s"} tenure`;
}

function legacyTenureDays(u: User): number {
  const since = u.member_since ? new Date(u.member_since) : null;
  if (!since || isNaN(since.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - since.getTime()) / 86_400_000));
}

/** Chip #2: rank / tier label. */
export function rankLabel(u: User): string {
  if (u.role === "teacher") return teacherTier(u).name;
  if (u.role === "student") return u.hired_plan || u.access_plan || "Student";
  if (u.admin_type === "coordinator_ops") return "Operations";
  if (u.admin_type === "coordinator_fin") return "Financial";
  return "Super Admin";
}

export function roleLabelFor(u: User): string {
  if (u.role === "teacher") return "Teacher";
  if (u.role === "admin") return "Admin";
  return "Student";
}

/** The three stat columns shown in the profile modal. */
export function staffStats(u: User, rev = 0): StaffStat[] {
  if (u.role === "teacher") {
    const rating = avgRating(u);
    const students = assignedStudents(u.id).length;
    return [
      { key: "rating", value: rating != null ? rating.toFixed(1) : "—", label: "Rating" },
      { key: "students", value: students > 0 ? `${students}` : "—", label: "Students Taught" },
      { key: "sessions", value: `${Math.round(u.hours_month ?? 0)}`, label: "Hours This Month" },
    ];
  }
  if (u.role === "student") {
    const progress = computeCurrentProgress(u.id, u.product, u.contracted_levels ?? [], rev);
    return [
      { key: "team", value: progress?.levelName ?? "—", label: "Current Level" },
      { key: "rating", value: `${u.attendance_percentage ?? 0}%`, label: "Attendance" },
      { key: "sessions", value: `${u.completed_challenges?.length ?? 0}`, label: "Challenges Completed" },
    ];
  }
  const teachers = USERS.filter((x) => x.role === "teacher").length;
  const students = USERS.filter((x) => x.role === "student").length;
  return [
    { key: "team", value: `${teachers}`, label: "Teachers" },
    { key: "students", value: `${students}`, label: "Students" },
    { key: "rating", value: rankLabel(u), label: "Access" },
  ];
}
