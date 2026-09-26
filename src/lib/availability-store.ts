// Teacher availability + change-request queue.
//
// Backed by Supabase (`public.teacher_availability` singleton row per
// teacher + `public.teacher_availability_blocks` normalized weekly blocks +
// public.availability_change_requests`, RLS: self + admin on all three).
// Global caches hydrated once + Postgres Realtime, same pattern used across
// this migration — admin's RLS-bypassed `select("*")` already returns every
// teacher's rows, so a single global cache serves both the teacher's own
// "My Availability" page and Admin's cross-teacher lookups.
//
// `saveAvailability` writes go through the `replace_teacher_availability`
// RPC (one DB transaction) rather than a plain delete+insert from the
// client, so Realtime subscribers never observe an intermediate
// "blocks deleted but not yet reinserted" flicker.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
import { loadSessions } from "./sessions-store";
import { notifyError } from "@/lib/notify";
import { registerRehydrate } from "@/lib/auth-rehydrate";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday",
};

export interface TimeBlock {
  /** minutes from 00:00 (07:00 = 420, 22:00 = 1320) */
  startMin: number;
  endMin: number;
}
export type Weekly = Record<DayKey, TimeBlock[]>;

export interface TeacherAvailability {
  teacherId: string;
  weekly: Weekly;
  confirmedAt?: string;
}

export interface AvailabilityChangeRequest {
  id: string;
  teacherId: string;
  reason?: string;
  proposed: Weekly;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string;
}

export const AVAIL_EVENT = "verbo:availability-updated";

export const MIN_MINUTES = 7 * 60;
export const MAX_MINUTES = 22 * 60;

export function emptyWeekly(): Weekly {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
}

export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

type AvailRow = Database["public"]["Tables"]["teacher_availability"]["Row"];
type BlockRow = Database["public"]["Tables"]["teacher_availability_blocks"]["Row"];
type ReqRow = Database["public"]["Tables"]["availability_change_requests"]["Row"];

let availabilityMap: Record<string, TeacherAvailability> = {};
let availHydrated = false;
let scopeGeneration=0;
let availQueued=false;
let reqQueued=false;
let availHydratePromise: Promise<void> | null = null;
const availListeners = new Set<() => void>();

let changeRequestsCache: AvailabilityChangeRequest[] = [];
let reqHydrated = false;
let reqHydratePromise: Promise<void> | null = null;
const reqListeners = new Set<() => void>();

function notifyAvailability() {
  availListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AVAIL_EVENT));
}
function notifyChangeRequests() {
  reqListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AVAIL_EVENT));
}

function setAvailabilityEntry(teacherId: string, entry: TeacherAvailability | undefined) {
  const next = { ...availabilityMap };
  if (entry) next[teacherId] = entry;
  else delete next[teacherId];
  availabilityMap = next;
}

