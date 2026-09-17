// Complementary Practice engine — snackable vocabulary/grammar/reading/business/
// speaking/listening exercises that live INDEPENDENTLY of course units. This is
// deliberately a sibling of activities-store.ts / materials-store.ts, not an
// extension of either:
//
// - Like `materials`, content is open-read (Supabase `practice_activities`,
//   RLS: SELECT true for anyone, admin-only writes) — there's no
//   student-hidden column here, so no staff/student RPC split is needed.
// - Like `activity_scores`, per-student tracking (`practice_scores`) is a
//   separate table, optimistic-write with rollback on failure, RLS scoped to
//   admin OR self OR teaches_student(self).
//
// CRITICAL: this store NEVER feeds unit unlock/pass logic. `practice_scores`
// is purely a reference shown back to the student — it must never be read by
// `unitPassed`/`isUnitUnlocked`/`levelIsComplete` in activities-store.ts.
//
// Content/exercise field shapes intentionally reuse the same conventions as
// `Activity` in activities-store.ts (fill_gaps: paragraph+answer; read_select:
// question+options+correctIndex — true/false is just a 2-option read_select,
// multiple choice is a 3+-option one) so the same sanitizeText/grading mental
// model applies. See `evaluatePracticeExercise` below, mirrored 1:1 from the
// `evaluate()` helper in student.courses.tsx for fill_gaps/read_select.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import { sanitizeText } from "@/lib/activities-store";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export type PracticeFormat = "comparativa" | "grid" | "reading" | "carousel";

export const PRACTICE_FORMAT_LABELS: Record<PracticeFormat, string> = {
  comparativa: "Comparativa (VS)",
  grid: "Grid",
  reading: "Ficha de lectura",
  carousel: "Carrusel",
};

// Free-string category, same convention as ActivityCategory/materials
// category — admin-extensible, not a fixed enum.
export type PracticeCategory = string;

// v1 catalog (2026-09-17) — Troubleshooting/Getting Started deliberately
// excluded: those are platform-support categories (tech issues, how-to-use-
// the-app videos), not learning content. Grid/Carousel formats lean on the
// reference-only subcategories (e.g. Study Tips); Comparativa/Reading are the
// ones that always carry an exercise.
export const PRACTICE_CATEGORIES: PracticeCategory[] = [
  "Grammar",
  "Vocabulary",
  "Business",
  "Speaking",
  "Listening",
  "Study Tips",
];

// Product lines a practice card is tagged with. Empty array = universal /
// transversal (mixes vocabulary across lines in one card — Jaret's decision
// 2026-09-17), matching the same `product_id` Postgres enum already used by
// materials.restrict_product and flash-challenges-store's FlashProductId.
export type PracticeProductLine = "go" | "enterprise" | "international" | "vip";

/* ---------------- Exercise (the "check" attached to a card) ---------------- */

// Restricted on purpose to the two auto-gradeable types this engine needs.
// "True/False" and "Multiple choice" are both `read_select` — they only
// differ by how many `options` are given (2 vs 3+).
export type PracticeExerciseType = "fill_gaps" | "read_select";

export interface PracticeExercise {
  type: PracticeExerciseType;
  // fill_gaps — paragraph contains literal "[blank]" markers, same as Activity.
  paragraph?: string;
  answer?: string;
  // read_select — true/false (2 options) or multiple choice (3+ options).
  question?: string;
  options?: string[];
  correctIndex?: number;
  /** Free text shown when the student answers incorrectly. */
  feedback?: string;
  /** Optional hint, rendered in its own box like Activity.hint. */
  hint?: string;
}

/** Mirrors `evaluate()` in student.courses.tsx for fill_gaps/read_select —
 *  same trim+lowercase compare, same Number(value)===correctIndex check. */
export function evaluatePracticeExercise(ex: PracticeExercise, value: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  if (ex.type === "fill_gaps") return norm(value) === norm(ex.answer ?? "");
  if (ex.type === "read_select") return Number(value) === ex.correctIndex;
  return false;
}

/* ---------------- Content (format-specific display payload) ---------------- */

export interface ComparativaPanel {
  tag: string; // "Verb" / "Noun" / "Adjective" / "Phr. verb"...
  word: string;
  definition: string;
  example: string;
  more?: string[]; // extra example bullets
}
export interface ComparativaContent {
  eyebrow?: string; // small context line above the panels
  left: ComparativaPanel;
  right: ComparativaPanel;
}

export interface GridItem {
  phrase: string;
  gloss?: string; // short interpretation (v1 style)
  example?: string; // example in context (v2 style) — a card uses one or the other
}
export interface GridContent {
  items: GridItem[];
}

