// Teacher availability + change-request queue.
// Persisted to localStorage, broadcast via CustomEvent.
import { loadSessions } from "./sessions-store";
import { USERS, type User } from "./mock-data";

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

const AVAIL_KEY = "verbo:teacher-availability";
const REQ_KEY = "verbo:availability-change-requests";
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

function readAvailRaw(): Record<string, TeacherAvailability> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(AVAIL_KEY) || "{}"); } catch { return {}; }
}
function writeAvailRaw(v: Record<string, TeacherAvailability>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AVAIL_KEY, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(AVAIL_EVENT));
}

const LEGACY_DAY_TO_KEY: Record<string, DayKey> = Object.fromEntries(
  DAY_KEYS.map((k) => [DAY_LABELS[k], k]),
) as Record<string, DayKey>;

function parseLegacyRange(range: string): TimeBlock | null {
  const parts = range.split(/[–-]/).map((s) => s.trim());
  if (parts.length !== 2) return null;
  const startMin = timeToMinutes(parts[0]);
  const endMin = timeToMinutes(parts[1]);
  if (Number.isNaN(startMin) || Number.isNaN(endMin)) return null;
  const clampedStart = Math.max(MIN_MINUTES, startMin);
  const clampedEnd = Math.min(MAX_MINUTES, endMin);
  if (clampedEnd <= clampedStart) return null;
  return { startMin: clampedStart, endMin: clampedEnd };
}

let _availabilityHydrated = false;

/** One-time seed: any teacher who has never saved real availability (no
 *  entry yet under AVAIL_KEY) but carries the static demo `availability`
 *  field from mock-data gets it converted into real Weekly blocks and
 *  persisted — WITHOUT confirmedAt, so the teacher's own My Availability
 *  page still offers a free "Save Availability" (not "Request Change") and
 *  they can edit it freely before confirming. Runs automatically the first
 *  time availability is read anywhere in the app — no page needs to call
 *  this. Idempotent; never overwrites a teacher who already has real saved
 *  availability (including one who deliberately saved an empty schedule). */
function hydrateAvailabilityOnce() {
  if (_availabilityHydrated || typeof window === "undefined") return;
  _availabilityHydrated = true;
  const map = readAvailRaw();
  let changed = false;
  for (const u of USERS as User[]) {
    if (u.role !== "teacher" || map[u.id]) continue;
    const legacy = u.availability;
    if (!legacy || legacy.length === 0) continue;
    const weekly = emptyWeekly();
    for (const entry of legacy) {
      const key = LEGACY_DAY_TO_KEY[entry.day];
      if (!key) continue; // drops "Sunday" or unrecognized labels safely
      for (const slot of entry.slots) {
        const block = parseLegacyRange(slot);
        if (block) weekly[key].push(block);
      }
    }
    if (Object.values(weekly).some((blocks) => blocks.length > 0)) {
      map[u.id] = { teacherId: u.id, weekly };
      changed = true;
    }
  }
  if (changed) writeAvailRaw(map);
}

function readAvail(): Record<string, TeacherAvailability> {
  hydrateAvailabilityOnce();
  return readAvailRaw();
}

function writeAvail(v: Record<string, TeacherAvailability>) {
  writeAvailRaw(v);
}

function readReqs(): AvailabilityChangeRequest[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REQ_KEY) || "[]"); } catch { return []; }
}
function writeReqs(v: AvailabilityChangeRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REQ_KEY, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(AVAIL_EVENT));
}

export function getAvailability(teacherId: string): TeacherAvailability {
  const map = readAvail();
  return map[teacherId] ?? { teacherId, weekly: emptyWeekly() };
}

export function saveAvailability(teacherId: string, weekly: Weekly) {
  const map = readAvail();
  map[teacherId] = { teacherId, weekly, confirmedAt: new Date().toISOString() };
  writeAvail(map);
}

export function subscribeAvailability(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvt = () => cb();
  const onStorage = (e: StorageEvent) => { if (e.key === AVAIL_KEY || e.key === REQ_KEY) cb(); };
  window.addEventListener(AVAIL_EVENT, onEvt);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AVAIL_EVENT, onEvt);
    window.removeEventListener("storage", onStorage);
  };
}

// ---- Change requests -------------------------------------------------------
export function listChangeRequests(status?: AvailabilityChangeRequest["status"]): AvailabilityChangeRequest[] {
  const all = readReqs();
  return status ? all.filter((r) => r.status === status) : all;
}

export function hasPendingRequest(teacherId: string): boolean {
  return readReqs().some((r) => r.teacherId === teacherId && r.status === "pending");
}

export function submitChangeRequest(teacherId: string, proposed: Weekly, reason?: string): AvailabilityChangeRequest | null {
  if (hasPendingRequest(teacherId)) return null;
  const req: AvailabilityChangeRequest = {
    id: `avr-${Date.now()}`,
    teacherId,
    reason,
    proposed,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  writeReqs([req, ...readReqs()]);
  return req;
}

export function approveChangeRequest(id: string) {
  const list = readReqs();
  const req = list.find((r) => r.id === id);
  if (!req) return;
  saveAvailability(req.teacherId, req.proposed);
  req.status = "approved";
  req.resolvedAt = new Date().toISOString();
  writeReqs(list);
}

export function rejectChangeRequest(id: string) {
  const list = readReqs();
  const req = list.find((r) => r.id === id);
  if (!req) return;
  req.status = "rejected";
  req.resolvedAt = new Date().toISOString();
  writeReqs(list);
}

// ---- Availability check ----------------------------------------------------
const JS_DAY_TO_KEY: Record<number, DayKey | null> = {
  0: null, 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

/** Does the teacher's weekly schedule cover this date/time, and no other
 *  active session overlaps? Sundays are never available. */
export function isTeacherAvailableAt(teacherId: string, dateISO: string, durationMin = 60): boolean {
  const d = new Date(dateISO);
  const key = JS_DAY_TO_KEY[d.getDay()];
  if (!key) return false;
  const start = d.getHours() * 60 + d.getMinutes();
  const end = start + durationMin;
  const wk = getAvailability(teacherId).weekly;
  const covered = (wk[key] ?? []).some((b) => b.startMin <= start && b.endMin >= end);
  if (!covered) return false;
  // Overlap check against other active sessions of this teacher.
  const startMs = d.getTime();
  const endMs = startMs + durationMin * 60_000;
  const blocking = new Set(["scheduled", "ready", "rescheduled", "rearranged", "delayed"]);
  const clash = loadSessions().some((s) => {
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