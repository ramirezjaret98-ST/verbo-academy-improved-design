// Product-based course catalog — the source of truth for the Admin > Courses
// 3-level navigation: Product > Commercial Level > Units. VIP is intentionally
// excluded here — it's driven by custom-units-store.ts's "vip" kind instead.
//
// Backed by Supabase (`public.product_courses` + `public.course_levels` +
// `public.course_units`). Level *names* (e.g. "Kickstart") and the set of
// products/levels themselves are NOT stored in the DB — there's no UI to
// rename a level or add/remove a product, so PRODUCT_META/PRODUCT_ORDER/
// LEVEL_NAMES stay as static frontend constants exactly like before.
// `course_levels.code` and `course_units.code` are the compound text ids
// ("GO-L1", "GO-L1-U1") every other part of the app already keys units by
// (activities, lesson plans, unit-unlock-seen, etc. — none of them are
// migrated yet and all still expect that exact string shape).
//
// Only the per-unit content (title/video_url/pdf_url/block/vocabulary/
// grammar_point/teaser) is dynamic; it's seeded once from the real syllabus
// content (Lote 7 migration, see `schema_rls_design_supabase_2026-08-05.md`
// / project memory for the seeding SQL). RLS: `select("*")` on all three
// tables is open to everyone; writes are admin-only — a single global cache
// hydrated once + kept in sync via Postgres Realtime covers every caller
// (same pattern as holidays/badges). Writes stay optimistic and synchronous
// in their public signature, same as every other store migrated so far.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductId = "go" | "enterprise" | "international";

export interface CourseUnit {
  id: string; // e.g. GO-L1-U1 — matches `course_units.code`
  title: string;
  video_url: string;
  pdf_url: string;
  block?: string;
  vocabulary?: string[];
  grammar_point?: string;
  /** Short admin-authored hook shown to students instead of vocabulary/grammar. */
  teaser?: string;
}

export interface CourseLevel {
  id: string; // e.g. GO-L1 — matches `course_levels.code`
  name: string;
  units: CourseUnit[];
}

export interface ProductCourse {
  product: ProductId;
  levels: CourseLevel[];
}

export const PRODUCT_META: Record<ProductId, { label: string; description: string }> = {
  go: { label: "GO", description: "Flexible general English for individual learners." },
  enterprise: { label: "Enterprise", description: "Corporate programs for teams and organizations." },
  international: { label: "International", description: "Survival & travel-focused English tracks." },
};

export const PRODUCT_ORDER: ProductId[] = ["go", "enterprise", "international"];

// Placeholder commercial level names — editable later (would need a `name`
// column on `course_levels` if this ever becomes admin-editable).
const LEVEL_NAMES: Record<ProductId, string[]> = {
  go: ["Kickstart", "Everyday Flow", "Confident Voice", "Culture Master"],
  enterprise: ["Core Foundations", "Strategic Fluency", "Executive Presence", "Global Leadership"],
  international: ["Survival Basics", "Travel Ready", "Global Connector", "World Fluency"],
};

export const UNITS_PER_LEVEL = 30;

export const COURSES_EVENT = "verbo:product-courses-updated";

type UnitRow = Database["public"]["Tables"]["course_units"]["Row"];

function levelIdFor(product: ProductId, index: number): string {
  return `${PRODUCT_META[product].label.toUpperCase()}-L${index + 1}`;
}

