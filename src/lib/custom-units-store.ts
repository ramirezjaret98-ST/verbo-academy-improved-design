// Unified store for teacher-authored, per-student custom units.
// Both VIP Course Builder units and Tailored Content units are stored here
// as a single CustomUnit type, distinguished by `kind`.
// vip-courses-store.ts and tailored-content-store.ts are thin wrappers.

export type CustomUnitKind = "vip" | "tailored";

export interface CustomUnit {
  id: string; // VIP-<studentId>-<ts> | TC-<studentId>-<ts>
  student_id: string;
  title: string;
  file_url: string;
  file_name?: string;
  created_at: string;
  kind: CustomUnitKind;
  /** Explicit ordering within a (kind, student). Falls back to created_at. */
  order?: number;
}

const KEY = "verbo:custom-units";
export const CUSTOM_UNITS_EVENT = "verbo:custom-units-updated";

// Legacy keys — read once for migration, never deleted.
const LEGACY_VIP_KEY = "verbo:vip-courses";
const LEGACY_TAILORED_KEY = "verbo:tailored-content";

function readRaw(key: string): CustomUnit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CustomUnit[]) : [];
  } catch { return []; }
}

/* ------------------------- one-shot migration ------------------------- */
let migrated = false;

function migrateLegacyUnits() {
  if (migrated || typeof window === "undefined") return;
  migrated = true;
  try {
    const current = readRaw(KEY);
    const seen = new Set(current.map((u) => u.id));
    const legacy: CustomUnit[] = [
      ...readRaw(LEGACY_VIP_KEY).map((u) => ({ ...u, kind: "vip" as const })),
      ...readRaw(LEGACY_TAILORED_KEY).map((u) => ({ ...u, kind: "tailored" as const })),
    ].filter((u) => u && u.id && !seen.has(u.id));
    if (legacy.length === 0) return;
    localStorage.setItem(KEY, JSON.stringify([...current, ...legacy]));
  } catch { /* noop */ }
}

/* ------------------------------- core --------------------------------- */
function safeRead(): CustomUnit[] {
  if (typeof window === "undefined") return [];
  migrateLegacyUnits();
  return readRaw(KEY);
}

function safeWrite(list: CustomUnit[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(CUSTOM_UNITS_EVENT));
  } catch { /* noop */ }
}

export function loadCustomUnits(kind: CustomUnitKind): CustomUnit[] {
  return safeRead().filter((u) => u.kind === kind);
}

export function customUnitsForStudent(kind: CustomUnitKind, studentId: string): CustomUnit[] {
  return safeRead()
    .filter((u) => u.kind === kind && u.student_id === studentId)
    .sort((a, b) => {
      if (typeof a.order === "number" && typeof b.order === "number") return a.order - b.order;
      return a.created_at.localeCompare(b.created_at);
    });
}

export function addCustomUnit(
  kind: CustomUnitKind,
  studentId: string,
  title: string,
  fileUrl: string,
  fileName?: string,
): CustomUnit {
  const prefix = kind === "vip" ? "VIP" : "TC";
  const all = safeRead();
  const order = all.filter((u) => u.kind === kind && u.student_id === studentId).length;
  const unit: CustomUnit = {
    id: `${prefix}-${studentId}-${Date.now()}`,
    student_id: studentId,
    title,
    file_url: fileUrl,
    file_name: fileName,
    created_at: new Date().toISOString(),
    kind,
    order,
  };
  safeWrite([...all, unit]);
  return unit;
}

/** Appends already-validated units in a single write + single event. */
export function addCustomUnitsBulk(units: CustomUnit[]): void {
  if (units.length === 0) return;
  safeWrite([...safeRead(), ...units]);
}

/**
 * Validates a raw JSON array of custom units for bulk upload. Mirrors the
 * style of validateBulkActivities(): per-index errors, never throws.
 */
export function validateBulkUnits(
  raw: unknown[],
  kind: CustomUnitKind,
  studentId: string,
): { valid: CustomUnit[]; errs: string[] } {
  const valid: CustomUnit[] = [];
  const errs: string[] = [];
  const str = (v: unknown) => sanitizeText(v);
  const prefix = kind === "vip" ? "VIP" : "TC";
  const base = safeRead().filter((u) => u.kind === kind && u.student_id === studentId).length;
  let seq = 0;
  const ts = Date.now();

  raw.forEach((item, i) => {
    const tag = `#${i}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errs.push(`${tag}: el item no es un objeto.`);
      return;
    }
    const o = item as Record<string, unknown>;
    const title = str(o.title);
    if (!title) { errs.push(`${tag}: falta title.`); return; }
    const fileUrl = typeof o.file_url === "string" ? o.file_url.trim() : "";
    const fileName = o.file_name !== undefined ? str(o.file_name) : undefined;
    const order = typeof o.order === "number" && Number.isFinite(o.order) ? o.order : base + seq;
    seq += 1;
    valid.push({
      id: `${prefix}-${studentId}-${ts}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      student_id: studentId,
      title,
      file_url: fileUrl,
      file_name: fileName,
      created_at: new Date().toISOString(),
      kind,
      order,
    });
  });

  return { valid, errs };
}

export function updateCustomUnit(
  kind: CustomUnitKind,
  id: string,
  patch: Partial<Omit<CustomUnit, "id" | "student_id" | "created_at" | "kind">>,
) {
  safeWrite(safeRead().map((u) => (u.id === id && u.kind === kind ? { ...u, ...patch } : u)));
}

export function removeCustomUnit(kind: CustomUnitKind, id: string) {
  safeWrite(safeRead().filter((u) => !(u.id === id && u.kind === kind)));
}

// Subscribe to unit changes. `legacyKey`/`legacyEvent` keep the old
// per-store event names working for any listener still using them.
export function subscribeCustomUnits(cb: () => void, legacyEvent?: string, legacyKey?: string): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || (legacyKey && e.key === legacyKey)) cb();
  };
  window.addEventListener(CUSTOM_UNITS_EVENT, cb);
  if (legacyEvent) window.addEventListener(legacyEvent, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CUSTOM_UNITS_EVENT, cb);
    if (legacyEvent) window.removeEventListener(legacyEvent, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* -------------------- Per-unit completion (shared shape) --------------- */
export interface CustomUnitCompletion {
  session_id: string;
  completed_at: string; // ISO
}

export function readCompletionMap(key: string): Record<string, CustomUnitCompletion> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, CustomUnitCompletion>) : {};
  } catch { return {}; }
}

export function writeCompletionMap(key: string, event: string, map: Record<string, CustomUnitCompletion>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(event));
  } catch { /* noop */ }
}

export function markCompletion(key: string, event: string, unitId: string, sessionId: string) {
  const map = readCompletionMap(key);
  for (const [uid, rec] of Object.entries(map)) {
    if (rec.session_id === sessionId && uid !== unitId) delete map[uid];
  }
  map[unitId] = { session_id: sessionId, completed_at: new Date().toISOString() };
  writeCompletionMap(key, event, map);
}

export function clearCompletionForSession(key: string, event: string, sessionId: string) {
  const map = readCompletionMap(key);
  let changed = false;
  for (const [uid, rec] of Object.entries(map)) {
    if (rec.session_id === sessionId) { delete map[uid]; changed = true; }
  }
  if (changed) writeCompletionMap(key, event, map);
}

export function subscribeCompletion(key: string, event: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === key) cb(); };
  window.addEventListener(event, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(event, cb);
    window.removeEventListener("storage", onStorage);
  };
}
