// ============================================================================
// Staff profile store — editable presentation data for teachers and admins
// (headline phrase, specializations) plus a lightweight presence heartbeat
// used to show the online/offline dot on the profile modal.
//
// All derived values (stats, tenure label, online state) are computed here;
// components only read and dispatch.
// ============================================================================
import { useEffect, useState } from "react";
import { USERS, type User } from "./mock-data";
import { avgRating, assignedStudents } from "./teacher-model";
import { activeTenureDays, teacherTier } from "./teacher-tiers";
import { computeCurrentProgress } from "./product-courses-store";


const KEY = "verbo:staff-profiles";
const PRESENCE_KEY = "verbo:staff-presence";
const EVT = "verbo:staff-profiles-updated";

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

type Map = Record<string, StaffProfile>;
type PresenceMap = Record<string, number>;

const EMPTY: StaffProfile = { headline: "", specializations: [] };

function read(): Map {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

function write(m: Map) {
  localStorage.setItem(KEY, JSON.stringify(m));
  window.dispatchEvent(new CustomEvent(EVT));
}

function readPresence(): PresenceMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PRESENCE_KEY) || "{}"); } catch { return {}; }
}

export function loadStaffProfile(userId: string | undefined): StaffProfile {
  if (!userId) return EMPTY;
  const p = read()[userId];
  return {
    headline: p?.headline ?? "",
    specializations: Array.isArray(p?.specializations) ? p.specializations : [],
  };
}

/** Persists the profile after trimming/validating. Returns the stored value. */
export function saveStaffProfile(userId: string, patch: Partial<StaffProfile>): StaffProfile {
  const cur = loadStaffProfile(userId);
  const next: StaffProfile = {
    headline: (patch.headline ?? cur.headline).slice(0, MAX_HEADLINE_CHARS),
    specializations: (patch.specializations ?? cur.specializations)
      .map((s) => s.trim())
      .filter((s, i, arr) => s.length > 0 && arr.indexOf(s) === i)
      .slice(0, MAX_SPECIALIZATIONS),
  };
  const m = read();
  m[userId] = next;
  write(m);
  return next;
}

export function subscribeStaffProfiles(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVT, fn);
    window.removeEventListener("storage", fn);
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
  if (typeof window === "undefined") return;
  const m = readPresence();
  m[userId] = Date.now();
  localStorage.setItem(PRESENCE_KEY, JSON.stringify(m));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function isOnline(userId: string | undefined): boolean {
  if (!userId) return false;
  const at = readPresence()[userId];
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

