// ============================================================================
// Log retention — single configurable period (months) applied to the two logs
// that grow unbounded in localStorage: KPI overrides and the Payments log.
// Same simple getter/setter pattern used by teacher-kpis-threshold.ts.
// ============================================================================
export const LOG_RETENTION_KEY = "verbo:log-retention-months";
export const LOG_RETENTION_DEFAULT = 12;

export function getRetentionMonths(): number {
  if (typeof window === "undefined") return LOG_RETENTION_DEFAULT;
  const raw = localStorage.getItem(LOG_RETENTION_KEY);
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 120 ? n : LOG_RETENTION_DEFAULT;
}

export function setRetentionMonths(v: number) {
  if (typeof window === "undefined") return;
  const n = Math.max(1, Math.min(120, Math.round(v)));
  localStorage.setItem(LOG_RETENTION_KEY, String(n));
}

/** Cutoff timestamp (ms). Entries with date < cutoff are considered old. */
export function retentionCutoffMs(months = getRetentionMonths()): number {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

export function downloadJson(filename: string, data: unknown) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