function unitNumFrom(id: string): number {
  const m = id.match(/-U(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function sortByUnitNum(units: CourseUnit[]): CourseUnit[] {
  return [...units].sort((a, b) => unitNumFrom(a.id) - unitNumFrom(b.id));
}

function fromUnitRow(row: UnitRow): CourseUnit {
  return {
    id: row.code,
    title: row.title,
    video_url: row.video_url ?? "",
    pdf_url: row.pdf_url ?? "",
    block: row.block ?? undefined,
    vocabulary: row.vocabulary ?? undefined,
    grammar_point: row.grammar_point ?? undefined,
    teaser: row.teaser ?? undefined,
  };
}

// course_levels.code ("GO-L1") <-> its numeric row id, needed for writes.
let levelDbIdByCode = new Map<string, number>();
let unitsByLevelCode = new Map<string, CourseUnit[]>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COURSES_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const [levelsRes, unitsRes] = await Promise.all([
      supabase.from("course_levels").select("*"),
      supabase.from("course_units").select("*").order("position"),
    ]);
    if (levelsRes.error) {
      console.error("[product-courses-store] failed to load course_levels", levelsRes.error);
    }
    if (unitsRes.error) {
      console.error("[product-courses-store] failed to load course_units", unitsRes.error);
    }
    const codeById = new Map<number, string>();
    const dbIdByCode = new Map<string, number>();
    for (const l of levelsRes.data ?? []) {
      codeById.set(l.id, l.code);
      dbIdByCode.set(l.code, l.id);
    }
    const grouped = new Map<string, CourseUnit[]>();
    for (const row of unitsRes.data ?? []) {
      const levelCode = codeById.get(row.course_level_id);
      if (!levelCode) continue;
      const list = grouped.get(levelCode) ?? [];
      list.push(fromUnitRow(row));
      grouped.set(levelCode, list);
    }
    levelDbIdByCode = dbIdByCode;
    unitsByLevelCode = grouped;
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("product-courses-store-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "course_units" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "course_levels" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

export function loadCourses(): ProductCourse[] {
  return PRODUCT_ORDER.map((product) => ({
    product,
    levels: LEVEL_NAMES[product].map((name, i) => {
      const id = levelIdFor(product, i);
      return { id, name, units: unitsByLevelCode.get(id) ?? [] };
    }),
  }));
}

export function subscribeCourses(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

/** Build the 30 empty units for a level: 9 content + 1 review, x3 blocks. */
export function buildSkeletonUnits(levelId: string, startAt = 1): CourseUnit[] {
  const units: CourseUnit[] = [];
  for (let i = startAt; i <= UNITS_PER_LEVEL; i++) {
    const isReview = i % 10 === 0;
    const title = isReview ? `Review ${i / 10}` : `Unit ${i}`;
    units.push({ id: `${levelId}-U${i}`, title, video_url: "", pdf_url: "" });
  }
  return units;
}

function unitToRow(levelDbId: number, unit: CourseUnit) {
  return {
    course_level_id: levelDbId,
    code: unit.id,
    title: unit.title,
    video_url: unit.video_url || null,
    pdf_url: unit.pdf_url || null,
    block: unit.block ?? null,
    vocabulary: unit.vocabulary ?? null,
    grammar_point: unit.grammar_point ?? null,
    teaser: unit.teaser ?? null,
    position: unitNumFrom(unit.id),
  };
}

/**
 * Create or edit a single unit within a level. `originalId` is the unit's
 * previous id (pass `null` when creating a brand-new unit, or the same id
 * as `unit.id` for an in-place edit). When `originalId` differs from
 * `unit.id` (the admin changed the unit number), the underlying row is
 * renamed in place — `code` isn't a foreign key target anywhere in this
 * table, so this is a plain single-row UPDATE, not a delete+insert.
 */
export function saveUnit(levelId: string, originalId: string | null, unit: CourseUnit): void {
  const levelDbId = levelDbIdByCode.get(levelId);
  if (levelDbId === undefined) {
    console.error("[product-courses-store] unknown level id", levelId);
    return;
  }
  const prevMap = unitsByLevelCode;
  const list = unitsByLevelCode.get(levelId) ?? [];
  const withoutOld = list.filter((u) => u.id !== originalId && u.id !== unit.id);
  unitsByLevelCode = new Map(unitsByLevelCode).set(levelId, sortByUnitNum([...withoutOld, unit]));
  notify();

  void (async () => {
    if (originalId && originalId !== unit.id) {
      const { error } = await supabase
        .from("course_units")
        .update(unitToRow(levelDbId, unit))
        .eq("course_level_id", levelDbId)
        .eq("code", originalId);
      if (error) {
        console.error("[product-courses-store] failed to rename unit", error);
        unitsByLevelCode = prevMap;
        notify();
      }
      return;
    }
    const { error } = await supabase
      .from("course_units")
      .upsert(unitToRow(levelDbId, unit), { onConflict: "course_level_id,code" });
    if (error) {
      console.error("[product-courses-store] failed to save unit", error);
      unitsByLevelCode = prevMap;
      notify();
    }
  })();
}

export function deleteUnit(levelId: string, unitId: string): void {
  const levelDbId = levelDbIdByCode.get(levelId);
  if (levelDbId === undefined) return;
  const prevMap = unitsByLevelCode;
  const list = unitsByLevelCode.get(levelId) ?? [];
  unitsByLevelCode = new Map(unitsByLevelCode).set(levelId, list.filter((u) => u.id !== unitId));
  notify();

  void (async () => {
    const { error } = await supabase
      .from("course_units")
      .delete()
      .eq("course_level_id", levelDbId)
      .eq("code", unitId);
    if (error) {
      console.error("[product-courses-store] failed to delete unit", error);
      unitsByLevelCode = prevMap;
      notify();
    }
  })();
}

/** Bulk-adds skeleton (or bulk-uploaded) units in a single optimistic update
 *  + a single background upsert, keyed by (level, code) so it's safe to
 *  re-run against units that already exist. */
export function addUnitsBulk(levelId: string, units: CourseUnit[]): void {
  if (units.length === 0) return;
  const levelDbId = levelDbIdByCode.get(levelId);
  if (levelDbId === undefined) {
    console.error("[product-courses-store] unknown level id", levelId);
    return;
  }
  const prevMap = unitsByLevelCode;
  const list = unitsByLevelCode.get(levelId) ?? [];
  const merged = [...list.filter((u) => !units.some((n) => n.id === u.id)), ...units];
  unitsByLevelCode = new Map(unitsByLevelCode).set(levelId, sortByUnitNum(merged));
  notify();

  void (async () => {
    const rows = units.map((u) => unitToRow(levelDbId, u));
    const { error } = await supabase.from("course_units").upsert(rows, { onConflict: "course_level_id,code" });
    if (error) {
      console.error("[product-courses-store] failed to bulk-add units", error);
      unitsByLevelCode = prevMap;
      notify();
    }
  })();
}

/** Resolve the real curriculum topic of a lesson plan's (level_id, unit_id).
 *  Returns null when the ids don't resolve — e.g. a plan saved against the
 *  legacy CEFR catalog before the switch to the product-scoped curriculum.
 *  Callers should treat null as "no plan recorded", never as an error. */
export function resolvePlanTopic(
  product: string | undefined,
  levelId: string | undefined,
  unitId: string | undefined,
): { levelName: string; unitTitle: string } | null {
  const productId = product ? PRODUCT_TO_COURSE[product] : undefined;
  if (!productId || !levelId || !unitId) return null;
  const course = loadCourses().find((c) => c.product === productId);
  const level = course?.levels.find((l) => l.id === levelId);
  const unit = level?.units.find((u) => u.id === unitId);
  if (!level || !unit) return null;
  return { levelName: level.name, unitTitle: unit.title };
}

// ---------------------------------------------------------------------------
// "Current level" of the student's real curriculum — canonical helper.
//
// NOTE: this is DIFFERENT from the User.current_level field, which is the
// initial CEFR diagnostic level assigned by Admin at registration (edited
// in Admin > Students under "Initial English Level" / "CEFR Level"). This
// function computes the level the student is actively progressing through
// in their contracted product curriculum (or the VIP course), and is the
// value that should be surfaced anywhere the UI says "current level".
// ---------------------------------------------------------------------------

import {
  unitPassed,
  getUnitAccessOverride,
  isMilestoneUnit,
} from "./activities-store";
import {
  unitsForStudent,
  vipUnitDoneMap,
} from "./vip-courses-store";

export const PRODUCT_TO_COURSE: Record<string, ProductId> = {
  enterprise: "enterprise",
  go: "go",
  international: "international",
};

// Mirrors levelIsComplete() in student.courses.tsx: a level is complete when
// every unit is passed (respecting explicit access overrides and milestones).
export function levelIsCompleteFor(level: CourseLevel, studentId: string): boolean {
  if (level.units.length === 0) return false;
  for (const u of level.units) {
    const ov = getUnitAccessOverride(studentId, u.id);
    if (ov === "locked") return false;
    if (isMilestoneUnit(u.id) && ov !== "unlocked" && !unitPassed(studentId, u.id)) return false;
    if (!unitPassed(studentId, u.id)) return false;
  }
  return true;
}

export interface CurrentProgress {
  isVip: boolean;
  levelName: string;
  progressPct: number;
  currentUnitTitle: string | null;
  currentUnitId?: string;
  levelId?: string;
}

export function computeCurrentProgress(
  studentId: string,
  product: string | undefined,
  contractedLevels: string[],
  // included so React re-runs this when stores emit updates
  _rev: number,
): CurrentProgress | null {
  void _rev;
  if (product === "vip") {
    const units = unitsForStudent(studentId);
    const done = vipUnitDoneMap();
    const total = units.length;
    const doneCount = units.filter((u) => done[u.id]).length;
    const currentUnit = units.find((u) => !done[u.id]) ?? units[units.length - 1];
    return {
      isVip: true,
      levelName: "VIP Course",
      progressPct: total === 0 ? 0 : Math.round((doneCount / total) * 100),
      currentUnitTitle: currentUnit?.title ?? null,
      currentUnitId: currentUnit?.id,
    };
  }
  const productId = product ? PRODUCT_TO_COURSE[product] : undefined;
  if (!productId) return null;
  const course = loadCourses().find((c) => c.product === productId);
  const levels = course?.levels ?? [];
  const contracted = new Set(contractedLevels);
  const currentLevel =
    levels.find((l) => contracted.has(l.name) && !levelIsCompleteFor(l, studentId)) ??
    levels.find((l) => contracted.has(l.name)) ??
    null;
  if (!currentLevel) return null;
  const total = currentLevel.units.length;
  const passed = currentLevel.units.filter((u) => unitPassed(studentId, u.id)).length;
  const currentUnit =
    currentLevel.units.find((u) => !unitPassed(studentId, u.id)) ??
    currentLevel.units[currentLevel.units.length - 1];
  return {
    isVip: false,
    levelName: currentLevel.name,
    progressPct: total === 0 ? 0 : Math.round((passed / total) * 100),
    currentUnitTitle: currentUnit?.title ?? null,
    currentUnitId: currentUnit?.id,
    levelId: currentLevel.id,
  };
}
