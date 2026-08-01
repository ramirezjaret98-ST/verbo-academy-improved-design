// VIP Course Builder store — per-student, teacher-authored units.
// Unlike Performance Sessions, VIP courses have NO skeleton, NO capsule/video,
// and no fixed unit count: the teacher adds units on demand.

export interface VipUnit {
  id: string; // e.g. VIP-<studentId>-<timestamp>
  student_id: string;
  title: string;
  file_url: string; // downloadable material (upload placeholder)
  file_name?: string;
  created_at: string;
}

const KEY = "verbo:vip-courses";
export const VIP_UNITS_EVENT = "verbo:vip-courses-updated";
const EVENT = VIP_UNITS_EVENT;

function safeRead(): VipUnit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VipUnit[]) : [];
  } catch { return []; }
}
function safeWrite(list: VipUnit[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

export function loadVipUnits(): VipUnit[] {
  return safeRead();
}

export function unitsForStudent(studentId: string): VipUnit[] {
  return safeRead()
    .filter((u) => u.student_id === studentId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function addVipUnit(studentId: string, title: string, fileUrl: string, fileName?: string): VipUnit {
  const unit: VipUnit = {
    id: `VIP-${studentId}-${Date.now()}`,
    student_id: studentId,
    title,
    file_url: fileUrl,
    file_name: fileName,
    created_at: new Date().toISOString(),
  };
  safeWrite([...safeRead(), unit]);
  return unit;
}

export function updateVipUnit(id: string, patch: Partial<Omit<VipUnit, "id" | "student_id" | "created_at">>) {
  safeWrite(safeRead().map((u) => (u.id === id ? { ...u, ...patch } : u)));
}

export function removeVipUnit(id: string) {
  safeWrite(safeRead().filter((u) => u.id !== id));
}

export function subscribeVipUnits(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

// Count of Completed sessions for this student — read from the real sessions
// engine so the unlock indicator matches what the rest of the app shows.
export function completedSessionCount(studentId: string, sessions: { student_id: string; status: string }[]): number {
  return sessions.filter((s) => s.student_id === studentId && s.status === "completed").length;
}

/* -------------------- Per-unit completion (VIP) ----------------------
 * A VIP unit is "done" when a completed Performance Session is linked to
 * it via the LessonPlan.vip_unit_id field. Keyed by unit id so unlock
 * order = creation order of units.
 */
export interface VipUnitCompletion {
  session_id: string;
  completed_at: string; // ISO
}

const COMPLETION_KEY = "verbo:vip-unit-completion";
const COMPLETION_EVENT = "verbo:vip-unit-completion-updated";

function readCompletion(): Record<string, VipUnitCompletion> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(COMPLETION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, VipUnitCompletion>) : {};
  } catch { return {}; }
}
function writeCompletion(map: Record<string, VipUnitCompletion>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPLETION_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(COMPLETION_EVENT));
  } catch { /* noop */ }
}

export function vipUnitDoneMap(): Record<string, VipUnitCompletion> {
  return readCompletion();
}

export function isVipUnitDone(unitId: string): boolean {
  return !!readCompletion()[unitId];
}

export function markVipUnitDone(unitId: string, sessionId: string) {
  const map = readCompletion();
  // If this session had previously closed a different unit, drop that
  // stale record so re-linking a plan doesn't leave phantom completions.
  for (const [uid, rec] of Object.entries(map)) {
    if (rec.session_id === sessionId && uid !== unitId) delete map[uid];
  }
  map[unitId] = { session_id: sessionId, completed_at: new Date().toISOString() };
  writeCompletion(map);
}

export function clearVipUnitDoneForSession(sessionId: string) {
  const map = readCompletion();
  let changed = false;
  for (const [uid, rec] of Object.entries(map)) {
    if (rec.session_id === sessionId) { delete map[uid]; changed = true; }
  }
  if (changed) writeCompletion(map);
}

export function subscribeVipUnitCompletion(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === COMPLETION_KEY) cb(); };
  window.addEventListener(COMPLETION_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(COMPLETION_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}