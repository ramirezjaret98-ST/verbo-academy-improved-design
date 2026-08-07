// ============================================================================
// Teacher KPI manual overrides — persistent record of one-off corrections
// approved by super_admin or coordinator_ops (coordinator_fin is intentionally
// excluded to keep separation of duties away from the bonus payout).
//
// An override rewrites a SPECIFIC month's snapshot for a single teacher, so
// bonus-streak recalculations can honour retroactive corrections. It does NOT
// change how future months are computed.
//
// Backed by Supabase (`public.teacher_kpi_overrides`, RLS: SELECT self+admin,
// INSERT coordinator_ops-scoped (super_admin required for bonusStreak),
// DELETE super_admin-only — matches the Data Retention section in
// Admin > Activity Logs, which is itself gated to super_admin). Global cache
// hydrated once + Postgres Realtime, same pattern used across this migration.
// ============================================================================
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

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

export const KPI_OVERRIDES_EVENT = "verbo:kpi-overrides-updated";

type OverrideRow = Database["public"]["Tables"]["teacher_kpi_overrides"]["Row"];

let overridesCache: KpiOverride[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(KPI_OVERRIDES_EVENT));
}

function mapRow(row: OverrideRow): KpiOverride {
  return {
    id: String(row.id),
    teacher_id: uuidToLegacySync(row.teacher_id),
    month_key: row.month_key,
    metric: row.metric,
    previous_value: row.previous_value ?? 0,
    new_value: row.new_value,
    justification: row.justification,
    evidence_name: row.evidence_name ?? undefined,
    admin_id: uuidToLegacySync(row.admin_id),
    admin_name: row.admin_name,
    admin_type: row.admin_type ?? undefined,
    created_at: row.created_at,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("teacher_kpi_overrides")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[teacher-kpi-overrides-store] failed to load overrides", error);
      hydrated = true;
      return;
    }
    overridesCache = (data ?? []).map(mapRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("teacher-kpi-overrides-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "teacher_kpi_overrides" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
}

// ----- Reads -----------------------------------------------------------
export function loadKpiOverrides(): KpiOverride[] {
  if (!hydrated) void hydrate();
  return overridesCache;
}

export function subscribeKpiOverrides(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// ----- Mutations -----------------------------------------------------------
export type AddKpiOverrideResult =
  | { ok: true; entry: KpiOverride }
  | { ok: false; error: string };

/** Permission check kept alongside the mutation so any caller — including
 * future ones that forget the UI-level gate — cannot bypass separation of
 * duties. coordinator_fin can never adjust; only super_admin can touch the
 * bonusStreak metric. Mirrors the `teacher_kpi_overrides_insert` RLS policy
 * exactly, so a request that passes this check will also pass RLS. */
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
  const tempId = `temp-${Date.now()}`;
  const entry: KpiOverride = {
    ...input,
    id: tempId,
    created_at: new Date().toISOString(),
  };
  overridesCache = [entry, ...overridesCache];
  notify();

  void (async () => {
    const [teacherUuid, adminUuid] = await Promise.all([
      legacyToUuid(input.teacher_id),
      legacyToUuid(input.admin_id),
    ]);
    if (!teacherUuid || !adminUuid) {
      console.error("[teacher-kpi-overrides-store] unknown teacher/admin id");
      overridesCache = overridesCache.filter((o) => o.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("teacher_kpi_overrides")
      .insert({
        teacher_id: teacherUuid,
        month_key: input.month_key,
        metric: input.metric,
        previous_value: input.previous_value,
        new_value: input.new_value,
        justification: input.justification,
        evidence_name: input.evidence_name ?? null,
        admin_id: adminUuid,
        admin_name: input.admin_name,
        admin_type: input.admin_type ?? null,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[teacher-kpi-overrides-store] failed to save override", error);
      overridesCache = overridesCache.filter((o) => o.id !== tempId);
      notify();
      return;
    }
    const saved = mapRow(data);
    overridesCache = overridesCache.map((o) => (o.id === tempId ? saved : o));
    notify();
  })();

  return { ok: true, entry };
}

/** Retention pruning: deletes every override created before `cutoffMs`.
 *  Replaces the old localStorage-era `replaceKpiOverrides(fullList)` —
 *  Supabase has no cheap "replace the whole table" primitive, so this issues
 *  a targeted DELETE instead. Only super_admin can call this (RLS), matching
 *  the super_admin-only gate on the Data Retention section that's its only
 *  caller. */
export function deleteOldKpiOverrides(cutoffMs: number): void {
  const prev = overridesCache;
  const cutoffIso = new Date(cutoffMs).toISOString();
  overridesCache = overridesCache.filter((o) => +new Date(o.created_at) >= cutoffMs);
  notify();

  void (async () => {
    const { error } = await supabase.from("teacher_kpi_overrides").delete().lt("created_at", cutoffIso);
    if (error) {
      console.error("[teacher-kpi-overrides-store] failed to prune old overrides", error);
      overridesCache = prev;
      notify();
    }
  })();
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
    loadKpiOverrides,
    () => [],
  );
}