function mapChangeRequestRow(row: ReqRow): AvailabilityChangeRequest {
  return {
    id: String(row.id),
    teacherId: uuidToLegacySync(row.teacher_id),
    reason: row.reason ?? undefined,
    proposed: row.proposed as unknown as Weekly,
    status: row.status as AvailabilityChangeRequest["status"],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

async function hydrateAvailability(): Promise<void> {
  if (availHydrated) return;
  if (availHydratePromise) return availHydratePromise;
  const version=scopeGeneration;
  availHydratePromise = (async () => {
    await hydrateUserIdBridge();
    const [{ data: rows, error: rowsErr }, { data: blocks, error: blocksErr }] = await Promise.all([
      supabase.from("teacher_availability").select("*"),
      supabase.from("teacher_availability_blocks").select("*").order("id", { ascending: true }),
    ]);
    if(version!==scopeGeneration)return;
    if(rowsErr || blocksErr)throw rowsErr ?? blocksErr;
    if (rowsErr) console.error("[availability-store] failed to load teacher_availability", rowsErr);
    if (blocksErr) console.error("[availability-store] failed to load teacher_availability_blocks", blocksErr);
    const map: Record<string, TeacherAvailability> = {};
    for (const row of (rows ?? []) as AvailRow[]) {
      const legacyId = uuidToLegacySync(row.teacher_id);
      map[legacyId] = { teacherId: legacyId, weekly: emptyWeekly(), confirmedAt: row.confirmed_at ?? undefined };
    }
    for (const b of (blocks ?? []) as BlockRow[]) {
      const legacyId = uuidToLegacySync(b.teacher_id);
      if (!map[legacyId]) map[legacyId] = { teacherId: legacyId, weekly: emptyWeekly() };
      map[legacyId].weekly[b.day].push({ startMin: b.start_min, endMin: b.end_min });
    }
    availabilityMap = map;
    availHydrated = true;
  })();
  await availHydratePromise.catch(error=>console.error("[availability-store] refresh failed",error));
  availHydratePromise = null;
  notifyAvailability();
  if(availQueued){availQueued=false;void hydrateAvailability();}
}

async function hydrateChangeRequests(): Promise<void> {
  if (reqHydrated) return;
  if (reqHydratePromise) return reqHydratePromise;
  const version=scopeGeneration;
  reqHydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("availability_change_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if(version!==scopeGeneration)return;
    if(error)throw error;
    changeRequestsCache = (data ?? []).map(mapChangeRequestRow);
    reqHydrated = true;
  })();
  await reqHydratePromise.catch(error=>console.error("[availability-store] requests refresh failed",error));
  reqHydratePromise = null;
  notifyChangeRequests();
  if(reqQueued){reqQueued=false;void hydrateChangeRequests();}
}

if (typeof window !== "undefined") {
  registerRehydrate(reason => {
    scopeGeneration++;availHydrated=false;reqHydrated=false;
    if(reason==="auth"){availabilityMap={};changeRequestsCache=[];notifyAvailability();notifyChangeRequests();}
    if(availHydratePromise)availQueued=true;else void hydrateAvailability();
    if(reqHydratePromise)reqQueued=true;else void hydrateChangeRequests();
  }, {critical:true});
  void hydrateAvailability();
  void hydrateChangeRequests();
  supabase
    .channel("teacher-availability-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "teacher_availability" }, () => {
      availHydrated = false;
      if(availHydratePromise)availQueued=true;else void hydrateAvailability();
    })
    .subscribe();
  supabase
    .channel("teacher-availability-blocks-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "teacher_availability_blocks" }, () => {
      availHydrated = false;
      if(availHydratePromise)availQueued=true;else void hydrateAvailability();
    })
    .subscribe();
  supabase
    .channel("availability-change-requests-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "availability_change_requests" }, () => {
      reqHydrated = false;
      if(reqHydratePromise)reqQueued=true;else void hydrateChangeRequests();
    })
    .subscribe();
}

export function getAvailability(teacherId: string): TeacherAvailability {
  if (!availHydrated) void hydrateAvailability();
  return availabilityMap[teacherId] ?? { teacherId, weekly: emptyWeekly() };
}

/** 2026-09-21: has the availability cache actually come back from Supabase
 *  yet? This matters because getAvailability() cannot tell the two apart: a
 *  teacher with genuinely no hours and a teacher whose row simply hasn't
 *  loaded both come back as an empty week. teacher.availability.tsx uses
 *  this to keep the teacher from looking at (and, worse, SAVING) an empty
 *  schedule that would overwrite their real hours with nothing — which
 *  would leave their students unable to book or reschedule with them. */
export function isAvailabilityHydrated(): boolean {
  if (!availHydrated) void hydrateAvailability();
  return availHydrated;
}

/** Optimistic write: updates the local cache + notifies immediately, then
 *  round-trips through the `replace_teacher_availability` RPC in the
 *  background (rolling back the optimistic change on failure). Used both by
 *  the teacher's own "Save Availability" and by `approveChangeRequest`
 *  (called as admin, on the teacher's behalf — RLS allows this since the
 *  underlying tables' policies accept `is_admin()`). */
