// Mock activities engine — persisted to localStorage so admin edits + student
// progress survive reloads without a backend.
import { loadLevels } from "./courses-store";
import type { CourseLevel } from "./product-courses-store";

export type ExerciseType =
  | "fill_gaps"
  | "drag_drop"
  | "listen_select"
  | "read_select"
  | "record"
  | "read_complete"
  | "match";

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  fill_gaps: "Fill in the gaps",
  drag_drop: "Drag and drop",
  listen_select: "Listen and select",
  read_select: "Read and select",
  record: "Record yourself",
  read_complete: "Read and complete",
  match: "Match",
};

// ----- Categories (independent from Exercise Type) -----
export type ActivityCategory = string; // free-string so admin can extend the list.

export const MANDATORY_CATEGORIES = ["vocabulary", "grammar", "practice"] as const;
export const OPTIONAL_CATEGORIES = ["reading", "writing", "pronunciation"] as const;
export const DEFAULT_CATEGORIES: ActivityCategory[] = [
  ...MANDATORY_CATEGORIES,
  ...OPTIONAL_CATEGORIES,
];
export const CATEGORY_LABELS: Record<string, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  practice: "Practice",
  reading: "Reading",
  writing: "Writing",
  pronunciation: "Pronunciation",
};
export function categoryLabel(id?: ActivityCategory): string {
  if (!id) return "Uncategorized";
  return CATEGORY_LABELS[id] ?? id.slice(0, 1).toUpperCase() + id.slice(1);
}
export function isMandatoryCategory(id?: ActivityCategory): boolean {
  return !!id && (MANDATORY_CATEGORIES as readonly string[]).includes(id);
}

export interface MatchItem {
  text: string;
  key: string;
}

export type SessionPhase = "pre" | "post";

export interface Activity {
  id: string;
  unit_id: string;
  name: string;
  type: ExerciseType;
  category?: ActivityCategory;
  session_phase?: SessionPhase; // defaults to "pre" for legacy activities
  // fill_gaps / read_complete
  paragraph?: string;
  answer?: string;
  // drag_drop / match
  items?: MatchItem[];
  // read_select / listen_select
  prompt?: string;
  audioName?: string; // listen_select only (mock placeholder) — INTERNAL Admin metadata, never rendered to students
  audioDurationSec?: number; // listen_select only — auto-detected from the uploaded file, never manual
  question?: string;
  options?: string[];
  correctIndex?: number;
  /** Free text shown to the student when the answer is incorrect — explains WHY. */
  feedback?: string;
}

const EXERCISE_TYPES: ExerciseType[] = [
  "fill_gaps", "drag_drop", "listen_select", "read_select", "record", "read_complete", "match",
];

/* ---- Text sanitization ----
 * Removes AI/Docs citation artifacts such as "[cite: 2]", "[cite:12]",
 * "[citation: 4]" or "[1]" footnote markers glued to the text. Deliberately
 * conservative: only bracket groups that are a citation keyword + number, or a
 * bare number, are stripped — any other bracket content (e.g. "[blank]") stays.
 */
const CITATION_RE = /\s*\[\s*(?:cite|citation|source|ref)\s*:?\s*\d+(?:\s*[,;-]\s*\d+)*\s*\]/gi;
const BARE_FOOTNOTE_RE = /\s*\[\s*\d+(?:\s*[,;-]\s*\d+)*\s*\]/g;

