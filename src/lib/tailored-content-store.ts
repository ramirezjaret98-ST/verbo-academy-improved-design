// Tailored Content store — per-student, teacher-authored units for
// students on access_plan "Elite". This is a separate, parallel mechanism
// from VIP Course Builder (product: "vip") and shares NO storage or
// identifiers with vip-courses-store.ts on purpose.

export interface TailoredUnit {
  id: string; // pattern: TC-<studentId>-<timestamp>
  student_id: string;
  title: string;
  file_url: string;
  file_name?: string;
  created_at: string;
}

const KEY = "verbo:tailored-content";
export const TAILORED_UNITS_EVENT = "verbo:tailored-content-updated";
const EVENT = TAILORED_UNITS_EVENT;

function safeRead(): TailoredUnit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TailoredUnit[]) : [];
  } catch { return []; }
}
function safeWrite(list: TailoredUnit[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

export function loadTailoredUnits(): TailoredUnit[] {
  return safeRead();
}

export function tailoredUnitsForStudent(studentId: string): TailoredUnit[] {
  return safeRead()
    .filter((u) => u.student_id === studentId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function addTailoredUnit(studentId: string, title: string, fileUrl: string, fileName?: string): TailoredUnit {
  const unit: TailoredUnit = {
    id: `TC-${studentId}-${Date.now()}`,
    student_id: studentId,
    title,
    file_url: fileUrl,
    file_name: fileName,
    created_at: new Date().toISOString(),
  };
  safeWrite([...safeRead(), unit]);
  return unit;
}

export function updateTailoredUnit(id: string, patch: Partial<Omit<TailoredUnit, "id" | "student_id" | "created_at">>) {
  safeWrite(safeRead().map((u) => (u.id === id ? { ...u, ...patch } : u)));
}

export function removeTailoredUnit(id: string) {
  safeWrite(safeRead().filter((u) => u.id !== id));
}

export function subscribeTailoredUnits(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* -------------------- Per-unit completion (Tailored Content) --------------
 * A Tailored Content unit is "done" when a completed Performance Session is
 * linked to it via LessonPlan.tailored_unit_id. Same shape as VIP completion
 * but with a fully separate storage key.
 */
export interface TailoredUnitCompletion {
  session_id: string;
  completed_at: string;
}

const COMPLETION_KEY = "verbo:tailored-content-completion";
const COMPLETION_EVENT = "verbo:tailored-content-completion-updated";

function readCompletion(): Record<string, TailoredUnitCompletion> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(COMPLETION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TailoredUnitCompletion>) : {};
  } catch { return {}; }
}
function writeCompletion(map: Record<string, TailoredUnitCompletion>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPLETION_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(COMPLETION_EVENT));
  } catch { /* noop */ }
}

export function tailoredUnitDoneMap(): Record<string, TailoredUnitCompletion> {
  return readCompletion();
}

export function isTailoredUnitDone(unitId: string): boolean {
  return !!readCompletion()[unitId];
}

export function markTailoredUnitDone(unitId: string, sessionId: string) {
  const map = readCompletion();
  for (const [uid, rec] of Object.entries(map)) {
    if (rec.session_id === sessionId && uid !== unitId) delete map[uid];
  }
  map[unitId] = { session_id: sessionId, completed_at: new Date().toISOString() };
  writeCompletion(map);
}

export function clearTailoredUnitDoneForSession(sessionId: string) {
  const map = readCompletion();
  let changed = false;
  for (const [uid, rec] of Object.entries(map)) {
    if (rec.session_id === sessionId) { delete map[uid]; changed = true; }
  }
  if (changed) writeCompletion(map);
}

export function subscribeTailoredUnitCompletion(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === COMPLETION_KEY) cb(); };
  window.addEventListener(COMPLETION_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(COMPLETION_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