export interface ReadingVocabItem {
  word: string;
  definition: string;
}
export interface ReadingContent {
  passage: string;
  /** Exact substrings of `passage` to render bold — avoids storing raw HTML. */
  highlights?: string[];
  vocab: ReadingVocabItem[];
}

export interface CarouselContent {
  word: string;
  ipa?: string;
  definition: string;
  example?: string;
}

export type PracticeContent = ComparativaContent | GridContent | ReadingContent | CarouselContent;

export interface PracticeActivity {
  id: string;
  format: PracticeFormat;
  category: PracticeCategory;
  subcategory?: string;
  product_lines: PracticeProductLine[]; // [] = universal
  title: string;
  content: PracticeContent;
  /** 0..N checks. Comparativa: exactly 1. Reading: typically 1-3.
   *  Grid/Carousel: usually [] (reference-only, no check). */
  exercises: PracticeExercise[];
  premium?: boolean;
}

export interface PracticeScore {
  best: number;
  attempts: number;
  lastAt: string;
  attempted: boolean;
}

/* ---------------- Sanitization ---------------- */

function sanitizeExercise(ex: PracticeExercise): PracticeExercise {
  return {
    ...ex,
    paragraph: ex.paragraph !== undefined ? sanitizeText(ex.paragraph) : undefined,
    answer: ex.answer !== undefined ? sanitizeText(ex.answer) : undefined,
    question: ex.question !== undefined ? sanitizeText(ex.question) : undefined,
    options: ex.options ? ex.options.map(sanitizeText) : undefined,
    feedback: ex.feedback !== undefined ? sanitizeText(ex.feedback) : undefined,
    hint: ex.hint !== undefined ? sanitizeText(ex.hint) : undefined,
  };
}

function sanitizePanel(p: ComparativaPanel): ComparativaPanel {
  return {
    tag: sanitizeText(p.tag),
    word: sanitizeText(p.word),
    definition: sanitizeText(p.definition),
    example: sanitizeText(p.example),
    more: p.more?.map(sanitizeText),
  };
}

function sanitizeContent(format: PracticeFormat, content: PracticeContent): PracticeContent {
  if (format === "comparativa") {
    const c = content as ComparativaContent;
    return { eyebrow: c.eyebrow ? sanitizeText(c.eyebrow) : undefined, left: sanitizePanel(c.left), right: sanitizePanel(c.right) };
  }
  if (format === "grid") {
    const c = content as GridContent;
    return { items: c.items.map((i) => ({ phrase: sanitizeText(i.phrase), gloss: i.gloss ? sanitizeText(i.gloss) : undefined, example: i.example ? sanitizeText(i.example) : undefined })) };
  }
  if (format === "reading") {
    const c = content as ReadingContent;
    return {
      passage: sanitizeText(c.passage),
      highlights: c.highlights?.map(sanitizeText),
      vocab: c.vocab.map((v) => ({ word: sanitizeText(v.word), definition: sanitizeText(v.definition) })),
    };
  }
  const c = content as CarouselContent;
  return { word: sanitizeText(c.word), ipa: c.ipa ? sanitizeText(c.ipa) : undefined, definition: sanitizeText(c.definition), example: c.example ? sanitizeText(c.example) : undefined };
}

export function sanitizePracticeActivity(p: PracticeActivity): PracticeActivity {
  return {
    ...p,
    title: sanitizeText(p.title),
    content: sanitizeContent(p.format, p.content),
    exercises: p.exercises.map(sanitizeExercise),
  };
}

/* ---------------- Bulk JSON validation (same spirit as validateBulkActivities) --- */

