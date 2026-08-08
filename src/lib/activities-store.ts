// Activities engine — admin/teacher-authored unit activities plus per-student
// progress (completion, attempts, scores) and the unit unlock/lock audit log.
//
// Backed by Supabase across five tables: `public.activities`,
// `public.activity_completions`, `public.unit_attempts`,
// `public.activity_scores` and `public.unit_access_events`.
//
// Reads of `activities` go through two SECURITY DEFINER RPCs instead of a
// plain select: `activities_for_staff()` (all columns, staff only) and
// `activities_for_student()` (all columns EXCEPT `audio_name`, which is
// internal Admin metadata never rendered to students). Which one to call is
// decided per hydration from the current `app_users.role`. Writes go straight
// to the table (RLS: admin or teacher only).
//
// The other four tables are read with a normal `select("*")` — their RLS
// already scopes rows to self / admin / a teacher of that student.
//
// Same pattern as every store migrated in previous lotes: one global
// in-memory cache per table, hydrated once and kept fresh via Postgres
// Realtime; writes stay optimistic and synchronous in their public signature
// (update the cache + notify immediately, fire the real Supabase call in the
// background, roll the cache back if it fails), so consumer call sites keep
// working unchanged. `student_id`/`actor_id` uuid columns are translated to
// and from the legacy short ids ("u1".."u8") via user-id-bridge.
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
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

/* -------------------- Supabase row mapping -------------------- */

type ActivityTableRow = Database["public"]["Tables"]["activities"]["Row"];
type StaffActivityRow = Database["public"]["Functions"]["activities_for_staff"]["Returns"][number];
type StudentActivityRow = Database["public"]["Functions"]["activities_for_student"]["Returns"][number];
type ActivityRow = ActivityTableRow | StaffActivityRow | StudentActivityRow;
type CompletionRow = Database["public"]["Tables"]["activity_completions"]["Row"];
type UnitAttemptRow = Database["public"]["Tables"]["unit_attempts"]["Row"];
type ScoreRow = Database["public"]["Tables"]["activity_scores"]["Row"];
type AccessEventRow = Database["public"]["Tables"]["unit_access_events"]["Row"];

/** Maps a DB row (table select or either RPC — the student RPC omits
 *  `audio_name` on purpose) to the frontend `Activity` shape. */
function fromActivityRow(row: ActivityRow): Activity {
  const a: Activity = {
    id: String(row.id),
    unit_id: row.unit_id,
    name: row.name,
    type: row.type,
  };
  if (row.category != null) a.category = row.category;
  if (row.session_phase != null) a.session_phase = row.session_phase === "post" ? "post" : "pre";
  if (row.paragraph != null) a.paragraph = row.paragraph;
  if (row.answer != null) a.answer = row.answer;
  if (row.prompt != null) a.prompt = row.prompt;
  if (row.question != null) a.question = row.question;
  if (Array.isArray(row.items)) a.items = row.items as unknown as MatchItem[];
  if (Array.isArray(row.options)) a.options = row.options as unknown as string[];
  if (row.correct_index != null) a.correctIndex = row.correct_index;
  if ("audio_name" in row && row.audio_name != null && row.audio_name !== "") a.audioName = row.audio_name;
  if (row.audio_duration_sec != null) a.audioDurationSec = row.audio_duration_sec;
  if (row.feedback != null) a.feedback = row.feedback;
  // Same citation cleanup the old store applied to persisted rows on load.
  return sanitizeActivity(a);
}

/** Full column set for an insert or a whole-row update. `id` is a bigint
 *  identity generated by the DB and is never sent. */
function toDbColumns(a: Activity): Database["public"]["Tables"]["activities"]["Insert"] {
  return {
    unit_id: a.unit_id,
    name: a.name,
    type: a.type,
    category: a.category ?? null,
    session_phase: a.session_phase ?? "pre",
    paragraph: a.paragraph ?? null,
    answer: a.answer ?? null,
    prompt: a.prompt ?? null,
    question: a.question ?? null,
    items: a.items ? (a.items as unknown as Json) : null,
    options: a.options ? (a.options as unknown as Json) : null,
    correct_index: a.correctIndex ?? null,
    audio_name: a.audioName ? a.audioName : null,
    audio_duration_sec: a.audioDurationSec ?? null,
    feedback: a.feedback ?? null,
  };
}

/* -------------------- Global caches + hydration -------------------- */

export const ACTIVITIES_EVENT = "verbo:activities-updated";

