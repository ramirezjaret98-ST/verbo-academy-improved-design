// ============================================================================
// Bonus threshold — extracted into its own module so the KPI history store can
// read it without importing teacher-kpis.ts (which itself imports the history
// store). Prevents a circular dependency.
// ============================================================================
export const BONUS_THRESHOLD_KEY = "verbo:bonus-threshold";
export const BONUS_THRESHOLD_DEFAULT = 85;

export function getBonusThreshold(): number {
  if (typeof window === "undefined") return BONUS_THRESHOLD_DEFAULT;
  const raw = localStorage.getItem(BONUS_THRESHOLD_KEY);
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : BONUS_THRESHOLD_DEFAULT;
}

export function setBonusThreshold(v: number) {
  if (typeof window !== "undefined") localStorage.setItem(BONUS_THRESHOLD_KEY, String(Math.round(v)));
}