/** Trims and strips citation artifacts from a text value. Idempotent. */
export function sanitizeText(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(CITATION_RE, "")
    .replace(BARE_FOOTNOTE_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Applies `sanitizeText` to every text field of an activity. No other field
 *  is touched, and running it twice produces the same object content. */
export function sanitizeActivity(a: Activity): Activity {
  const out: Activity = { ...a };
  out.name = sanitizeText(a.name);
  if (a.paragraph !== undefined) out.paragraph = sanitizeText(a.paragraph);
  if (a.answer !== undefined) out.answer = sanitizeText(a.answer);
  if (a.prompt !== undefined) out.prompt = sanitizeText(a.prompt);
  if (a.question !== undefined) out.question = sanitizeText(a.question);
  if (a.feedback !== undefined) out.feedback = sanitizeText(a.feedback);
  if (a.items) out.items = a.items.map((i) => ({ text: sanitizeText(i.text), key: sanitizeText(i.key) }));
  if (a.options) out.options = a.options.map((o) => sanitizeText(o));
  return out;
}

/**
 * Validates a raw JSON array of activities for bulk upload. Returns the valid
 * Activity objects plus a descriptive error per rejected item.
 * NOTE: audioName / audioDurationSec are intentionally ignored — audio is
 * always attached manually in Admin after the import.
 */
export function validateBulkActivities(raw: unknown[], unitId: string): { valid: Activity[]; errs: string[] } {
  const valid: Activity[] = [];
  const errs: string[] = [];
  const str = (v: unknown) => sanitizeText(v);


  raw.forEach((item, i) => {
    const tag = `#${i}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errs.push(`${tag}: el item no es un objeto.`);
      return;
    }
    const o = item as Record<string, unknown>;
    const name = str(o.name);
    const type = str(o.type) as ExerciseType;
    if (!name) { errs.push(`${tag}: missing name.`); return; }
    if (!type) { errs.push(`${tag}: missing type.`); return; }
    if (!EXERCISE_TYPES.includes(type)) { errs.push(`${tag}: invalid type "${type}".`); return; }

    const base: Activity = {
      id: `act-bulk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      unit_id: unitId,
      name,
      type,
    };
    // Same normalization as the manual form: categories are stored lowercase.
    const category = str(o.category).toLowerCase();
    if (category) base.category = category;
    if (o.session_phase !== undefined) base.session_phase = o.session_phase === "post" ? "post" : "pre";
    const feedback = str(o.feedback);
    if (feedback) base.feedback = feedback;

    if (type === "fill_gaps" || type === "read_complete") {
      const paragraph = str(o.paragraph);
      const answer = str(o.answer);
      if (!paragraph || !answer) { errs.push(`${tag}: ${type} requires paragraph and answer.`); return; }
      base.paragraph = paragraph;
      base.answer = answer;
    } else if (type === "drag_drop" || type === "match") {
      const rawItems = Array.isArray(o.items) ? (o.items as unknown[]) : [];
      const cleaned: MatchItem[] = [];
      for (const it of rawItems) {
        if (!it || typeof it !== "object") continue;
        const t = str((it as Record<string, unknown>).text);
        const k = str((it as Record<string, unknown>).key);
        if (t && k) cleaned.push({ text: t, key: k });
      }
      if (cleaned.length < 2) { errs.push(`${tag}: ${type} requires at least 2 items with text and key.`); return; }
      base.items = cleaned;
    } else if (type === "read_select" || type === "listen_select") {
      const question = str(o.question);
      const rawOptions = Array.isArray(o.options) ? (o.options as unknown[]) : [];
      const options = rawOptions.map((x) => str(x)).filter(Boolean);
      if (!question) { errs.push(`${tag}: ${type} requires question.`); return; }
      if (options.length < 2) { errs.push(`${tag}: ${type} requires at least 2 options.`); return; }
      const ci = o.correctIndex;
      if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= options.length) {
        errs.push(`${tag}: correctIndex must be a number within the range of options.`);
        return;
      }
      const prompt = str(o.prompt);
      if (prompt) base.prompt = prompt;
      base.question = question;
      base.options = options;
      base.correctIndex = ci;
    } else if (type === "record") {
      const answer = str(o.answer);
      if (!answer) { errs.push(`${tag}: record requiere answer.`); return; }
      base.answer = answer;
    }

    valid.push(base);
  });

  return { valid, errs };
}

const ACTIVITIES_KEY = "verbo:activities";
const COMPLETION_KEY = "verbo:unit-completion";
const ATTEMPTS_KEY = "verbo:unit-attempts";
const SCORES_KEY = "verbo:activity-scores";
const UNIT_ACCESS_LOG_KEY = "verbo:unit-access-log";

function safeRead<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; }
  catch { return fallback; }
}
function safeWrite(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* noop */ }
}

const SEED: Activity[] = [
  { id: "act-seed-1", unit_id: "A1-U1", name: "Greeting basics", type: "fill_gaps", category: "vocabulary", paragraph: "Hello, my [blank] is Sarah.", answer: "name" },
  { id: "act-seed-2", unit_id: "A1-U1", name: "Pick the greeting", type: "read_select", category: "grammar", prompt: "Morning at the office.", question: "Which greeting fits best?", options: ["Good night", "Good morning", "See you", "Bye"], correctIndex: 1 },
  { id: "act-seed-3", unit_id: "A1-U1", name: "Say it out loud", type: "record", category: "practice", answer: "Nice to meet you." },
];