function scopedKey(studentId: string, id: string) { return `${studentId}::${id}`; }

export interface ActivityScore {
  best: number;
  attempts: number;
  lastAt: string;
  /** True as soon as the student submits ANY answer, right or wrong. Lets the
   *  UI tell "answered incorrectly (best = 0)" apart from "never attempted". */
  attempted: boolean;
}

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

let activitiesCache: Activity[] = [];
// The three per-student maps keep the exact legacy shapes, keyed by
// `${legacyStudentId}::${unitId|activityId}` so every old read helper stays
// a trivial lookup. RLS already limits the rows each session can see.
let completionsCache: Record<string, boolean> = {};
let attemptsCache: Record<string, number> = {};
let scoresCache: Record<string, ActivityScore> = {};
let accessEventsCache: UnitAccessEvent[] = [];

let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let lastAuthId: string | null | undefined;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ACTIVITIES_EVENT));
  }
}

/** Role of the signed-in user, straight from `app_users` (there is no
 *  synchronous "current role" accessor outside React). `null` when the
 *  session is not ready yet — treated as "student" for the read RPC. */
async function currentRole(): Promise<"admin" | "teacher" | "student" | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authId = sessionData.session?.user?.id ?? null;
  lastAuthId = authId;
  if (!authId) return null;
  const { data, error } = await supabase.from("app_users").select("role").eq("id", authId).maybeSingle();
  if (error || !data) return null;
  return data.role as "admin" | "teacher" | "student";
}