export function validateBulkPracticeItems(raw: unknown[]): { valid: PracticeActivity[]; errs: string[] } {
  const valid: PracticeActivity[] = [];
  const errs: string[] = [];
  const str = (v: unknown) => sanitizeText(v);
  const isFormat = (v: unknown): v is PracticeFormat => v === "comparativa" || v === "grid" || v === "reading" || v === "carousel";

  raw.forEach((item, i) => {
    const label = `Item ${i + 1}`;
    if (typeof item !== "object" || item === null) { errs.push(`${label}: not an object`); return; }
    const o = item as Record<string, unknown>;
    if (!isFormat(o.format)) { errs.push(`${label}: missing/invalid "format" (comparativa|grid|reading|carousel)`); return; }
    const title = str(o.title);
    const category = str(o.category);
    if (!title) { errs.push(`${label}: missing "title"`); return; }
    if (!category) { errs.push(`${label}: missing "category"`); return; }
    if (o.content == null || typeof o.content !== "object") { errs.push(`${label}: missing "content"`); return; }

    const exercisesRaw = Array.isArray(o.exercises) ? (o.exercises as unknown[]) : [];
    const exercises: PracticeExercise[] = [];
    for (const [ei, exRaw] of exercisesRaw.entries()) {
      if (typeof exRaw !== "object" || exRaw === null) { errs.push(`${label} exercise ${ei + 1}: not an object`); continue; }
      const e = exRaw as Record<string, unknown>;
      if (e.type !== "fill_gaps" && e.type !== "read_select") { errs.push(`${label} exercise ${ei + 1}: invalid "type" (fill_gaps|read_select)`); continue; }
      if (e.type === "fill_gaps" && (!str(e.paragraph) || !str(e.answer))) { errs.push(`${label} exercise ${ei + 1}: fill_gaps needs "paragraph" and "answer"`); continue; }
      if (e.type === "read_select" && (!Array.isArray(e.options) || (e.options as unknown[]).length < 2 || typeof e.correctIndex !== "number")) {
        errs.push(`${label} exercise ${ei + 1}: read_select needs "options" (2+) and numeric "correctIndex"`);
        continue;
      }
      exercises.push(sanitizeExercise({
        type: e.type,
        paragraph: str(e.paragraph) || undefined,
        answer: str(e.answer) || undefined,
        question: str(e.question) || undefined,
        options: Array.isArray(e.options) ? (e.options as unknown[]).map(str) : undefined,
        correctIndex: typeof e.correctIndex === "number" ? e.correctIndex : undefined,
        feedback: str(e.feedback) || undefined,
        hint: str(e.hint) || undefined,
      }));
    }

    const productLinesRaw = Array.isArray(o.product_lines) ? (o.product_lines as unknown[]) : [];
    const product_lines = productLinesRaw.filter((v): v is PracticeProductLine => v === "go" || v === "enterprise" || v === "international" || v === "vip");

    valid.push(sanitizePracticeActivity({
      id: `p${Date.now()}-${i}`,
      format: o.format,
      category,
      subcategory: str(o.subcategory) || undefined,
      product_lines,
      title,
      content: o.content as PracticeContent,
      exercises,
      premium: o.premium === true,
    }));
  });

  return { valid, errs };
}

/* ---------------- Supabase-backed store ---------------- */

type PracticeRow = Database["public"]["Tables"]["practice_activities"]["Row"];
type ScoreRow = Database["public"]["Tables"]["practice_scores"]["Row"];

function fromRow(row: PracticeRow): PracticeActivity {
  return {
    id: String(row.id),
    format: row.format,
    category: row.category,
    subcategory: row.subcategory ?? undefined,
    product_lines: (row.product_lines ?? []) as PracticeProductLine[],
    title: row.title,
    content: (row.content ?? {}) as unknown as PracticeContent,
    exercises: (row.exercises ?? []) as unknown as PracticeExercise[],
    premium: row.premium || undefined,
  };
}

function toInsertRow(p: PracticeActivity): Database["public"]["Tables"]["practice_activities"]["Insert"] {
  return {
    format: p.format,
    category: p.category,
    subcategory: p.subcategory ?? null,
    product_lines: p.product_lines,
    title: p.title,
    content: p.content as unknown as Json,
    exercises: p.exercises as unknown as Json,
    premium: !!p.premium,
  };
}

let cache: PracticeActivity[] = [];
let scoresCache: Record<string, PracticeScore> = {};
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

function scopedKey(studentId: string, practiceId: string) {
  return `${studentId}::${practiceId}`;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const [contentRes, scoreRes] = await Promise.all([
      supabase.from("practice_activities").select("*"),
      supabase.from("practice_scores").select("*"),
    ]);
    if (contentRes.error) console.error("[practice-store] failed to load practice_activities", contentRes.error);
    if (scoreRes.error) console.error("[practice-store] failed to load practice_scores", scoreRes.error);

    cache = ((contentRes.data ?? []) as PracticeRow[]).map(fromRow);

    const scores: Record<string, PracticeScore> = {};
    for (const row of (scoreRes.data ?? []) as ScoreRow[]) {
      scores[scopedKey(uuidToLegacySync(row.student_id), String(row.practice_id))] = {
        best: Number(row.best),
        attempts: row.attempts,
        lastAt: row.last_at ?? "",
        attempted: row.attempted,
      };
    }
    scoresCache = scores;

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
    .channel("practice-store-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "practice_activities" }, invalidateAndRehydrate)
    .on("postgres_changes", { event: "*", schema: "public", table: "practice_scores" }, invalidateAndRehydrate)
    .subscribe();
}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
  registerRehydrate(invalidateAndRehydrate);
}

