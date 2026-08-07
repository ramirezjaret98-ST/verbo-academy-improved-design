// Club events — shared, persisted data source for Admin > Manage Clubs, the
// Admin Overview snapshot, the Teacher Panel > Clubs tab (claim / release
// flow) and the shared Calendar adapter. Everything reads and writes through
// this store so a claim in one surface shows up everywhere else.
//
// Backed by Supabase (`public.clubs`, RLS: open SELECT, write restricted to
// admin, the assigned teacher, or — for UPDATE only — any teacher claiming an
// unassigned club). Global cache hydrated once + Postgres Realtime, same
// pattern used across this migration. Mutations are genuine async
// round-trips (NOT optimistic) — `claimClub` in particular is a real race
// between teachers, so callers must await the actual database result rather
// than trust an optimistic local update.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
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
  /** ISO timestamp of when the club was authored by Admin. Used by the
   *  student-facing "New Club open" notification to only surface recently
   *  opened clubs — consumers fall back to `date` when it's missing. */
  created_at?: string;
}

export const CLUBS_EVENT = "verbo:clubs-updated";
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

type ClubRow = Database["public"]["Tables"]["clubs"]["Row"];
type ClubUpdate = Database["public"]["Tables"]["clubs"]["Update"];
type ReleaseRow = Database["public"]["Tables"]["club_release_requests"]["Row"];

let clubsCache: Club[] = [];
let clubsHydrated = false;
let clubsHydratePromise: Promise<void> | null = null;
const clubListeners = new Set<() => void>();

let requestsCache: ClubReleaseRequest[] = [];
let requestsHydrated = false;
let requestsHydratePromise: Promise<void> | null = null;
const requestListeners = new Set<() => void>();

function notifyClubs() {
  clubListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CLUBS_EVENT));
}
function notifyRequests() {
  requestListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(RELEASE_REQUESTS_EVENT));
}

function mapClubRow(row: ClubRow): Club {
  return {
    id: String(row.id),
    type: row.type,
    title: row.title,
    description: row.description ?? "",
    link: row.link ?? "",
    material: row.material ?? undefined,
    cover_image: row.cover_image ?? undefined,
    teacher_id: row.teacher_id ? uuidToLegacySync(row.teacher_id) : undefined,
    date: row.date,
    duration_minutes: row.duration_minutes,
    spots_taken: row.spots_taken,
    spots_total: row.spots_total,
    status: row.status,
    teacher_payment: row.teacher_payment ?? undefined,
    claimed_at: row.claimed_at ?? undefined,
    created_at: row.created_at,
  };
}

function mapReleaseRow(row: ReleaseRow): ClubReleaseRequest {
  return {
    id: String(row.id),
    club_id: String(row.club_id),
    teacher_id: uuidToLegacySync(row.teacher_id),
    reason: row.reason ?? "",
    requested_at: row.requested_at,
  };
}

async function hydrateClubs(): Promise<void> {
  if (clubsHydrated) return;
  if (clubsHydratePromise) return clubsHydratePromise;
  clubsHydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("clubs").select("*");
    if (error) {
      console.error("[clubs-store] failed to load clubs", error);
      clubsHydrated = true;
      return;
    }
    clubsCache = (data ?? []).map(mapClubRow);
    clubsHydrated = true;
  })();
  await clubsHydratePromise;
  clubsHydratePromise = null;
  notifyClubs();
}

async function hydrateRequests(): Promise<void> {
  if (requestsHydrated) return;
  if (requestsHydratePromise) return requestsHydratePromise;
  requestsHydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("club_release_requests").select("*");
    if (error) {
      console.error("[clubs-store] failed to load release requests", error);
      requestsHydrated = true;
      return;
    }
    requestsCache = (data ?? []).map(mapReleaseRow);
    requestsHydrated = true;
  })();
  await requestsHydratePromise;
  requestsHydratePromise = null;
  notifyRequests();
}

if (typeof window !== "undefined") {
  void hydrateClubs();
  void hydrateRequests();
  supabase
    .channel("clubs-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "clubs" }, () => {
      clubsHydrated = false;
      void hydrateClubs();
    })
    .subscribe();
  supabase
    .channel("club-release-requests-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "club_release_requests" }, () => {
      requestsHydrated = false;
      void hydrateRequests();
    })
    .subscribe();
}

export function assignmentOf(c: Club): AssignmentStatus {
  return c.teacher_id ? "assigned" : "created";
}

export function clubTeacherName(id?: string): string | null {
  if (!id) return null;
  return USERS.find((u) => u.id === id)?.name ?? null;
}