/** One-time cleanup of citation artifacts on activities already persisted in
 *  localStorage. Runs at most once per page load and only writes when at least
 *  one field actually changed, so it is fully idempotent. */
let citationCleanupDone = false;
function cleanupStoredActivities(stored: Activity[]): Activity[] {
  if (citationCleanupDone) return stored;
  citationCleanupDone = true;
  const cleaned = stored.map((a) => sanitizeActivity(a));
  if (JSON.stringify(cleaned) !== JSON.stringify(stored)) {
    safeWrite(ACTIVITIES_KEY, cleaned);
    return cleaned;
  }
  return stored;
}

export function loadActivities(): Activity[] {
  const stored = safeRead<Activity[] | null>(ACTIVITIES_KEY, null);
  if (stored) return cleanupStoredActivities(stored);
  safeWrite(ACTIVITIES_KEY, SEED);
  return SEED;
}
export function saveActivities(list: Activity[]) { safeWrite(ACTIVITIES_KEY, list); }

export function activitiesForUnit(unitId: string): Activity[] {
  return loadActivities().filter((a) => a.unit_id === unitId);
}

export function phaseOf(a: Activity): SessionPhase {
  return a.session_phase ?? "pre";
}


export function addActivity(a: Activity) {
  const list = loadActivities();
  list.push(sanitizeActivity(a));
  saveActivities(list);
}

/** Updates an existing activity in place. `id` and `unit_id` are never
 *  overwritten, so an edit (e.g. attaching audio to a bulk-imported
 *  listen_select) keeps the rest of its saved configuration. */
export function updateActivity(id: string, patch: Partial<Omit<Activity, "id" | "unit_id">>) {
  saveActivities(
    loadActivities().map((a) =>
      a.id === id ? sanitizeActivity({ ...a, ...patch, id: a.id, unit_id: a.unit_id }) : a,
    ),
  );
}


export function removeActivity(id: string) {
  saveActivities(loadActivities().filter((a) => a.id !== id));
}

/* ---- Completion + attempts (scoped per student) ---- */
function scopedKey(studentId: string, id: string) { return `${studentId}::${id}`; }

export function loadCompletion(_studentId: string): Record<string, boolean> {
  // Returns the raw Record keyed by `${studentId}::${unitId}`; kept for
  // callers that want to enumerate. Prefer setUnitCompleted / unitPassed.
  return safeRead<Record<string, boolean>>(COMPLETION_KEY, {});
}
export function setUnitCompleted(studentId: string, unitId: string, value: boolean) {
  const c = safeRead<Record<string, boolean>>(COMPLETION_KEY, {});
  c[scopedKey(studentId, unitId)] = value;
  safeWrite(COMPLETION_KEY, c);
}

export function loadAttempts(_studentId: string): Record<string, number> {
  return safeRead<Record<string, number>>(ATTEMPTS_KEY, {});
}
export function incrementAttempts(studentId: string, unitId: string): number {
  const a = safeRead<Record<string, number>>(ATTEMPTS_KEY, {});
  const k = scopedKey(studentId, unitId);
  a[k] = (a[k] ?? 0) + 1;
  safeWrite(ATTEMPTS_KEY, a);
  return a[k];
}
export function resetAttempts(studentId: string, unitId: string) {
  const a = safeRead<Record<string, number>>(ATTEMPTS_KEY, {});
  delete a[scopedKey(studentId, unitId)];
  safeWrite(ATTEMPTS_KEY, a);
}

