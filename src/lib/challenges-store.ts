// Weekly Challenges catalog — the source of truth for Admin > Challenges.
// Navigation: Product > Difficulty > list of challenges. VIP IS included here
// (unlike Courses). Challenges are complementary weekly activities and do NOT
// affect student performance/metrics. Persisted to localStorage and broadcast
// via a custom event so any open tab/route updates in real-time.

import { CHALLENGES_SEED } from "./challenges-seed";

export type ChallengeProductId = "go" | "enterprise" | "international" | "vip";

export type DifficultyId = "esencial" | "intermedio" | "avanzado" | "experto";

export type ChallengeSkillTag = "Speaking" | "Writing" | "Reading" | "Listening";

export interface Challenge {
  id: string; // e.g. GO-ESENCIAL-C1
  product: ChallengeProductId;
  difficulty: DifficultyId;
  category: string; // empty until admin assigns one
  title: string;
  description: string;
  video_url: string; // optional; empty = no attachment shown to students
  premium?: boolean; // exclusive for Advance/Elite plans
  /** Free text where the admin explains the expected delivery format. */
  submission_instructions?: string;
  skill_tags?: string[]; // informative tags: Speaking / Writing / Reading / Listening
  /** ISO timestamp of admin authorship. Optional because seed challenges
   *  predate this field — student-facing "New Challenge available"
   *  notifications only trigger for challenges that carry this value. */
  created_at?: string;
}

export const PRODUCT_META: Record<ChallengeProductId, { label: string; description: string }> = {
  go: { label: "GO", description: "Flexible general English for individual learners." },
  enterprise: { label: "Enterprise", description: "Corporate programs for teams and organizations." },
  international: { label: "International", description: "Survival & travel-focused English tracks." },
  vip: { label: "VIP", description: "Premium one-to-one experience for VIP learners." },
};

export const PRODUCT_ORDER: ChallengeProductId[] = ["go", "enterprise", "international", "vip"];

export const DIFFICULTY_META: Record<DifficultyId, { label: string; dots: number }> = {
  esencial: { label: "Essential", dots: 1 },
  intermedio: { label: "Intermediate", dots: 2 },
  avanzado: { label: "Advanced", dots: 3 },
  experto: { label: "Expert", dots: 4 },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["esencial", "intermedio", "avanzado", "experto"];

// Target challenges per difficulty. Enterprise/GO/International seeded data
// distributes 50 real challenges as 12/13/13/12; VIP follows the same targets
// when generating skeletons.
export const CHALLENGES_PER_DIFFICULTY: Record<DifficultyId, number> = {
  esencial: 12,
  intermedio: 13,
  avanzado: 13,
  experto: 12,
};

export const CHALLENGES_KEY = "verbo:challenges";
export const CHALLENGES_EVENT = "verbo:challenges-updated";
export const CHALLENGE_CATEGORIES_KEY = "verbo:challenge-categories";
export const CHALLENGE_CATEGORIES_EVENT = "verbo:challenge-categories-updated";
// Tracks which products have already had their real seed applied so we never
// overwrite admin edits on a second load.
const CHALLENGES_SEEDED_KEY = "verbo:challenges-seeded-products";
const SEEDED_PRODUCTS: ChallengeProductId[] = ["enterprise", "go", "international"];

/* ---------------- Challenges ---------------- */

function readSeededProducts(): ChallengeProductId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHALLENGES_SEEDED_KEY);
    if (raw) return JSON.parse(raw) as ChallengeProductId[];
  } catch { /* noop */ }
  return [];
}