function fromAccessRow(row: AccessEventRow): UnitAccessEvent {
  return {
    id: String(row.id),
    studentId: uuidToLegacySync(row.student_id),
    unitId: row.unit_id,
    action: row.action,
    actorId: uuidToLegacySync(row.actor_id),
    actorRole: row.actor_role === "teacher" ? "teacher" : "admin",
    at: row.at,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const [, role] = await Promise.all([hydrateUserIdBridge(), currentRole()]);
    // `activities` has no open SELECT path for this store — reads go through
    // role-scoped RPCs so students never receive `audio_name`.
    const activitiesPromise =
      role === "admin" || role === "teacher"
        ? supabase.rpc("activities_for_staff")
        : supabase.rpc("activities_for_student");
    const [actRes, compRes, attRes, scoreRes, accessRes] = await Promise.all([
      activitiesPromise,
      supabase.from("activity_completions").select("*"),
      supabase.from("unit_attempts").select("*"),
      supabase.from("activity_scores").select("*"),
      supabase.from("unit_access_events").select("*"),
    ]);
    if (actRes.error) console.error("[activities-store] failed to load activities", actRes.error);
    if (compRes.error) console.error("[activities-store] failed to load completions", compRes.error);
    if (attRes.error) console.error("[activities-store] failed to load unit attempts", attRes.error);
    if (scoreRes.error) console.error("[activities-store] failed to load scores", scoreRes.error);
    if (accessRes.error) console.error("[activities-store] failed to load unit access events", accessRes.error);

    activitiesCache = ((actRes.data ?? []) as ActivityRow[]).map(fromActivityRow);

    const comp: Record<string, boolean> = {};
    for (const row of (compRes.data ?? []) as CompletionRow[]) {
      comp[scopedKey(uuidToLegacySync(row.student_id), row.unit_id)] = row.completed;
    }
    completionsCache = comp;

    const att: Record<string, number> = {};
    for (const row of (attRes.data ?? []) as UnitAttemptRow[]) {
      att[scopedKey(uuidToLegacySync(row.student_id), row.unit_id)] = row.attempts;
    }
    attemptsCache = att;

    const scores: Record<string, ActivityScore> = {};
    for (const row of (scoreRes.data ?? []) as ScoreRow[]) {
      scores[scopedKey(uuidToLegacySync(row.student_id), String(row.activity_id))] = {
        best: Number(row.best),
        attempts: row.attempts,
        lastAt: row.last_at ?? "",
        attempted: row.attempted,
      };
    }
    scoresCache = scores;

    accessEventsCache = ((accessRes.data ?? []) as AccessEventRow[])
      .map(fromAccessRow)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate();
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("activities-store-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, invalidateAndRehydrate)
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_completions" }, invalidateAndRehydrate)
    .on("postgres_changes", { event: "*", schema: "public", table: "unit_attempts" }, invalidateAndRehydrate)
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_scores" }, invalidateAndRehydrate)
    .on("postgres_changes", { event: "*", schema: "public", table: "unit_access_events" }, invalidateAndRehydrate)
    .subscribe();
}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly so plain (non-hook) readers like
  // `loadActivities()` have data available as soon as possible.
  void hydrate();
  ensureRealtime();
  // The activities read is ROLE-dependent (staff vs student RPC), so unlike
  // the RLS-only stores this one must re-hydrate when the auth identity
  // changes (login/logout after the eager module-load hydration).
  supabase.auth.onAuthStateChange((_event, session) => {
    const authId = session?.user?.id ?? null;
    if (authId !== lastAuthId) {
      lastAuthId = authId;
      invalidateAndRehydrate();
    }
  });
}

/** Subscribe to any change in this store's caches (all five tables notify the
 *  same listener set, mirroring how the old single-event store behaved). */
export function subscribeActivities(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

/* -------------------- Activities -------------------- */

export function loadActivities(): Activity[] {
  return activitiesCache;
}

export function activitiesForUnit(unitId: string): Activity[] {
  return activitiesCache.filter((a) => a.unit_id === unitId);
}

export function phaseOf(a: Activity): SessionPhase {
  return a.session_phase ?? "pre";
}


export function addActivity(a: Activity) {
  const clean = sanitizeActivity(a);
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const optimistic: Activity = { ...clean, id: tempId };
  activitiesCache = [...activitiesCache, optimistic];
  notify();

  void (async () => {
    const { data, error } = await supabase
      .from("activities")
      .insert(toDbColumns(clean))
      .select()
      .single();
    if (error || !data) {
      console.error("[activities-store] failed to add activity", error);
      activitiesCache = activitiesCache.filter((x) => x.id !== tempId);
      notify();
      return;
    }
    const saved = fromActivityRow(data);
    activitiesCache = activitiesCache.map((x) => (x.id === tempId ? saved : x));
    notify();
  })();
}

/** Appends already-validated activities in a single optimistic update + a
 *  single bulk insert (replaces the old
 *  `saveActivities([...loadActivities(), ...parsed])` full-array rewrite).
 *  Returns once the write has actually round-tripped (success or failure) so
 *  callers can show an accurate result instead of an optimistic guess. */
export async function addActivitiesBulk(
  activities: Activity[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (activities.length === 0) return { ok: true, count: 0 };
  const cleaned = activities.map(sanitizeActivity);
  const tempActivities = cleaned.map((a) => ({
    ...a,
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }));
  activitiesCache = [...activitiesCache, ...tempActivities];
  notify();

  const { data, error } = await supabase
    .from("activities")
    .insert(cleaned.map(toDbColumns))
    .select();
  const tempIds = new Set(tempActivities.map((a) => a.id));
  if (error || !data) {
    console.error("[activities-store] failed to bulk-add activities", error);
    activitiesCache = activitiesCache.filter((a) => !tempIds.has(a.id));
    notify();
    return { ok: false, error: error?.message || "The import failed — please try again." };
  }
  const saved = data.map(fromActivityRow);
  activitiesCache = [...activitiesCache.filter((a) => !tempIds.has(a.id)), ...saved];
  notify();
  return { ok: true, count: saved.length };
}

/** Updates an existing activity in place. `id` and `unit_id` are never
 *  overwritten, so an edit (e.g. attaching audio to a bulk-imported
 *  listen_select) keeps the rest of its saved configuration. */
export function updateActivity(id: string, patch: Partial<Omit<Activity, "id" | "unit_id">>) {
  const existing = activitiesCache.find((a) => a.id === id);
  if (!existing) return;
  // Same merge semantics as the old `{ ...a, ...patch }`: keys present with
  // an `undefined` value clear the field, absent keys keep the saved value.
  const merged = sanitizeActivity({ ...existing, ...patch, id: existing.id, unit_id: existing.unit_id });
  const prev = activitiesCache;
  activitiesCache = activitiesCache.map((a) => (a.id === id ? merged : a));
  notify();

  void (async () => {
    const { error } = await supabase
      .from("activities")
      .update(toDbColumns(merged))
      .eq("id", Number(id));
    if (error) {
      console.error("[activities-store] failed to update activity", error);
      activitiesCache = prev;
      notify();
    }
  })();
}


export function removeActivity(id: string) {
  const prev = activitiesCache;
  activitiesCache = activitiesCache.filter((a) => a.id !== id);
  notify();

  void (async () => {
    const { error } = await supabase.from("activities").delete().eq("id", Number(id));
    if (error) {
      console.error("[activities-store] failed to delete activity", error);
      activitiesCache = prev;
      notify();
    }
  })();
}

/* ---- Completion + attempts (scoped per student) ---- */

export function loadCompletion(_studentId: string): Record<string, boolean> {
  // Returns the raw Record keyed by `${studentId}::${unitId}`; kept for
  // callers that want to enumerate. Prefer setUnitCompleted / unitPassed.
  return completionsCache;
}
export function setUnitCompleted(studentId: string, unitId: string, value: boolean) {
  const k = scopedKey(studentId, unitId);
  const hadKey = k in completionsCache;
  const prevValue = completionsCache[k];
  completionsCache = { ...completionsCache, [k]: value };
  notify();

  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) {
      console.error("[activities-store] no app_users row for legacy id", studentId);
      rollback();
      return;
    }
    const { error } = await supabase
      .from("activity_completions")
      .upsert({ student_id: studentUuid, unit_id: unitId, completed: value }, { onConflict: "student_id,unit_id" });
    if (error) {
      console.error("[activities-store] failed to set unit completion", error);
      rollback();
    }
  })();

  function rollback() {
    const next = { ...completionsCache };
    if (hadKey) next[k] = prevValue;
    else delete next[k];
    completionsCache = next;
    notify();
  }
}