export function subscribePractice(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => listeners.delete(cb);
}

export function loadPracticeActivities(): PracticeActivity[] {
  if (!hydrated) void hydrate();
  return cache;
}

export function usePracticeActivities(): PracticeActivity[] {
  return useSyncExternalStore(subscribePractice, () => cache, () => []);
}

export function practiceForCategory(category: PracticeCategory): PracticeActivity[] {
  return loadPracticeActivities().filter((p) => p.category === category);
}

/** Create or update a practice card (optimistic; rolls back on failure).
 *  Same temp-id-then-reconcile pattern as materials-store.upsertMaterial. */
export function upsertPracticeActivity(p: PracticeActivity) {
  const clean = sanitizePracticeActivity(p);
  const prevCache = cache;
  const idx = prevCache.findIndex((x) => x.id === clean.id);
  const isExisting = idx >= 0 && !clean.id.startsWith("p");
  cache = isExisting ? [...prevCache.slice(0, idx), clean, ...prevCache.slice(idx + 1)] : [clean, ...prevCache];
  notify();

  void (async () => {
    if (isExisting) {
      const { error } = await supabase.from("practice_activities").update(toInsertRow(clean)).eq("id", Number(clean.id));
      if (error) {
        console.error("[practice-store] failed to update practice activity", error);
        cache = prevCache;
        notify();
      }
      return;
    }
    const { data, error } = await supabase.from("practice_activities").insert(toInsertRow(clean)).select("id").single();
    if (error || !data) {
      console.error("[practice-store] failed to insert practice activity", error);
      cache = prevCache;
      notify();
      return;
    }
    // Reconcile the temp client-side id with the real bigint id.
    cache = cache.map((x) => (x.id === clean.id ? { ...x, id: String(data.id) } : x));
    notify();
  })();
}

/** Bulk insert (mirrors addActivitiesBulk in activities-store.ts): optimistic
 *  temp rows while the insert round-trips, reconciled with real ids after. */
export async function addPracticeActivitiesBulk(
  items: PracticeActivity[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (items.length === 0) return { ok: true, count: 0 };
  const cleaned = items.map(sanitizePracticeActivity);
  const tempItems = cleaned.map((p) => ({ ...p, id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }));
  cache = [...tempItems, ...cache];
  notify();

  const { data, error } = await supabase.from("practice_activities").insert(cleaned.map(toInsertRow)).select();
  const tempIds = new Set(tempItems.map((p) => p.id));
  if (error || !data) {
    console.error("[practice-store] failed to bulk-add practice activities", error);
    cache = cache.filter((p) => !tempIds.has(p.id));
    notify();
    return { ok: false, error: error?.message || "The import failed — please try again." };
  }
  const saved = (data as PracticeRow[]).map(fromRow);
  cache = [...saved, ...cache.filter((p) => !tempIds.has(p.id))];
  notify();
  return { ok: true, count: saved.length };
}

export function removePracticeActivity(id: string) {
  const prevCache = cache;
  cache = cache.filter((x) => x.id !== id);
  notify();
  void (async () => {
    const { error } = await supabase.from("practice_activities").delete().eq("id", Number(id));
    if (error) {
      console.error("[practice-store] failed to delete practice activity", error);
      cache = prevCache;
      notify();
    }
  })();
}

/* ---- Per-student scores (reference only — NEVER gates unit progress) ---- */

export function bestPracticeScoreFor(studentId: string, practiceId: string): number {
  return scoresCache[scopedKey(studentId, practiceId)]?.best ?? 0;
}

export function wasPracticeAttempted(studentId: string, practiceId: string): boolean {
  return !!scoresCache[scopedKey(studentId, practiceId)]?.attempted;
}

/** Records a completion score (0-100) for a practice card. Optimistic write
 *  with rollback on failure, mirroring recordActivityScore exactly. */
export function recordPracticeScore(studentId: string, practiceId: string, score: number): PracticeScore {
  const k = scopedKey(studentId, practiceId);
  const hadKey = k in scoresCache;
  const prevValue = scoresCache[k];
  const cur = scoresCache[k] ?? { best: 0, attempts: 0, lastAt: "", attempted: false };
  const next: PracticeScore = {
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
      console.error("[practice-store] no app_users row for legacy id", studentId);
      rollback();
      return;
    }
    const { error } = await supabase
      .from("practice_scores")
      .upsert(
        { student_id: studentUuid, practice_id: Number(practiceId), best: next.best, attempts: next.attempts, attempted: next.attempted, last_at: next.lastAt },
        { onConflict: "student_id,practice_id" },
      );
    if (error) {
      console.error("[practice-store] failed to record practice score", error);
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
