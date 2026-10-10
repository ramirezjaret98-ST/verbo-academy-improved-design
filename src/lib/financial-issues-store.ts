// Free-text issue reports a teacher files from Teacher > Financial.
// Consumed by notifications-store to surface an admin notification in the
// bell and the Admin financial issues queue.
//
// Backed by Supabase (`public.financial_issues`). Reads are served from an
// in-memory cache kept in sync via Postgres Realtime, so
// `loadFinancialIssues()` stays synchronous for existing call sites. Writes
// (`addFinancialIssue`) talk to Supabase directly and are therefore async.
//
// `financial_issues.teacher_id` is a real `app_users.id` UUID, while the
// rest of the app still keys everything by the legacy short id ("u2") — see
// `user-id-bridge.ts`. The `FinancialIssue.teacher_id` this store exposes
// stays the LEGACY id (translated on read) so `USERS.find(...)` call sites
// elsewhere don't need to change.
//
// RLS note: `financial_issues_select` only allows the financial coordinator
// (`private.is_coordinator_fin()`, which includes `super_admin`) or the
// issue's own teacher to read a given row — `coordinator_ops` admins won't
// see these, by design (matches the reviewed schema/RLS checklist).
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { legacyToUuid, hydrateUserIdBridge, uuidToLegacySync } from "@/lib/user-id-bridge";

export interface FinancialIssue {
  id: string;
  teacher_id: string; // legacy id, e.g. "u2"
  text: string;
  created_at: string; // ISO
  status: "pending" | "resolved" | "dismissed";
  resolution_note?: string;
  resolved_at?: string;
}

export const FIN_ISSUES_EVENT = "verbo:financial-issues-updated";

type FinancialIssueRow = Database["public"]["Tables"]["financial_issues"]["Row"];

function fromRow(row: FinancialIssueRow): FinancialIssue {
  return {
    id: String(row.id),
    teacher_id: uuidToLegacySync(row.teacher_id),
    text: row.text,
    created_at: row.created_at,
    status: row.status as FinancialIssue["status"],
    resolution_note: row.resolution_note ?? undefined,
    resolved_at: row.resolved_at ?? undefined,
  };
}

let cache: FinancialIssue[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let hydrateGeneration = 0;
let refreshQueued = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIN_ISSUES_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  const generation = hydrateGeneration;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("financial_issues")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      // Expected to return an empty (not erroring) result for a
      // coordinator_ops admin viewing their own dashboard — RLS just omits
      // rows rather than erroring. A real error here means something else
      // (network, auth) went wrong.
      console.error("[financial-issues-store] failed to load financial issues", error);
      return;
    }
    if (generation !== hydrateGeneration) return;
    cache = (data ?? []).map(fromRow);
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

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("financial-issues-store-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "financial_issues" },
      () => {
        invalidateAndRehydrate("refresh");
      },
    )
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

/** Synchronous snapshot of the current in-memory cache. May be empty
 * (or stale) until the initial Supabase fetch resolves. */
export function loadFinancialIssues(): FinancialIssue[] {
  return cache;
}

function getSnapshot(): FinancialIssue[] {
  return cache;
}

export async function addFinancialIssue(input: { teacherId: string; text: string }): Promise<FinancialIssue> {
  const teacherUuid = await legacyToUuid(input.teacherId);
  if (!teacherUuid) {
    throw new Error(`[financial-issues-store] unknown teacher id "${input.teacherId}"`);
  }
  const { data, error } = await supabase
    .from("financial_issues")
    .insert({ teacher_id: teacherUuid, text: input.text.trim() })
    .select()
    .single();
  if (error || !data) {
    throw error ?? new Error("Failed to report the issue");
  }
  const issue = fromRow(data);
  cache = [issue, ...cache];
  notify();
  return issue;
}

export async function updateFinancialIssue(id: string, status: "resolved" | "dismissed", resolutionNote: string): Promise<FinancialIssue> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || !resolutionNote.trim()) throw new Error("A resolution note is required");
  const { data, error } = await supabase.from("financial_issues")
    .update({ status, resolution_note: resolutionNote.trim() })
    .eq("id", numericId).select("*").single();
  if (error || !data) throw error ?? new Error("Financial issue was not updated");
  const saved = fromRow(data);
  cache = cache.map((issue) => issue.id === id ? saved : issue);
  notify();
  return saved;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

export function useFinancialIssues(): FinancialIssue[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => []);
}
