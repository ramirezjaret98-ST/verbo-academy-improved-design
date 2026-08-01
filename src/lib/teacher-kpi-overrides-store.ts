// ============================================================================
// Teacher KPI manual overrides — persistent record of one-off corrections
// approved by super_admin or coordinator_ops (coordinator_fin is intentionally
// excluded to keep separation of duties away from the bonus payout).
//
// An override rewrites a SPECIFIC month's snapshot for a single teacher, so
// bonus-streak recalculations can honour retroactive corrections. It does NOT
// change how future months are computed.
// ============================================================================
import { useSyncExternalStore } from "react";

export type KpiMetric =
  | "connectionPunctuality"
  | "planningPunctuality"
  | "completionRate"
  | "ratingNormalized"
  | "cancellationScore"
  | "responsiveness"
  | "composite"
  | "bonusStreak";

export const KPI_METRIC_LABELS: Record<KpiMetric, string> = {
  connectionPunctuality: "Connection punctuality",
  planningPunctuality: "Planning punctuality",
  completionRate: "Session completion rate",
  ratingNormalized: "Student rating",
  cancellationScore: "Cancellations / No-Shows",
  responsiveness: "Reschedule/Substitute Responsiveness",
  composite: "Composite score",
  bonusStreak: "Bonus streak (months)",
};

export type KpiOverrideAdminType = "super_admin" | "coordinator_ops" | "coordinator_fin";

export const ADMIN_TYPE_LABELS: Record<KpiOverrideAdminType, string> = {
  super_admin: "Super Admin",
  coordinator_ops: "Operations Coordinator",
  coordinator_fin: "Financial Coordinator",
};

export interface KpiOverride {
  id: string;
  teacher_id: string;
  month_key: string;          // "YYYY-MM"
  metric: KpiMetric;
  previous_value: number;
  new_value: number;
  justification: string;
  evidence_name?: string;     // filename only for now (no storage backend)
  admin_id: string;
  admin_name: string;         // signature
  admin_type?: KpiOverrideAdminType; // role at the moment of saving (audit)
  created_at: string;         // ISO
}

export const KPI_OVERRIDES_KEY = "verbo:kpi-overrides";
export const KPI_OVERRIDES_EVENT = "verbo:kpi-overrides-updated";

let cachedSnapshot: KpiOverride[] | null = null;

// ----- Persistence ---------------------------------------------------------
export function loadKpiOverrides(): KpiOverride[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KPI_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as KpiOverride[]) : [];
  } catch {
    return [];
  }
}

function getSnapshot(): KpiOverride[] {
  if (cachedSnapshot === null) cachedSnapshot = loadKpiOverrides();
  return cachedSnapshot;
}

function persist(list: KpiOverride[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KPI_OVERRIDES_KEY, JSON.stringify(list));
    cachedSnapshot = null;
    window.dispatchEvent(new CustomEvent(KPI_OVERRIDES_EVENT));
  } catch {
    /* noop */
  }
}

export function subscribeKpiOverrides(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const invalidate = () => { cachedSnapshot = null; cb(); };
  const onStorage = (e: StorageEvent) => { if (e.key === KPI_OVERRIDES_KEY) invalidate(); };
  window.addEventListener(KPI_OVERRIDES_EVENT, invalidate);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KPI_OVERRIDES_EVENT, invalidate);
    window.removeEventListener("storage", onStorage);
  };
}

// ----- Mutations -----------------------------------------------------------
export type AddKpiOverrideResult =
  | { ok: true; entry: KpiOverride }
  | { ok: false; error: string };

/** Permission check kept alongside the mutation so any caller — including
 * future ones that forget the UI-level gate — cannot bypass separation of
 * duties. coordinator_fin can never adjust; only super_admin can touch the
 * bonusStreak metric. */
export function canAdminOverrideMetric(
  adminType: KpiOverrideAdminType | null | undefined,
  metric: KpiMetric,
): boolean {
  if (adminType === "super_admin") return true;
  if (adminType === "coordinator_ops") return metric !== "bonusStreak";
  return false;
}

export function addKpiOverride(
  input: Omit<KpiOverride, "id" | "created_at">,
): AddKpiOverrideResult {
  if (!canAdminOverrideMetric(input.admin_type ?? null, input.metric)) {
    return { ok: false, error: "You don't have permission to make this adjustment." };
  }
  const entry: KpiOverride = {
    ...input,
    id: `kpio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
  };
  persist([entry, ...loadKpiOverrides()]);
  return { ok: true, entry };
}

/** Replace the entire overrides list — used by retention cleanup. */
export function replaceKpiOverrides(list: KpiOverride[]) {
  persist(list);
}

// ----- Queries -------------------------------------------------------------
export function overridesFor(teacherId: string): KpiOverride[] {
  return loadKpiOverrides().filter((o) => o.teacher_id === teacherId);
}

/** Latest override for a given (teacher, month, metric) — winning value. */
export function latestOverride(
  teacherId: string,
  monthKey: string,
  metric: KpiMetric,
): KpiOverride | null {
  const list = loadKpiOverrides()
    .filter((o) => o.teacher_id === teacherId && o.month_key === monthKey && o.metric === metric)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return list[0] ?? null;
}

/** All overrides that apply to a given (teacher, month), latest per metric. */
export function overridesForMonth(teacherId: string, monthKey: string): Record<KpiMetric, KpiOverride | undefined> {
  const out = {} as Record<KpiMetric, KpiOverride | undefined>;
  for (const o of loadKpiOverrides()) {
    if (o.teacher_id !== teacherId || o.month_key !== monthKey) continue;
    const prev = out[o.metric];
    if (!prev || +new Date(o.created_at) > +new Date(prev.created_at)) out[o.metric] = o;
  }
  return out;
}

// ----- React binding -------------------------------------------------------
export function useKpiOverrides(): KpiOverride[] {
  return useSyncExternalStore(
    (cb) => subscribeKpiOverrides(cb),
    getSnapshot,
    () => [],
  );
}
