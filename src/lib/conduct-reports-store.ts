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
  resolution_note?: string;
}

export const CONDUCT_REPORTS_EVENT = "verbo:conduct-reports-updated";

type Row = Database["public"]["Tables"]["conduct_reports"]["Row"];

let cache: ConductReport[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let hydrateGeneration = 0;
let refreshQueued = false;
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
    resolution_note: row.resolution_note ?? undefined,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  const generation = hydrateGeneration;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("conduct_reports").select("*");
    if (error) {
      console.error("[conduct-reports-store] failed to load", error);
      return;
    }
    if (generation !== hydrateGeneration) return;
    cache = (data ?? []).map(mapRow);
    hydrated = true;
    notify();
  })().finally(() => {
    hydratePromise = null;
    if (refreshQueued) { refreshQueued = false; void hydrate(); }
  });
  return hydratePromise;
}

function invalidateAndRehydrate(reason?: "auth" | "refresh") {
  hydrateGeneration++;
  hydrated = false;
  if (reason === "auth") { cache = []; notify(); }
  if (hydratePromise) { refreshQueued = true; return; }
  void hydrate();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("conduct-reports-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "conduct_reports" }, () => {
      invalidateAndRehydrate("refresh");
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

export async function addConductReport(input: {
  reporterId: string;
  targetType: ConductTargetType;
  targetId: string;
  category: ConductCategory;
  text: string;
}): Promise<ConductReport> {
    const [reporterUuid, targetUuid] = await Promise.all([
      legacyToUuid(input.reporterId),
      legacyToUuid(input.targetId),
    ]);
    if (!reporterUuid || !targetUuid) {
      throw new Error("Couldn't identify the reporter or the person being reported");
    }
    const { data, error } = await supabase
      .from("conduct_reports")
      .insert({
        reporter_id: reporterUuid,
        target_type: input.targetType,
        target_id: targetUuid,
        category: input.category,
        text: input.text.trim(),
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[conduct-reports-store] failed to save report", error);
      throw error ?? new Error("Conduct report was not saved");
    }
    const saved = mapRow(data);
    cache = [saved, ...cache.filter((r) => r.id !== saved.id)];
    notify();
    return saved;
}

export function loadConductReports(): ConductReport[] {
  if (!hydrated) void hydrate();
  return cache;
}

export async function updateConductReport(
  id: string,
  patch: Pick<ConductReport, "status"> & { resolution_note?: string },
): Promise<ConductReport> {
  const idx = cache.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Report unavailable");
  const next: ConductReport = { ...cache[idx], ...patch };
  const numericId = Number(id);
  if (Number.isFinite(numericId)) {
      const { data, error } = await supabase
        .from("conduct_reports")
        .update({ status: next.status, resolution_note: patch.resolution_note?.trim() || null })
        .eq("id", numericId).select("*").single();
      if (error || !data) throw error ?? new Error("Conduct report was not updated");
      const saved = mapRow(data);
      cache = cache.map((r) => (r.id === id ? saved : r));
      notify();
      return saved;
  }
  throw new Error("Invalid report ID");
}

export function subscribeConductReports(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
