// Per-session teacher → student performance ratings.
//
// Two coexisting shapes:
//   1. Base 4-key rating (1-5) — kept for legacy seed data and back-compat.
//   2. `subskills` map (0-100) written by the Session Report — the real,
//      granular values captured by teachers. When present, downstream
//      analytics (PerformanceAnalytics) prefer these over the derived
//      base-key hash offsets.
//
// A single session may have EITHER shape or BOTH; readers must tolerate
// partial data — teachers only rate the subskills actually worked on.
export interface PerformanceRating {
  fluency: number;
  vocabulary: number;
  confidence: number;
  grammar: number;
  /** Optional per-subskill scores, 0-100. Key format: "Macro:Sub". */
  subskills?: Record<string, number>;
}

export type PerformanceMap = Record<string, PerformanceRating>;

export const PERFORMANCE_KEY = "verbo:performance";
export const PERFORMANCE_EVENT = "verbo:performance-updated";

// Seed averages so the dashboard has data on first load.
const SEED: PerformanceMap = {
  s5: { fluency: 5, vocabulary: 4, confidence: 5, grammar: 4 },
  s6: { fluency: 4, vocabulary: 4, confidence: 3, grammar: 4 },
  s8: { fluency: 4, vocabulary: 5, confidence: 4, grammar: 3 },
};

let cached: PerformanceMap | null = null;

export function loadPerformance(): PerformanceMap {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = localStorage.getItem(PERFORMANCE_KEY);
    if (raw) return JSON.parse(raw) as PerformanceMap;
  } catch { /* noop */ }
  try { localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(SEED)); } catch { /* noop */ }
  return SEED;
}

export function getPerformanceSnapshot(): PerformanceMap {
  if (cached === null) cached = loadPerformance();
  return cached;
}

export function getServerPerformanceSnapshot(): PerformanceMap {
  return SEED;
}

export function savePerformance(sessionId: string, rating: PerformanceRating) {
  if (typeof window === "undefined") return;
  const current = { ...getPerformanceSnapshot(), [sessionId]: rating };
  cached = current;
  try {
    localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent(PERFORMANCE_EVENT));
  } catch { /* noop */ }
}

/** Save a subskill-only evaluation (0-100 per subskill). Derives the 4
 *  legacy base averages from the subskills' `base` mapping so any surface
 *  still consuming the base keys keeps working. */
export function saveSubskillEvaluation(sessionId: string, subskills: Record<string, number>) {
  // Group subskill scores by their base key, average, and convert 0-100 → 0-5.
  // Mapping lives in skills-taxonomy but we avoid a circular import by
  // reading the base out of the key convention when possible; callers pass
  // pre-mapped totals via `saveSubskillEvaluation` if they want to control it.
  // To keep this file base-key-agnostic we let PerformanceAnalytics compute
  // final averages from `subskills` directly and only mirror an approximate
  // 4-base average here (mean of all rated subskills, scaled to 0-5).
  const values = Object.values(subskills).filter((v) => typeof v === "number");
  const mean100 = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  const mean5 = Math.round((mean100 / 100) * 5 * 10) / 10; // 1 decimal
  const rating: PerformanceRating = {
    fluency: mean5, vocabulary: mean5, confidence: mean5, grammar: mean5,
    subskills,
  };
  savePerformance(sessionId, rating);
}

export function subscribePerformance(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const invalidate = () => { cached = null; cb(); };
  const onStorage = (e: StorageEvent) => { if (e.key === PERFORMANCE_KEY) invalidate(); };
  window.addEventListener(PERFORMANCE_EVENT, invalidate);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PERFORMANCE_EVENT, invalidate);
    window.removeEventListener("storage", onStorage);
  };
}

export function averagePerformance(sessionIds: string[], map: PerformanceMap): PerformanceRating & { count: number } {
  const ratings = sessionIds.map((id) => map[id]).filter(Boolean) as PerformanceRating[];
  const count = ratings.length;
  if (count === 0) return { fluency: 0, vocabulary: 0, confidence: 0, grammar: 0, count: 0 };
  const sum = ratings.reduce(
    (a, r) => ({
      fluency: a.fluency + r.fluency,
      vocabulary: a.vocabulary + r.vocabulary,
      confidence: a.confidence + r.confidence,
      grammar: a.grammar + r.grammar,
    }),
    { fluency: 0, vocabulary: 0, confidence: 0, grammar: 0 },
  );
  return {
    fluency: sum.fluency / count,
    vocabulary: sum.vocabulary / count,
    confidence: sum.confidence / count,
    grammar: sum.grammar / count,
    count,
  };
}