/* ---- Per-activity best scores (scoped per student) ---- */
export interface ActivityScore { best: number; attempts: number; lastAt: string }
export function loadActivityScores(_studentId: string): Record<string, ActivityScore> {
  return safeRead<Record<string, ActivityScore>>(SCORES_KEY, {});
}
export function recordActivityScore(studentId: string, activityId: string, score: number): ActivityScore {
  const all = safeRead<Record<string, ActivityScore>>(SCORES_KEY, {});
  const k = scopedKey(studentId, activityId);
  const cur = all[k] ?? { best: 0, attempts: 0, lastAt: "" };
  const next: ActivityScore = {
    best: Math.max(cur.best, Math.round(score)),
    attempts: cur.attempts + 1,
    lastAt: new Date().toISOString(),
  };
  all[k] = next;
  safeWrite(SCORES_KEY, all);
  return next;
}
export function bestScoreFor(studentId: string, activityId: string): number {
  const all = safeRead<Record<string, ActivityScore>>(SCORES_KEY, {});
  return all[scopedKey(studentId, activityId)]?.best ?? 0;
}

/* ---- Milestone units (10 / 20 / 30) ---- */
export function unitNumberOf(unitId: string): number {
  const m = unitId.match(/-U(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}
export function isMilestoneUnit(unitId: string): boolean {
  const n = unitNumberOf(unitId);
  return n === 10 || n === 20 || n === 30;
}

/* ---- Unit access overrides (generalized for ANY unit) ----
 * A log of unlock/lock events applied by admins or teachers. The most
 * recent event for a (studentId, unitId) pair wins. `null` means no
 * override — the default progression rule applies (milestones locked
 * by default, non-milestones follow sequential order).
 */
export type UnitAccessAction = "unlocked" | "locked";
export interface UnitAccessEvent {
  id: string;
  studentId: string;
  unitId: string;
  action: UnitAccessAction;
  actorId: string;
  actorRole: "admin" | "teacher";
  at: string;
}

export function loadUnitAccessLog(): UnitAccessEvent[] {
  return safeRead<UnitAccessEvent[]>(UNIT_ACCESS_LOG_KEY, []);
}
export function setUnitAccess(
  studentId: string,
  unitId: string,
  action: UnitAccessAction,
  actorId: string,
  actorRole: "admin" | "teacher",
): void {
  const log = loadUnitAccessLog();
  log.push({
    id: `ua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    studentId, unitId, action, actorId, actorRole,
    at: new Date().toISOString(),
  });
  safeWrite(UNIT_ACCESS_LOG_KEY, log);
}
export function getUnitAccessOverride(studentId: string, unitId: string): UnitAccessAction | null {
  const log = loadUnitAccessLog();
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.studentId === studentId && e.unitId === unitId) return e.action;
  }
  return null;
}
/** Backwards-compatible wrapper for existing callers. */
export function isMilestoneUnlocked(studentId: string, unitId: string): boolean {
  return getUnitAccessOverride(studentId, unitId) === "unlocked";
}

/** Attempts recorded against a given activity, for gating milestone retries. */
export function attemptsFor(studentId: string, activityId: string): number {
  const all = safeRead<Record<string, ActivityScore>>(SCORES_KEY, {});
  return all[scopedKey(studentId, activityId)]?.attempts ?? 0;
}

/* ---- Unit pass rule ----
 * A unit is "passed" when every mandatory category present in that unit
 * has at least one activity with best score ≥ 60 for THAT student. Units
 * without any mandatory activity fall back to the legacy completion flag
 * (admin override / seed), also scoped per student.
 */
export function unitPassed(studentId: string, unitId: string): boolean {
  const list = activitiesForUnit(unitId);
  const scores = safeRead<Record<string, ActivityScore>>(SCORES_KEY, {});
  const byCat = new Map<string, Activity[]>();
  for (const a of list) {
    if (!isMandatoryCategory(a.category)) continue;
    const arr = byCat.get(a.category!) ?? [];
    arr.push(a);
    byCat.set(a.category!, arr);
  }
  if (byCat.size === 0) {
    const completion = safeRead<Record<string, boolean>>(COMPLETION_KEY, {});
    return !!completion[scopedKey(studentId, unitId)];
  }
  for (const [, arr] of byCat) {
    const ok = arr.some((a) => (scores[scopedKey(studentId, a.id)]?.best ?? 0) >= 60);
    if (!ok) return false;
  }
  return true;
}

/** Same rule as `unitPassed`, but a unit with NO mandatory activity configured
 *  is never considered passed (no legacy completion-flag fallback). Use this
 *  for medal/mission math so overrides and seeds can't award medals. */
export function unitPassedByActivities(studentId: string, unitId: string): boolean {
  const list = activitiesForUnit(unitId);
  const scores = safeRead<Record<string, ActivityScore>>(SCORES_KEY, {});
  const byCat = new Map<string, Activity[]>();
  for (const a of list) {
    if (!isMandatoryCategory(a.category)) continue;
    const arr = byCat.get(a.category!) ?? [];
    arr.push(a);
    byCat.set(a.category!, arr);
  }
  if (byCat.size === 0) return false;
  for (const [, arr] of byCat) {
    const ok = arr.some((a) => (scores[scopedKey(studentId, a.id)]?.best ?? 0) >= 60);
    if (!ok) return false;
  }
  return true;
}

export function unitCategoryProgress(studentId: string, unitId: string): {
  category: string; passed: boolean; best: number; mandatory: boolean;
}[] {
  const list = activitiesForUnit(unitId);
  const scores = safeRead<Record<string, ActivityScore>>(SCORES_KEY, {});
  const byCat = new Map<string, Activity[]>();
  for (const a of list) {
    const cat = a.category ?? "uncategorized";
    const arr = byCat.get(cat) ?? [];
    arr.push(a);
    byCat.set(cat, arr);
  }
  return Array.from(byCat.entries()).map(([category, arr]) => {
    const best = arr.reduce((m, a) => Math.max(m, scores[scopedKey(studentId, a.id)]?.best ?? 0), 0);
    const mandatory = isMandatoryCategory(category);
    return { category, best, mandatory, passed: mandatory ? best >= 60 : true };
  });
}

export function renameUnitReferences(oldUnitId: string, newUnitId: string) {
  const activities = loadActivities();
  let changed = false;
  for (const a of activities) {
    if (a.unit_id === oldUnitId) {
      a.unit_id = newUnitId;
      changed = true;
    }
  }
  if (changed) saveActivities(activities);

  // Completion + attempts keys are now `${studentId}::${unitId}`. Rewrite any
  // key ending in `::${oldUnitId}`, preserving the studentId prefix.
  const completion = safeRead<Record<string, boolean>>(COMPLETION_KEY, {});
  let compChanged = false;
  for (const k of Object.keys(completion)) {
    if (k.endsWith(`::${oldUnitId}`)) {
      const prefix = k.slice(0, k.length - oldUnitId.length);
      completion[`${prefix}${newUnitId}`] = completion[k];
      delete completion[k];
      compChanged = true;
    }
  }
  if (compChanged) safeWrite(COMPLETION_KEY, completion);

  const attempts = safeRead<Record<string, number>>(ATTEMPTS_KEY, {});
  let attChanged = false;
  for (const k of Object.keys(attempts)) {
    if (k.endsWith(`::${oldUnitId}`)) {
      const prefix = k.slice(0, k.length - oldUnitId.length);
      attempts[`${prefix}${newUnitId}`] = attempts[k];
      delete attempts[k];
      attChanged = true;
    }
  }
  if (attChanged) safeWrite(ATTEMPTS_KEY, attempts);
}

/**
 * Legacy helper — retained for the old A1..B2 mock course view. New Learning
 * Path uses `computeUnitLocks` in student.courses.tsx which is aware of
 * milestone teacher-locks and per-student state.
 */
export function isUnitUnlocked(studentId: string, unitId: string): boolean {
  if (unitPassed(studentId, unitId)) return true;
  for (const lvl of loadLevels()) {
    const idx = lvl.units.findIndex((u) => u.id === unitId);
    if (idx === -1) continue;
    if (idx === 0) return true;
    return unitPassed(studentId, lvl.units[idx - 1].id);
  }
  return true;
}

/**
 * Whether the student has fully completed every unit in the given
 * commercial level. Milestone units require an explicit "unlocked" override
 * or a real pass — a "locked" override on any unit forces the level to
 * count as incomplete. Extracted from student.courses.tsx so multiple
 * screens (Learning Path, Profile Badges) share the exact same rule.
 */
export function levelIsComplete(level: CourseLevel, studentId: string): boolean {
  if (level.units.length === 0) return false;
  for (const u of level.units) {
    const ov = getUnitAccessOverride(studentId, u.id);
    if (ov === "locked") return false;
    if (isMilestoneUnit(u.id) && ov !== "unlocked" && !unitPassed(studentId, u.id)) return false;
    if (!unitPassed(studentId, u.id)) return false;
  }
  return true;
}


