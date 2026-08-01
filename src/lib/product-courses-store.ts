// Product-based course catalog — the source of truth for the Admin > Courses
// 3-level navigation: Product > Commercial Level > Units.
// Persisted to localStorage and broadcast via a custom event so any open
// tab/route updates in real-time. VIP is intentionally excluded here.

import syllabusData from "./syllabus-data.json";

export type ProductId = "go" | "enterprise" | "international";

export interface CourseUnit {
  id: string; // e.g. GO-L1-U1
  title: string;
  video_url: string;
  pdf_url: string;
  block?: string;
  vocabulary?: string[];
  grammar_point?: string;
  /** Short admin-authored hook shown to students instead of vocabulary/grammar. */
  teaser?: string;
}

interface SyllabusUnit {
  id: string;
  title: string;
  block: string;
  vocabulary: string[];
  grammar_point: string;
}
const SYLLABUS = syllabusData as Record<string, SyllabusUnit[]>;

const PLACEHOLDER_TITLE_RE = /^(Unit|Review) \d+$/;

/**
 * Merge syllabus data (titles, blocks, vocabulary, grammar points) from the
 * shipped `syllabus-data.json` into a courses tree loaded from localStorage
 * (or a fresh seed). Preserves any hand-edited titles, video_url and pdf_url.
 * Returns true when something changed.
 */
function applySyllabus(courses: ProductCourse[]): boolean {
  let changed = false;
  for (const product of courses) {
    for (const level of product.levels) {
      const syllabusUnits = SYLLABUS[level.id];
      if (!syllabusUnits) continue;
      const byId = new Map(level.units.map((u) => [u.id, u]));
      for (const s of syllabusUnits) {
        const existing = byId.get(s.id);
        if (existing) {
          if (PLACEHOLDER_TITLE_RE.test(existing.title) && existing.title !== s.title) {
            existing.title = s.title;
            changed = true;
          }
          if (existing.block !== s.block) { existing.block = s.block; changed = true; }
          if (JSON.stringify(existing.vocabulary ?? []) !== JSON.stringify(s.vocabulary)) {
            existing.vocabulary = [...s.vocabulary]; changed = true;
          }
          if (existing.grammar_point !== s.grammar_point) {
            existing.grammar_point = s.grammar_point; changed = true;
          }
        } else {
          level.units.push({
            id: s.id,
            title: s.title,
            video_url: "",
            pdf_url: "",
            block: s.block,
            vocabulary: [...s.vocabulary],
            grammar_point: s.grammar_point,
          });
          changed = true;
        }
      }
      level.units.sort((a, b) => {
        const na = parseInt(a.id.match(/-U(\d+)$/)?.[1] ?? "0", 10);
        const nb = parseInt(b.id.match(/-U(\d+)$/)?.[1] ?? "0", 10);
        return na - nb;
      });
    }
  }
  return changed;
}

export interface CourseLevel {
  id: string; // e.g. GO-L1
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

// Placeholder commercial level names — editable later.
const LEVEL_NAMES: Record<ProductId, string[]> = {
  go: ["Kickstart", "Everyday Flow", "Confident Voice", "Culture Master"],
  enterprise: ["Core Foundations", "Strategic Fluency", "Executive Presence", "Global Leadership"],
  international: ["Survival Basics", "Travel Ready", "Global Connector", "World Fluency"],
};

export const UNITS_PER_LEVEL = 30;

export const COURSES_KEY = "verbo:product-courses";
export const COURSES_EVENT = "verbo:product-courses-updated";

function seed(): ProductCourse[] {
  return PRODUCT_ORDER.map((product) => ({
    product,
    levels: LEVEL_NAMES[product].map((name, i) => ({
      id: `${PRODUCT_META[product].label.toUpperCase()}-L${i + 1}`,
      name,
      units: [],
    })),
  }));
}

export function loadCourses(): ProductCourse[] {
  if (typeof window === "undefined") {
    const s = seed();
    applySyllabus(s);
    return s;
  }
  try {
    const raw = localStorage.getItem(COURSES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProductCourse[];
      // One-time migration: rename Enterprise L4 to "Global Leadership".
      let migrated = false;
      for (const p of parsed) {
        if (p.product === "enterprise") {
          for (const l of p.levels) {
            if (l.name === "Global Mastery") { l.name = "Global Leadership"; migrated = true; }
          }
        }
      }
      // Migration: merge real syllabus (titles/block/vocabulary/grammar_point)
      // into existing units without touching hand-edited titles or media URLs.
      if (applySyllabus(parsed)) migrated = true;
      if (migrated) {
        try { localStorage.setItem(COURSES_KEY, JSON.stringify(parsed)); } catch { /* noop */ }
      }
      return parsed;
    }
  } catch { /* noop */ }
  const initial = seed();
  applySyllabus(initial);
  try { localStorage.setItem(COURSES_KEY, JSON.stringify(initial)); } catch { /* noop */ }
  return initial;
}

export function persistCourses(courses: ProductCourse[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
    window.dispatchEvent(new CustomEvent(COURSES_EVENT));
  } catch { /* noop */ }
}

export function subscribeCourses(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === COURSES_KEY) cb(); };
  window.addEventListener(COURSES_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(COURSES_EVENT, cb);
    window.removeEventListener("storage", onStorage);
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