export function loadAttempts(_studentId: string): Record<string, number> {
  return attemptsCache;
}
export function incrementAttempts(studentId: string, unitId: string): number {
  const k = scopedKey(studentId, unitId);
  const hadKey = k in attemptsCache;
  const prevValue = attemptsCache[k];
  const next = (attemptsCache[k] ?? 0) + 1;
  attemptsCache = { ...attemptsCache, [k]: next };
  notify();

  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) {
      console.error("[activities-store] no app_users row for legacy id", studentId);
      rollback();
      return;
    }
    const { error } = await supabase
      .from("unit_attempts")
      .upsert({ student_id: studentUuid, unit_id: unitId, attempts: next }, { onConflict: "student_id,unit_id" });
    if (error) {
      console.error("[activities-store] failed to increment unit attempts", error);
      rollback();
    }
  })();

  function rollback() {
    const restored = { ...attemptsCache };
    if (hadKey) restored[k] = prevValue;
    else delete restored[k];
    attemptsCache = restored;
    notify();
  }

  return next;
}
export function resetAttempts(studentId: string, unitId: string) {
  const k = scopedKey(studentId, unitId);
  const hadKey = k in attemptsCache;
  const prevValue = attemptsCache[k];
  if (hadKey) {
    const next = { ...attemptsCache };
    delete next[k];
    attemptsCache = next;
    notify();
  }

  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) {
      console.error("[activities-store] no app_users row for legacy id", studentId);
      return;
    }
    // Mirrors the old `delete a[key]`: the row is removed, not zeroed.
    const { error } = await supabase
      .from("unit_attempts")
      .delete()
      .eq("student_id", studentUuid)
      .eq("unit_id", unitId);
    if (error) {
      console.error("[activities-store] failed to reset unit attempts", error);
      if (hadKey) {
        attemptsCache = { ...attemptsCache, [k]: prevValue };
        notify();
      }
    }
  })();
}

/* ---- Per-activity best scores (scoped per student) ---- */

export function loadActivityScores(_studentId: string): Record<string, ActivityScore> {
  return scoresCache;
}
export function recordActivityScore(studentId: string, activityId: string, score: number): ActivityScore {
  const k = scopedKey(studentId, activityId);
  const hadKey = k in scoresCache;
  const prevValue = scoresCache[k];
  const cur = scoresCache[k] ?? { best: 0, attempts: 0, lastAt: "", attempted: false };
  const next: ActivityScore = {
    best: Math.max(cur.best, Math.round(score)),
    attempts: cur.attempts + 1,
    lastAt: new Date().toISOString(),
    attempted: true,
  };
  scoresCache = { ...scoresCache, [k]: next };
  notify();

  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) {
      console.error("[activities-store] no app_users row for legacy id", studentId);
      rollback();
      return;
    }
    const { error } = await supabase
      .from("activity_scores")
      .upsert(
        {
          student_id: studentUuid,
          activity_id: Number(activityId),
          best: next.best,
          attempts: next.attempts,
          attempted: next.attempted,
          last_at: next.lastAt,
        },
        { onConflict: "student_id,activity_id" },
      );
    if (error) {
      console.error("[activities-store] failed to record activity score", error);
      rollback();
    }
  })();

  function rollback() {
    const restored = { ...scoresCache };
    if (hadKey) restored[k] = prevValue;
    else delete restored[k];
    scoresCache = restored;
    notify();
  }

  return next;
}
export function bestScoreFor(studentId: string, activityId: string): number {
  return scoresCache[scopedKey(studentId, activityId)]?.best ?? 0;
}
/** Whether the student already submitted an answer for this activity.
 *  Legacy records without the flag fall back to their attempt counter. */
