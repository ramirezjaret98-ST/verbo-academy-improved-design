// Student → conduct reports against a teacher or another student.
// Independent from student-reports-store.ts (which is the opposite direction:
// teacher writes about student). Anonymous only to the reported person —
// Admin always sees the real reporter identity.
//
// Backed by Supabase (`public.conduct_reports`). RLS: a student can insert
// their own report (as reporter) and only see their own; admins see
// everything and are the only ones who can update status. Since that's
// exactly what a plain `select("*")` returns for the calling session, we use
// a single global cache hydrated once + kept in sync via Postgres Realtime
// (same pattern as `content-issue-reports-store.ts`).
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export type ConductTargetType = "teacher" | "student";
export type ConductCategory =
  | "Inappropriate behavior"
  | "Harassment"
  | "Academic non-compliance"
  | "Other";

export type ConductReportStatus = "pending" | "reviewed" | "dismissed";

export const CONDUCT_CATEGORIES: ConductCategory[] = [
  "Inappropriate behavior",
  "Harassment",
  "Academic non-compliance",
  "Other",
];

export interface ConductReport {
  id: string;
  reporter_id: string;
  target_type: ConductTargetType;
  target_id: string;
  category: ConductCategory;
  text: string;
  created_at: string; // ISO
  status: ConductReportStatus;
  reviewed_at?: string; // ISO — when status moved to reviewed or dismissed
}

export const CONDUCT_REPORTS_EVENT = "verbo:conduct-reports-updated";

type Row = Database["public"]["Tables"]["conduct_reports"]["Row"];

let cache: ConductReport[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONDUCT_REPORTS_EVENT));
}

function mapRow(row: Row): ConductReport {
  return {
    id: String(row.id),
    reporter_id: uuidToLegacySync(row.reporter_id),
    target_type: row.target_type,
    target_id: uuidToLegacySync(row.target_id),
    category: row.category as ConductCategory,
    text: row.text,
    created_at: row.created_at,
    status: row.status,
    reviewed_at: row.reviewed_at ?? undefined,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("conduct_reports").select("*");
    if (error) {
      console.error("[conduct-reports-store] failed to load", error);
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
    .channel("conduct-reports-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "conduct_reports" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

export function addConductReport(input: {
  reporterId: string;
  targetType: ConductTargetType;
  targetId: string;
  category: ConductCategory;
  text: string;
}): ConductReport {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const report: ConductReport = {
    id: tempId,
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    category: input.category,
    text: input.text.trim(),
    created_at: new Date().toISOString(),
    status: "pending",
  };
  cache = [report, ...cache];
  notify();

  void (async () => {
    const [reporterUuid, targetUuid] = await Promise.all([
      legacyToUuid(input.reporterId),
      legacyToUuid(input.targetId),
    ]);
    if (!reporterUuid || !targetUuid) {
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("conduct_reports")
      .insert({
        reporter_id: reporterUuid,
        target_type: input.targetType,
        target_id: targetUuid,
        category: input.category,
        text: report.text,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[conduct-reports-store] failed to save report", error);
      cache = cache.filter((r) => r.id !== tempId);
      notify();
      return;
    }
    cache = cache.map((r) => (r.id === tempId ? mapRow(data) : r));
    notify();
  })();

  return report;
}

export function loadConductReports(): ConductReport[] {
  if (!hydrated) void hydrate();
  return cache;
}

export function updateConductReport(
  id: string,
  patch: Partial<Pick<ConductReport, "status">>,
): ConductReport | null {
  const idx = cache.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const prev = cache[idx];
  const next: ConductReport = { ...prev, ...patch };
  if (patch.status && patch.status !== "pending") {
    next.reviewed_at = new Date().toISOString();
  }
  cache = cache.map((r) => (r.id === id ? next : r));
  notify();

  const numericId = Number(id);
  if (Number.isFinite(numericId)) {
    void (async () => {
      const { error } = await supabase
        .from("conduct_reports")
        .update({ status: next.status, reviewed_at: next.reviewed_at ?? null })
        .eq("id", numericId);
      if (error) {
        console.error("[conduct-reports-store] failed to update report", error);
        cache = cache.map((r) => (r.id === id ? prev : r));
        notify();
      }
    })();
  }
  return next;
}

export function subscribeConductReports(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