export async function saveAvailability(teacherId: string, weekly: Weekly): Promise<boolean> {
  const prev = availabilityMap[teacherId];
  const confirmedAt = new Date().toISOString();
  setAvailabilityEntry(teacherId, { teacherId, weekly, confirmedAt });
  notifyAvailability();

  try {
    const teacherUuid = await legacyToUuid(teacherId);
    if (!teacherUuid) {
      console.error("[availability-store] unknown teacher id", teacherId);
      setAvailabilityEntry(teacherId, prev);
      notifyAvailability();
      notifyError("Couldn't identify the teacher", { context: "Saving availability" });
      return false;
    }
    const blocks = DAY_KEYS.flatMap((day) =>
      weekly[day].map((b) => ({ day, startMin: b.startMin, endMin: b.endMin })),
    );
    const { error } = await supabase.rpc("replace_teacher_availability", {
      p_teacher_id: teacherUuid,
      p_confirmed_at: confirmedAt,
      p_blocks: blocks,
    });
    if (error) {
      console.error("[availability-store] failed to save availability", error);
      setAvailabilityEntry(teacherId, prev);
      notifyAvailability();
      notifyError(error, { context: "Saving availability" });
      return false;
    }
    return true;
  }catch(error){setAvailabilityEntry(teacherId,prev);notifyAvailability();notifyError(error,{context:"Saving availability"});return false;}
}

export function subscribeAvailability(cb: () => void): () => void {
  availListeners.add(cb);
  reqListeners.add(cb);
  return () => {
    availListeners.delete(cb);
    reqListeners.delete(cb);
  };
}

// ---- Change requests -------------------------------------------------------
export function listChangeRequests(status?: AvailabilityChangeRequest["status"]): AvailabilityChangeRequest[] {
  if (!reqHydrated) void hydrateChangeRequests();
  return status ? changeRequestsCache.filter((r) => r.status === status) : changeRequestsCache;
}

export function hasPendingRequest(teacherId: string): boolean {
  if (!reqHydrated) void hydrateChangeRequests();
  return changeRequestsCache.some((r) => r.teacherId === teacherId && r.status === "pending");
}

export function submitChangeRequest(teacherId: string, proposed: Weekly, reason?: string): AvailabilityChangeRequest | null {
  if (hasPendingRequest(teacherId)) return null;
  const tempId = `temp-${Date.now()}`;
  const req: AvailabilityChangeRequest = {
    id: tempId,
    teacherId,
    reason,
    proposed,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  changeRequestsCache = [req, ...changeRequestsCache];
  notifyChangeRequests();

  void (async () => {
    const teacherUuid = await legacyToUuid(teacherId);
    if (!teacherUuid) {
      changeRequestsCache = changeRequestsCache.filter((r) => r.id !== tempId);
      notifyChangeRequests();
      notifyError("Couldn't identify the teacher", { context: "Submitting availability change" });
      return;
    }
    const { data, error } = await supabase
      .from("availability_change_requests")
      .insert({ teacher_id: teacherUuid, reason: reason || null, proposed: proposed as unknown as never })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[availability-store] failed to submit change request", error);
      changeRequestsCache = changeRequestsCache.filter((r) => r.id !== tempId);
      notifyChangeRequests();
      notifyError(error, { context: "Submitting availability change" });
      return;
    }
    changeRequestsCache = changeRequestsCache.map((r) => (r.id === tempId ? mapChangeRequestRow(data) : r));
    notifyChangeRequests();
  })();

  return req;
}

export function approveChangeRequest(id: string) {
  const req = changeRequestsCache.find((r) => r.id === id);
  if (!req) return;
  saveAvailability(req.teacherId, req.proposed);

  const prev = changeRequestsCache;
  const resolvedAt = new Date().toISOString();
  changeRequestsCache = changeRequestsCache.map((r) =>
    r.id === id ? { ...r, status: "approved", resolvedAt } : r,
  );
  notifyChangeRequests();

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return;
  void (async () => {
    const { error } = await supabase
      .from("availability_change_requests")
      .update({ status: "approved", resolved_at: resolvedAt })
      .eq("id", numericId);
    if (error) {
      console.error("[availability-store] failed to approve change request", error);
      changeRequestsCache = prev;
      notifyChangeRequests();
      notifyError(error, { context: "Approving availability change" });
    }
  })();
}