export function wasAttempted(studentId: string, activityId: string): boolean {
  const s = scoresCache[scopedKey(studentId, activityId)];
  if (!s) return false;
  return s.attempted ?? s.attempts > 0;
}

/**
 * Restarts a unit for a student: clears the unit attempt counter (reusing
 * `resetAttempts`) and clears the `attempted` flag of every activity in the
 * unit so they can be answered again from scratch. Best scores are preserved.
 */
export function resetUnitActivityAttempts(studentId: string, unitId: string) {
  resetAttempts(studentId, unitId);
  const ids = new Set(activitiesForUnit(unitId).map((a) => a.id));
  const toClear: string[] = [];
  const nextScores = { ...scoresCache };
  let changed = false;
  for (const id of ids) {
    const k = scopedKey(studentId, id);
    const s = nextScores[k];
    if (s && (s.attempted ?? s.attempts > 0)) {
      nextScores[k] = { ...s, attempted: false };
      toClear.push(id);
      changed = true;
    }
  }
  if (!changed) return;
  const prev = scoresCache;
  scoresCache = nextScores;
  notify();

  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) {
      console.error("[activities-store] no app_users row for legacy id", studentId);
      scoresCache = prev;
      notify();
      return;
    }
    const { error } = await supabase
      .from("activity_scores")
      .update({ attempted: false })
      .eq("student_id", studentUuid)
      .in("activity_id", toClear.map(Number));
    if (error) {
      console.error("[activities-store] failed to reset activity attempts", error);
      scoresCache = prev;
      notify();
    }
  })();
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

