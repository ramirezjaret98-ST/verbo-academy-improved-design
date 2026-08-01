// Club events — shared, persisted data source for Admin > Manage Clubs, the
// Admin Overview snapshot, the Teacher Panel > Clubs tab (claim / release
// flow) and the shared Calendar adapter. Everything reads and writes through
// this store so a claim in one surface shows up everywhere else.
import { USERS } from "./mock-data";

export type ClubType = "insight" | "book";
export type TimeStatus = "upcoming" | "live" | "completed" | "cancelled";
export type AssignmentStatus = "created" | "assigned";

export interface Club {
  id: string;
  type: ClubType;
  title: string;
  description: string;
  link: string;
  material?: string;
  cover_image?: string;
  teacher_id?: string;
  date: string; // ISO
  duration_minutes: number;
  spots_taken: number;
  spots_total: number;
  status: TimeStatus;
  /** Optional payout to the teacher who delivers this club, MXN. Used as
   *  the default penalty amount when an admin approves a release request. */
  teacher_payment?: number;
  /** ISO timestamp of the current claim. Set when a teacher claims, cleared
   *  when the club is released back to "Created". Drives the 5-minute
   *  free-release window on the teacher side. */
  claimed_at?: string;
  /** ISO timestamp of when the club was authored by Admin. Optional because
   *  legacy/seed clubs predate this field — consumers should fall back to
   *  `date` when it's missing. Used by the student-facing "New Club open"
   *  notification to only surface recently opened clubs. */
  created_at?: string;
}

export const CLUB_SEED: Club[] = [
  { id: "c1", type: "insight", title: "Mastering Business Idioms", description: "Live workshop on professional idioms.", link: "https://teams.microsoft.com/l/meetup-1", material: "idioms-guide.pdf", teacher_id: "u2", date: "2026-05-28T17:00:00", duration_minutes: 60, spots_taken: 12, spots_total: 30, status: "upcoming" },
  { id: "c2", type: "book", title: "The Alchemist — Chapter 3", description: "Discussion circle on themes and vocabulary.", link: "https://teams.microsoft.com/l/meetup-2", material: "alchemist-ch3.pdf", date: "2026-05-25T18:30:00", duration_minutes: 60, spots_taken: 4, spots_total: 4, status: "upcoming" },
  { id: "c3", type: "insight", title: "Pronunciation Lab: TH Sounds", description: "Drills and pair practice.", link: "https://teams.microsoft.com/l/meetup-3", teacher_id: "u3", date: "2026-05-18T16:00:00", duration_minutes: 45, spots_taken: 22, spots_total: 25, status: "completed" },
  { id: "c4", type: "book", title: "Atomic Habits — Intro", description: "Kickoff session for the new club cycle.", link: "https://teams.microsoft.com/l/meetup-4", date: "2026-06-02T17:30:00", duration_minutes: 60, spots_taken: 1, spots_total: 4, status: "upcoming" },
];

export function assignmentOf(c: Club): AssignmentStatus {
  return c.teacher_id ? "assigned" : "created";
}

export function clubTeacherName(id?: string): string | null {
  if (!id) return null;
  return USERS.find((u) => u.id === id)?.name ?? null;
}

// Clubs still "Created" (no teacher assigned) and not finished/cancelled,
// ordered by the nearest date first — early-warning list for the admin.
export function upcomingCreatedClubs(clubs: Club[] = CLUB_SEED): Club[] {
  return clubs
    .filter((c) => !c.teacher_id && c.status !== "completed" && c.status !== "cancelled")
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

// ---------------------------------------------------------------------------
// Persistence (localStorage) + subscribe (cross-tab safe)
// ---------------------------------------------------------------------------
export const CLUBS_KEY = "verbo:clubs";
export const CLUBS_EVENT = "verbo:clubs-updated";
export const RELEASE_REQUESTS_KEY = "verbo:club-release-requests";
export const RELEASE_REQUESTS_EVENT = "verbo:club-release-requests-updated";
/** Free-release window after a claim, in milliseconds. */
export const FREE_RELEASE_WINDOW_MS = 5 * 60 * 1000;

export interface ClubReleaseRequest {
  id: string;
  club_id: string;
  teacher_id: string;
  reason: string;
  requested_at: string; // ISO
}

export function loadClubs(): Club[] {
  if (typeof window === "undefined") return CLUB_SEED;
  try {
    const raw = localStorage.getItem(CLUBS_KEY);
    if (raw) return JSON.parse(raw) as Club[];
  } catch { /* noop */ }
  try { localStorage.setItem(CLUBS_KEY, JSON.stringify(CLUB_SEED)); } catch { /* noop */ }
  return CLUB_SEED;
}

export function persistClubs(clubs: Club[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
    window.dispatchEvent(new CustomEvent(CLUBS_EVENT));
  } catch { /* noop */ }
}

export function subscribeClubs(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === CLUBS_KEY) cb(); };
  window.addEventListener(CLUBS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CLUBS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function updateClub(id: string, patch: Partial<Club>): Club | null {
  const clubs = loadClubs();
  const idx = clubs.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  clubs[idx] = { ...clubs[idx], ...patch };
  persistClubs(clubs);
  return clubs[idx];
}

/** Attempt to claim a Created club for the given teacher. Returns the
 *  updated club on success, or null if it was already assigned (race). */
export function claimClub(id: string, teacherId: string): Club | null {
  const clubs = loadClubs();
  const idx = clubs.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  if (clubs[idx].teacher_id) return null;
  clubs[idx] = { ...clubs[idx], teacher_id: teacherId, claimed_at: new Date().toISOString() };
  persistClubs(clubs);
  return clubs[idx];
}

/** Release a claim — clears teacher + claimed_at, returning it to "Created". */
export function releaseClub(id: string): Club | null {
  return updateClub(id, { teacher_id: undefined, claimed_at: undefined });
}

// --- Release requests -------------------------------------------------------
export function loadReleaseRequests(): ClubReleaseRequest[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RELEASE_REQUESTS_KEY) || "[]") as ClubReleaseRequest[]; }
  catch { return []; }
}

export function persistReleaseRequests(list: ClubReleaseRequest[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RELEASE_REQUESTS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(RELEASE_REQUESTS_EVENT));
  } catch { /* noop */ }
}

export function subscribeReleaseRequests(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === RELEASE_REQUESTS_KEY) cb(); };
  window.addEventListener(RELEASE_REQUESTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RELEASE_REQUESTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function addReleaseRequest(input: { club_id: string; teacher_id: string; reason: string }): ClubReleaseRequest {
  const list = loadReleaseRequests();
  const req: ClubReleaseRequest = {
    id: `rr${Date.now()}`,
    club_id: input.club_id,
    teacher_id: input.teacher_id,
    reason: input.reason,
    requested_at: new Date().toISOString(),
  };
  persistReleaseRequests([req, ...list]);
  return req;
}

export function removeReleaseRequest(id: string) {
  persistReleaseRequests(loadReleaseRequests().filter((r) => r.id !== id));
}