// Clubs still "Created" (no teacher assigned) and not finished/cancelled,
// ordered by the nearest date first — early-warning list for the admin.
export function upcomingCreatedClubs(clubs: Club[] = clubsCache): Club[] {
  return clubs
    .filter((c) => !c.teacher_id && c.status !== "completed" && c.status !== "cancelled")
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

export function loadClubs(): Club[] {
  if (!clubsHydrated) void hydrateClubs();
  return clubsCache;
}

export function subscribeClubs(cb: () => void): () => void {
  clubListeners.add(cb);
  return () => {
    clubListeners.delete(cb);
  };
}

/** Creates a new club event. Returns the created club, or null on failure. */
export async function createClub(data: Omit<Club, "id" | "spots_taken" | "status">): Promise<Club | null> {
  const teacherUuid = data.teacher_id ? await legacyToUuid(data.teacher_id) : null;
  const { data: row, error } = await supabase
    .from("clubs")
    .insert({
      type: data.type,
      title: data.title,
      description: data.description || null,
      link: data.link || null,
      material: data.material || null,
      cover_image: data.cover_image || null,
      teacher_id: teacherUuid,
      date: data.date,
      duration_minutes: data.duration_minutes,
      spots_total: data.spots_total,
      teacher_payment: data.teacher_payment ?? null,
    })
    .select("*")
    .single();
  if (error || !row) {
    console.error("[clubs-store] failed to create club", error);
    return null;
  }
  const club = mapClubRow(row);
  clubsCache = [club, ...clubsCache];
  notifyClubs();
  return club;
}

/** Partial update — accepts the same patch shape the old localStorage
 *  version did. A key present with value `undefined` (e.g.
 *  `{ teacher_id: undefined }`) explicitly clears that column. */
export async function updateClub(id: string, patch: Partial<Club>): Promise<Club | null> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  const update: ClubUpdate = {};
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description || null;
  if (patch.link !== undefined) update.link = patch.link || null;
  if (patch.material !== undefined) update.material = patch.material || null;
  if (patch.cover_image !== undefined) update.cover_image = patch.cover_image || null;
  if (patch.date !== undefined) update.date = patch.date;
  if (patch.duration_minutes !== undefined) update.duration_minutes = patch.duration_minutes;
  if (patch.spots_taken !== undefined) update.spots_taken = patch.spots_taken;
  if (patch.spots_total !== undefined) update.spots_total = patch.spots_total;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.teacher_payment !== undefined) update.teacher_payment = patch.teacher_payment ?? null;
  if ("claimed_at" in patch) update.claimed_at = patch.claimed_at ?? null;
  if ("teacher_id" in patch) {
    update.teacher_id = patch.teacher_id ? await legacyToUuid(patch.teacher_id) : null;
  }
  const { data: row, error } = await supabase.from("clubs").update(update).eq("id", numericId).select("*").single();
  if (error || !row) {
    console.error("[clubs-store] failed to update club", error);
    return null;
  }
  const club = mapClubRow(row);
  clubsCache = clubsCache.map((c) => (c.id === id ? club : c));
  notifyClubs();
  return club;
}

export async function deleteClub(id: string): Promise<boolean> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return false;
  const { error } = await supabase.from("clubs").delete().eq("id", numericId);
  if (error) {
    console.error("[clubs-store] failed to delete club", error);
    return false;
  }
  clubsCache = clubsCache.filter((c) => c.id !== id);
  notifyClubs();
  return true;
}

/** Attempt to claim a Created club for the given teacher. Returns the
 *  updated club on success, or null if it was already assigned. The
 *  `.is("teacher_id", null)` filter makes this race-safe at the database
 *  level — two teachers claiming simultaneously can't both succeed. */
export async function claimClub(id: string, teacherId: string): Promise<Club | null> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return null;
  const teacherUuid = await legacyToUuid(teacherId);
  if (!teacherUuid) return null;
  const { data: row, error } = await supabase
    .from("clubs")
    .update({ teacher_id: teacherUuid, claimed_at: new Date().toISOString() })
    .eq("id", numericId)
    .is("teacher_id", null)
    .select("*")
    .single();
  if (error || !row) {
    // PGRST116 = "no rows returned" — expected when someone else claimed it first.
    if (error && error.code !== "PGRST116") console.error("[clubs-store] failed to claim club", error);
    return null;
  }
  const club = mapClubRow(row);
  clubsCache = clubsCache.map((c) => (c.id === id ? club : c));
  notifyClubs();
  return club;
}

/** Release a claim — clears teacher + claimed_at, returning it to "Created". */
export async function releaseClub(id: string): Promise<Club | null> {
  return updateClub(id, { teacher_id: undefined, claimed_at: undefined });
}

// --- Release requests -------------------------------------------------------
export function loadReleaseRequests(): ClubReleaseRequest[] {
  if (!requestsHydrated) void hydrateRequests();
  return requestsCache;
}

export function subscribeReleaseRequests(cb: () => void): () => void {
  requestListeners.add(cb);
  return () => {
    requestListeners.delete(cb);
  };
}

export function addReleaseRequest(input: { club_id: string; teacher_id: string; reason: string }): ClubReleaseRequest {
  const tempId = `temp-${Date.now()}`;
  const req: ClubReleaseRequest = {
    id: tempId,
    club_id: input.club_id,
    teacher_id: input.teacher_id,
    reason: input.reason,
    requested_at: new Date().toISOString(),
  };
  requestsCache = [req, ...requestsCache];
  notifyRequests();

  void (async () => {
    const numericClubId = Number(input.club_id);
    const teacherUuid = await legacyToUuid(input.teacher_id);
    if (!teacherUuid || !Number.isFinite(numericClubId)) {
      requestsCache = requestsCache.filter((r) => r.id !== tempId);
      notifyRequests();
      return;
    }
    const { data, error } = await supabase
      .from("club_release_requests")
      .insert({ club_id: numericClubId, teacher_id: teacherUuid, reason: input.reason || null })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[clubs-store] failed to submit release request", error);
      requestsCache = requestsCache.filter((r) => r.id !== tempId);
      notifyRequests();
      return;
    }
    requestsCache = requestsCache.map((r) => (r.id === tempId ? mapReleaseRow(data) : r));
    notifyRequests();
  })();

  return req;
}

export function removeReleaseRequest(id: string) {
  const prev = requestsCache;
  requestsCache = requestsCache.filter((r) => r.id !== id);
  notifyRequests();
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return;
  void (async () => {
    const { error } = await supabase.from("club_release_requests").delete().eq("id", numericId);
    if (error) {
      console.error("[clubs-store] failed to remove release request", error);
      requestsCache = prev;
      notifyRequests();
    }
  })();
}
