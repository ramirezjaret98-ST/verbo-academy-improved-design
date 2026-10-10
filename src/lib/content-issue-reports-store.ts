// Technical content issues a student reports from a unit detail view or from a
// challenge (broken PDF, video, audio, exercise, score not saving, challenge
// that won't open, evidence that won't upload...). Surfaced to admins in
// Admin > Technical Issues.
//
// Backed by Supabase (`public.content_issue_reports`). RLS: a student can
// insert their own reports and only see their own; admins see and update
// everything. Because that's exactly what a plain `select("*")` returns for
// the calling session, we use a single global cache hydrated once + kept in
// sync via Postgres Realtime (like `holidays-store.ts`) — no per-user Map
// needed, Postgres already scopes the result set per session.
//
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export const UNIT_ISSUE_TYPES = [
  "PDF won't download",
  "Video won't play",
  "Audio won't record",
  "Exercise won't load",
  "Score not saving",
  "Other",
] as const;

export const CHALLENGE_ISSUE_TYPES = [
  "The challenge won't open",
  "I can't upload my evidence (submission link)",
  "My completed challenge wasn't counted",
  "My streak didn't update",
  "Other",
] as const;

export type ContentIssueEntityType = "unit" | "challenge";

export type ContentIssueType =
  | (typeof UNIT_ISSUE_TYPES)[number]
  | (typeof CHALLENGE_ISSUE_TYPES)[number];

export type ContentIssueReportStatus = "pending" | "resolved" | "dismissed";

export interface ContentIssueReport {
  id: string;
  studentId: string;
  entityType: ContentIssueEntityType;
  entityId: string;
  entityTitle: string;
  issueType: ContentIssueType;
  detail: string;
  createdAt: string; // ISO
  status: ContentIssueReportStatus;
  resolved_at?: string; // ISO — set when status leaves "pending"
  resolution_note?: string;
}

export const CONTENT_ISSUE_EVENT = "verbo:content-issue-reports-updated";

type Row = Database["public"]["Tables"]["content_issue_reports"]["Row"];

let cache: ContentIssueReport[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let hydrateGeneration = 0;
let refreshQueued = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONTENT_ISSUE_EVENT));
}

function mapRow(row: Row): ContentIssueReport {
  return {
    id: String(row.id),
    studentId: uuidToLegacySync(row.student_id),
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityTitle: row.entity_title ?? "",
    issueType: row.issue_type as ContentIssueType,
    detail: row.detail ?? "",
    createdAt: row.created_at,
    status: row.status,
    resolved_at: row.resolved_at ?? undefined,
    resolution_note: row.resolution_note ?? undefined,
  };
}

function sortDesc(list: ContentIssueReport[]): ContentIssueReport[] {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  const generation = hydrateGeneration;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("content_issue_reports").select("*");
    if (error) {
      console.error("[content-issue-reports-store] failed to load", error);
      return;
    }
    if (generation !== hydrateGeneration) return;
    cache = sortDesc((data ?? []).map(mapRow));
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
    .channel("content-issue-reports-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "content_issue_reports" }, () => {
      invalidateAndRehydrate("refresh");
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

export async function addContentIssueReport(input: {
  studentId: string;
  entityType: ContentIssueEntityType;
  entityId: string;
  entityTitle: string;
  issueType: ContentIssueType;
  detail?: string;
}): Promise<ContentIssueReport> {
    const uuid = await legacyToUuid(input.studentId);
    if (!uuid) {
      throw new Error("Couldn't identify the reporting student");
    }
    const { data, error } = await supabase
      .from("content_issue_reports")
      .insert({
        student_id: uuid,
        entity_type: input.entityType,
        entity_id: input.entityId,
        entity_title: input.entityTitle,
        issue_type: input.issueType,
        detail: input.detail?.trim() || null,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[content-issue-reports-store] failed to save report", error);
      throw error ?? new Error("Technical issue was not saved");
    }
    const saved = mapRow(data);
    cache = sortDesc([saved, ...cache.filter((r) => r.id !== saved.id)]);
    notify();
    return saved;
}

export function loadContentIssueReports(): ContentIssueReport[] {
  if (!hydrated) void hydrate();
  return cache;
}

export async function updateContentIssueReport(
  id: string,
  patch: Pick<ContentIssueReport, "status"> & { resolution_note?: string },
): Promise<ContentIssueReport> {
  const idx = cache.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Report unavailable");
  const next: ContentIssueReport = { ...cache[idx], ...patch };
  const numericId = Number(id);
  if (Number.isFinite(numericId)) {
      const { data, error } = await supabase
        .from("content_issue_reports")
        .update({ status: next.status, resolution_note: patch.resolution_note?.trim() || null })
        .eq("id", numericId).select("*").single();
      if (error || !data) throw error ?? new Error("Technical issue was not updated");
      const saved = mapRow(data);
      cache = cache.map((r) => (r.id === id ? saved : r));
      notify();
      return saved;
  }
  throw new Error("Invalid report ID");
}

export function contentIssuesForUnit(unitId: string): ContentIssueReport[] {
  return loadContentIssueReports().filter(
    (r) => r.entityType === "unit" && r.entityId === unitId,
  );
}

export function subscribeContentIssueReports(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
