// Free-text issue reports a teacher files from Teacher > Financial.
// Consumed by notifications-store to surface an admin notification in the
// bell (no separate inbox page — reuses /admin/financial).
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
}

export const FIN_ISSUES_EVENT = "verbo:financial-issues-updated";

type FinancialIssueRow = Database["public"]["Tables"]["financial_issues"]["Row"];

function fromRow(row: FinancialIssueRow): FinancialIssue {
  return {
    id: String(row.id),
    teacher_id: uuidToLegacySync(row.teacher_id),
    text: row.text,
    created_at: row.created_at,
  };
}

let cache: FinancialIssue[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
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
      hydratePromise = null;
      return;
    }
    cache = (data ?? []).map(fromRow);
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
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
        hydrated = false;
        hydratePromise = null;
        void hydrate();
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