export function loadUnitAccessLog(): UnitAccessEvent[] {
  return accessEventsCache;
}
export function setUnitAccess(
  studentId: string,
  unitId: string,
  action: UnitAccessAction,
  actorId: string,
  actorRole: "admin" | "teacher",
): void {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const optimistic: UnitAccessEvent = {
    id: tempId,
    studentId, unitId, action, actorId, actorRole,
    at: new Date().toISOString(),
  };
  accessEventsCache = [...accessEventsCache, optimistic];
  notify();

  void (async () => {
    const [studentUuid, actorUuid] = await Promise.all([legacyToUuid(studentId), legacyToUuid(actorId)]);
    if (!studentUuid || !actorUuid) {
      console.error("[activities-store] no app_users row for legacy id", !studentUuid ? studentId : actorId);
      accessEventsCache = accessEventsCache.filter((e) => e.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("unit_access_events")
      .insert({
        student_id: studentUuid,
        unit_id: unitId,
        action,
        actor_id: actorUuid,
        actor_role: actorRole,
        at: optimistic.at,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("[activities-store] failed to log unit access event", error);
      accessEventsCache = accessEventsCache.filter((e) => e.id !== tempId);
      notify();
      return;
    }
    const saved = fromAccessRow(data);
    accessEventsCache = accessEventsCache.map((e) => (e.id === tempId ? saved : e));
    notify();
  })();
}
export function getUnitAccessOverride(studentId: string, unitId: string): UnitAccessAction | null {
  // The MOST RECENT event by `at` wins — Realtime/hydration arrival order is
  // not guaranteed to be chronological, so compare timestamps explicitly.
  let latest: UnitAccessEvent | null = null;
  for (const e of accessEventsCache) {
    if (e.studentId !== studentId || e.unitId !== unitId) continue;
    if (!latest || new Date(e.at).getTime() >= new Date(latest.at).getTime()) latest = e;
  }
  return latest ? latest.action : null;
}
/** Backwards-compatible wrapper for existing callers. */
export function isMilestoneUnlocked(studentId: string, unitId: string): boolean {
  return getUnitAccessOverride(studentId, unitId) === "unlocked";
}

/** Attempts recorded against a given activity, for gating milestone retries. */
export function attemptsFor(studentId: string, activityId: string): number {
  return scoresCache[scopedKey(studentId, activityId)]?.attempts ?? 0;
}

/* ---- Unit pass rule ----
 * A unit is "passed" when every mandatory category present in that unit
 * has at least one activity with best score ≥ 60 for THAT student. Units
 * without any mandatory activity fall back to the legacy completion flag
 * (admin override / seed), also scoped per student.
 */
export function unitPassed(studentId: string, unitId: string): boolean {
  const list = activitiesForUnit(unitId);
  const byCat = new Map<string, Activity[]>();
  for (const a of list) {
    if (!isMandatoryCategory(a.category)) continue;
    const arr = byCat.get(a.category!) ?? [];
    arr.push(a);
    byCat.set(a.category!, arr);
  }
  if (byCat.size === 0) {
    return !!completionsCache[scopedKey(studentId, unitId)];
  }
  for (const [, arr] of byCat) {
    const ok = arr.some((a) => (scoresCache[scopedKey(studentId, a.id)]?.best ?? 0) >= 60);
    if (!ok) return false;
  }
  return true;
}

/** Same rule as `unitPassed`, but a unit with NO mandatory activity configured
 *  is never considered passed (no legacy completion-flag fallback). Use this
 *  for medal/mission math so overrides and seeds can't award medals. */
export function unitPassedByActivities(studentId: string, unitId: string): boolean {
  const list = activitiesForUnit(unitId);
  const byCat = new Map<string, Activity[]>();
  for (const a of list) {
    if (!isMandatoryCategory(a.category)) continue;
    const arr = byCat.get(a.category!) ?? [];
    arr.push(a);
    byCat.set(a.category!, arr);
  }
  if (byCat.size === 0) return false;
  for (const [, arr] of byCat) {
    const ok = arr.some((a) => (scoresCache[scopedKey(studentId, a.id)]?.best ?? 0) >= 60);
    if (!ok) return false;
  }
  return true;
}

export function unitCategoryProgress(studentId: string, unitId: string): {
  category: string; passed: boolean; best: number; mandatory: boolean;
}[] {
  const list = activitiesForUnit(unitId);
  const byCat = new Map<string, Activity[]>();
  for (const a of list) {
    const cat = a.category ?? "uncategorized";
    const arr = byCat.get(cat) ?? [];
    arr.push(a);
    byCat.set(cat, arr);
  }
  return Array.from(byCat.entries()).map(([category, arr]) => {
    const best = arr.reduce((m, a) => Math.max(m, scoresCache[scopedKey(studentId, a.id)]?.best ?? 0), 0);
    const mandatory = isMandatoryCategory(category);
    return { category, best, mandatory, passed: mandatory ? best >= 60 : true };
  });
}

export function renameUnitReferences(oldUnitId: string, newUnitId: string) {
  const prevActivities = activitiesCache;
  const prevCompletions = completionsCache;
  const prevAttempts = attemptsCache;

  activitiesCache = activitiesCache.map((a) =>
    a.unit_id === oldUnitId ? { ...a, unit_id: newUnitId } : a,
  );

  // Completion + attempts keys are `${studentId}::${unitId}`. Rewrite any
  // key ending in `::${oldUnitId}`, preserving the studentId prefix.
  const rewriteKeys = <T,>(map: Record<string, T>): Record<string, T> => {
    const next: Record<string, T> = {};
    for (const [k, v] of Object.entries(map)) {
      if (k.endsWith(`::${oldUnitId}`)) {
        const prefix = k.slice(0, k.length - oldUnitId.length);
        next[`${prefix}${newUnitId}`] = v;
      } else {
        next[k] = v;
      }
    }
    return next;
  };
  completionsCache = rewriteKeys(prevCompletions);
  attemptsCache = rewriteKeys(prevAttempts);
  notify();

  void (async () => {
    const [actRes, compRes, attRes] = await Promise.all([
      supabase.from("activities").update({ unit_id: newUnitId }).eq("unit_id", oldUnitId),
      supabase.from("activity_completions").update({ unit_id: newUnitId }).eq("unit_id", oldUnitId),
      supabase.from("unit_attempts").update({ unit_id: newUnitId }).eq("unit_id", oldUnitId),
    ]);
    if (actRes.error || compRes.error || attRes.error) {
      console.error(
        "[activities-store] failed to rename unit references",
        actRes.error ?? compRes.error ?? attRes.error,
      );
      activitiesCache = prevActivities;
      completionsCache = prevCompletions;
      attemptsCache = prevAttempts;
      notify();
    }
  })();
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
