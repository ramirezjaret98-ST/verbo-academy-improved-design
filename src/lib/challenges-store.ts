// Weekly Challenges catalog — the source of truth for Admin > Challenges.
// Navigation: Product > Difficulty > list of challenges. VIP IS included here
// (unlike Courses). Challenges are complementary weekly activities and do NOT
// affect student performance/metrics.
//
// Backed by Supabase (`public.challenges`, kind='standard' — the same table
// also holds Verbo Flash challenges under kind='flash', see
// flash-challenges-store.ts). RLS: SELECT open to everyone, INSERT/UPDATE/
// DELETE admin-only (private.is_admin()). Global cache hydrated once +
// Postgres Realtime, same pattern used across this migration (see
// teacher-kpi-overrides-store.ts).
//
// The old localStorage design replaced the *entire* catalog on every edit
// (persistChallenges(fullList) — admin.challenges.tsx still builds and passes
// the full ~150-row list on every save/delete/skeleton-generate). Supabase
// has no cheap "replace everything" primitive and re-upserting all 150 rows
// on every keystroke-adjacent save would flood Realtime with no-op row
// events, so persistChallenges() now diffs the incoming list against the
// last-synced cache and only upserts/deletes what actually changed. Callers
// don't need to change — same signature, same call sites.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";

export type ChallengeProductId = "go" | "enterprise" | "international" | "vip";

export type DifficultyId = "esencial" | "intermedio" | "avanzado" | "experto";

export type ChallengeSkillTag = "Speaking" | "Writing" | "Reading" | "Listening";

export interface Challenge {
  id: string; // e.g. GO-ESENCIAL-C1 — maps to `challenges.code`
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

export const CHALLENGES_EVENT = "verbo:challenges-updated";
export const CHALLENGE_CATEGORIES_KEY = "verbo:challenge-categories";
export const CHALLENGE_CATEGORIES_EVENT = "verbo:challenge-categories-updated";

/* ---------------- Challenges (Supabase) ---------------- */

type ChallengeRow = Database["public"]["Tables"]["challenges"]["Row"];

let cache: Challenge[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHALLENGES_EVENT));
}

function mapRow(row: ChallengeRow): Challenge {
  return {
    id: row.code ?? String(row.id),
    product: row.product as ChallengeProductId,
    difficulty: (row.difficulty ?? "esencial") as DifficultyId,
    category: row.category,
    title: row.title,
    description: row.description,
    video_url: row.video_url ?? "",
    premium: row.premium || undefined,
    submission_instructions: row.submission_instructions ?? undefined,
    skill_tags: row.skill_tags ?? undefined,
    created_at: row.created_at,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("kind", "standard");
    if (error) {
      console.error("[challenges-store] failed to load challenges", error);
      hydrated = true;
      return;
    }
    cache = (data ?? []).map(mapRow);
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

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("challenges-standard-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "challenges", filter: "kind=eq.standard" },
      () => {
        hydrated = false;
        void hydrate();
      },
    )
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

export function loadChallenges(): Challenge[] {
  if (!hydrated) void hydrate();
  return cache;
}

export function subscribeChallenges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function challengeEquals(a: Challenge, b: Challenge): boolean {
  return (
    a.product === b.product &&
    a.difficulty === b.difficulty &&
    a.category === b.category &&
    a.title === b.title &&
    a.description === b.description &&
    (a.video_url || "") === (b.video_url || "") &&
    !!a.premium === !!b.premium &&
    (a.submission_instructions ?? "") === (b.submission_instructions ?? "") &&
    JSON.stringify(a.skill_tags ?? []) === JSON.stringify(b.skill_tags ?? [])
  );
}

/** Replace the challenge catalog with `list` (optimistic; rolls back the
 *  whole write on failure). Diffs against the last-synced cache — only rows
 *  that were added, edited, or removed touch Supabase. See file header. */
export function persistChallenges(list: Challenge[]) {
  const prevCache = cache;
  const prevById = new Map(prevCache.map((c) => [c.id, c]));
  const nextIds = new Set(list.map((c) => c.id));

  cache = list;
  notify();

  const toUpsert = list.filter((c) => {
    const prev = prevById.get(c.id);
    return !prev || !challengeEquals(prev, c);
  });
  const toDeleteIds = prevCache.filter((c) => !nextIds.has(c.id)).map((c) => c.id);

  if (toUpsert.length === 0 && toDeleteIds.length === 0) return;

  void (async () => {
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("challenges")
        .upsert(
          toUpsert.map((c) => ({
            code: c.id,
            kind: "standard" as const,
            product: c.product,
            difficulty: c.difficulty,
            category: c.category,
            title: c.title,
            description: c.description,
            video_url: c.video_url || null,
            premium: c.premium ?? false,
            skill_tags: c.skill_tags && c.skill_tags.length > 0 ? c.skill_tags : null,
            submission_instructions: c.submission_instructions ?? null,
          })),
          { onConflict: "code" },
        );
      if (error) {
        console.error("[challenges-store] failed to upsert challenges", error);
        cache = prevCache;
        notify();
        return;
      }
    }
    if (toDeleteIds.length > 0) {
      const { error } = await supabase
        .from("challenges")
        .delete()
        .eq("kind", "standard")
        .in("code", toDeleteIds);
      if (error) {
        console.error("[challenges-store] failed to delete challenges", error);
        cache = prevCache;
        notify();
      }
    }
  })();
}

export function challengesFor(list: Challenge[], product: ChallengeProductId, difficulty: DifficultyId): Challenge[] {
  return list
    .filter((c) => c.product === product && c.difficulty === difficulty)
    .sort((a, b) => challengeNum(a.id) - challengeNum(b.id));
}

/** Products that own a real Challenges catalog. VIP is a premium 1-to-1
 *  course, not a group cohort with its own weekly content track, so it has
 *  no dedicated Challenges of its own — by design, not a migration gap. */
export const CHALLENGE_CONTENT_PRODUCTS: ChallengeProductId[] = ["go", "enterprise", "international"];

/** Which product bucket(s) an account reads Challenges from. Every product
 *  reads its own bucket 1:1, except VIP: VIP accounts read the UNION of
 *  every content-bearing product (see CHALLENGE_CONTENT_PRODUCTS) — the same
 *  catalog, same premium-gating, an Elite-tier student already gets. No VIP
 *  content is created; this just points VIP at the existing engine. */
export function challengeProductsFor(product: ChallengeProductId): ChallengeProductId[] {
  return product === "vip" ? CHALLENGE_CONTENT_PRODUCTS : [product];
}

/** Union-aware counterpart to challengesFor() for read-only student/teacher
 *  views. Admin's editor (admin.challenges.tsx) keeps calling challengesFor()
 *  directly with an exact product, since content is still authored per
 *  product — this wrapper only changes what a VIP account is SHOWN. */
export function challengesForAccount(
  list: Challenge[],
  product: ChallengeProductId,
  difficulty: DifficultyId,
): Challenge[] {
  const products = challengeProductsFor(product);
  if (products.length === 1) return challengesFor(list, products[0], difficulty);
  return products
    .flatMap((p) => challengesFor(list, p, difficulty))
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

/* ---------------- Categories ----------------
 * Free-text category names used to tag/color-code challenges. There's no
 * dedicated Supabase table for this (categories are just a string on each
 * challenge row) and it's low-stakes single-admin UI convenience, so it
 * intentionally stays on localStorage — same as before this migration. */

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