function writeSeededProducts(list: ChallengeProductId[]) {
  try { localStorage.setItem(CHALLENGES_SEEDED_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

/** Seed real challenge data once per product. Never overwrites admin edits:
 *  only injects seed items for a product if that product has zero challenges
 *  in storage AND hasn't been seeded before. */
function ensureSeed(list: Challenge[]): Challenge[] {
  if (typeof window === "undefined") return list;
  const seeded = readSeededProducts();
  const toSeed = SEEDED_PRODUCTS.filter((p) => !seeded.includes(p));
  if (toSeed.length === 0) return list;

  let next = list;
  let mutated = false;
  const newlySeeded: ChallengeProductId[] = [];
  for (const product of toSeed) {
    const hasAny = list.some((c) => c.product === product);
    if (hasAny) {
      // Admin already has data for this product — mark seeded and move on.
      newlySeeded.push(product);
      continue;
    }
    const additions = CHALLENGES_SEED.filter((c) => c.product === product);
    if (additions.length > 0) {
      next = [...next, ...additions];
      mutated = true;
    }
    newlySeeded.push(product);
  }
  writeSeededProducts([...seeded, ...newlySeeded]);
  if (mutated) {
    try {
      localStorage.setItem(CHALLENGES_KEY, JSON.stringify(next));
    } catch { /* noop */ }
  }
  return next;
}

export function loadChallenges(): Challenge[] {
  if (typeof window === "undefined") return [];
  let list: Challenge[] = [];
  try {
    const raw = localStorage.getItem(CHALLENGES_KEY);
    if (raw) list = JSON.parse(raw) as Challenge[];
  } catch { /* noop */ }
  return ensureSeed(list);
}

export function persistChallenges(list: Challenge[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHALLENGES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(CHALLENGES_EVENT));
  } catch { /* noop */ }
}

export function subscribeChallenges(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === CHALLENGES_KEY) cb(); };
  window.addEventListener(CHALLENGES_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHALLENGES_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function challengesFor(list: Challenge[], product: ChallengeProductId, difficulty: DifficultyId): Challenge[] {
  return list
    .filter((c) => c.product === product && c.difficulty === difficulty)
    .sort((a, b) => challengeNum(a.id) - challengeNum(b.id));
}

export function challengeNum(id: string): number {
  const m = id.match(/-C(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Build empty challenge placeholders up to the difficulty's target count. */
export function buildSkeletonChallenges(
  product: ChallengeProductId,
  difficulty: DifficultyId,
  existing: Challenge[],
): Challenge[] {
  const prefix = `${PRODUCT_META[product].label.toUpperCase()}-${difficulty.toUpperCase()}`;
  const existingNums = new Set(existing.map((c) => challengeNum(c.id)));
  const target = CHALLENGES_PER_DIFFICULTY[difficulty];
  const generated: Challenge[] = [];
  for (let i = 1; i <= target; i++) {
    if (existingNums.has(i)) continue;
    generated.push({
      id: `${prefix}-C${i}`,
      product,
      difficulty,
      category: "",
      title: `Challenge ${i}`,
      description: "",
      video_url: "",
      premium: false,
      skill_tags: [],
    });
  }
  return generated;
}

export function newChallengeId(
  product: ChallengeProductId,
  difficulty: DifficultyId,
  existing: Challenge[],
): string {
  const prefix = `${PRODUCT_META[product].label.toUpperCase()}-${difficulty.toUpperCase()}`;
  const max = existing.reduce((m, c) => Math.max(m, challengeNum(c.id)), 0);
  return `${prefix}-C${max + 1}`;
}

/* ---------------- Categories (starts completely empty) ---------------- */

export function loadCategories(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHALLENGE_CATEGORIES_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* noop */ }
  return [];
}

export function persistCategories(cats: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHALLENGE_CATEGORIES_KEY, JSON.stringify(cats));
    window.dispatchEvent(new CustomEvent(CHALLENGE_CATEGORIES_EVENT));
  } catch { /* noop */ }
}

export function subscribeCategories(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === CHALLENGE_CATEGORIES_KEY) cb(); };
  window.addEventListener(CHALLENGE_CATEGORIES_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHALLENGE_CATEGORIES_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

// Deterministic color per category name so badges stay stable across renders.
const CATEGORY_TONES = [
  "bg-[#f38934]/15 text-[#f38934]",
  "bg-[#01304a]/10 text-[#01304a]",
  "bg-emerald-500/15 text-emerald-600",
  "bg-violet-500/15 text-violet-600",
  "bg-rose-500/15 text-rose-600",
  "bg-sky-500/15 text-sky-600",
  "bg-amber-500/15 text-amber-600",
  "bg-teal-500/15 text-teal-600",
];

export function categoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[hash % CATEGORY_TONES.length];
}