export function rejectChangeRequest(id: string) {
  const prev = changeRequestsCache;
  const resolvedAt = new Date().toISOString();
  changeRequestsCache = changeRequestsCache.map((r) =>
    r.id === id ? { ...r, status: "rejected", resolvedAt } : r,
  );
  notifyChangeRequests();

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return;
  void (async () => {
    const { error } = await supabase
      .from("availability_change_requests")
      .update({ status: "rejected", resolved_at: resolvedAt })
      .eq("id", numericId);
    if (error) {
      console.error("[availability-store] failed to reject change request", error);
      changeRequestsCache = prev;
      notifyChangeRequests();
      notifyError(error, { context: "Rejecting availability change" });
    }
  })();
}

// ---- Availability check ----------------------------------------------------
const JS_DAY_TO_KEY: Record<number, DayKey | null> = {
  0: null, 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

/** Does the teacher's weekly schedule cover this date/time, and no other
 *  active session overlaps? Sundays are never available. */
export function isTeacherAvailableAt(teacherId: string, dateISO: string, durationMin = 60, excludeSessionId?: string): boolean {
  const d = new Date(dateISO);
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Mexico_City",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value ?? "";
  const key=part("weekday").toLowerCase() as DayKey;
  if (!DAY_KEYS.includes(key)) return false;
  const start = Number(part("hour"))*60+Number(part("minute"));
  const end = start + durationMin;
  const wk = getAvailability(teacherId).weekly;
  const covered = (wk[key] ?? []).some((b) => b.startMin <= start && b.endMin >= end);
  if (!covered) return false;
  // Overlap check against other active sessions of this teacher.
  const startMs = d.getTime();
  const endMs = startMs + durationMin * 60_000;
  const blocking = new Set(["scheduled", "ready", "rescheduled", "rearranged", "delayed", "pending_reschedule"]);
  const clash = loadSessions().some((s) => {
    if (s.id === excludeSessionId) return false;
    if (s.teacher_id !== teacherId) return false;
    if (!blocking.has(s.status)) return false;
    const sStart = new Date(s.date_time).getTime();
    const sEnd = sStart + (s.duration_minutes ?? 60) * 60_000;
    return sStart < endMs && sEnd > startMs;
  });
  return !clash;
}

// ---------------------------------------------------------------------------
// Slot finder for student self-service flows (Reschedule / Spotlight).
//
// Returns the sorted list of ISO datetimes on `dateYMD` (local YYYY-MM-DD)
// whose start falls on :00 or :30, that satisfy a ≥24h notice window, and
// where AT LEAST ONE of the given qualified teachers is available for the
// required contiguous duration. No arbitrary minute — start times are
// snapped to the half-hour grid on purpose.
// ---------------------------------------------------------------------------
export function findAvailableStartSlots(input: {
  dateYMD: string;         // "YYYY-MM-DD" in local time
  durationMin: number;     // 60 / 90 / 120 for reschedule, 60 for spotlight
  qualifiedTeacherIds: string[];
  minNoticeHours?: number; // default 24
}): string[] {
  const notice = input.minNoticeHours ?? 24;
  const [y, m, d] = input.dateYMD.split("-").map(Number);
  if (!y || !m || !d) return [];
  const now = Date.now();
  const out: string[] = [];
  // Iterate the :00 / :30 grid within the school day [MIN_MINUTES, MAX_MINUTES].
  for (let mins = MIN_MINUTES; mins + input.durationMin <= MAX_MINUTES; mins += 30) {
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    const candidate = new Date(y, m - 1, d, hh, mm, 0, 0);
    const iso = candidate.toISOString();
    // 24h notice.
    if ((candidate.getTime() - now) / 36e5 < notice) continue;
    // Any qualified teacher available for this exact block?
    const ok = input.qualifiedTeacherIds.some((tid) =>
      isTeacherAvailableAt(tid, iso, input.durationMin),
    );
    if (ok) out.push(iso);
  }
  return out;
}
