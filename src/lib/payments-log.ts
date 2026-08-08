// ============================================================================
// Payments log — thin ledger of "Mark as Paid" events across Students &
// Groups. This is NOT a parallel payments table — it's an event log written
// as a side-effect of the existing Mark-as-Paid actions in Students and
// Group Detail, so The Money Lab can show historical Received Income.
//
// The source of truth for a customer's next payment date still lives on the
// student (next_payment) or the group (next_payment). This log only records
// that a payment was collected on a given date.
//
// Individual payments are backed by Supabase (`public.payment_log_entries`,
// RLS: coordinator_fin/super_admin only — matches the Financial gate in
// admin-roles.ts' canAccessAdminPath). Global cache hydrated once + Postgres
// Realtime, same pattern used across this migration (see
// teacher-kpi-overrides-store.ts).
//
// Group payments stay on localStorage for now: groups-store.ts hasn't been
// migrated to Supabase yet (group ids are local freeform strings with no
// bridge to the `groups.id` bigint — unlike `app_users`, `groups` has no
// `legacy_id` column), and none of the real beta users are on a group plan
// today, so this isn't blocking. The public API below transparently merges
// both sources; when groups-store.ts is migrated, the group branch here can
// be swapped for a real insert with no signature changes for callers.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

import type { User } from "./mock-data";
import type { Group } from "./groups-store";

export type PaidEntityType = "individual" | "group";

export interface PaymentLogEntry {
  id: string;
  entity_type: PaidEntityType;
  entity_id: string;
  name: string;         // student name, or "Group Name" for groups
  company?: string;     // for group / corporate individual context
  amount: number;       // MXN
  paid_at: string;      // ISO — when Mark as Paid fired
  month: string;        // YYYY-MM for quick filtering
}

export const PAYMENTS_KEY = "verbo:payments-log";
export const PAYMENTS_EVENT = "verbo:payments-updated";

type PaymentRow = Database["public"]["Tables"]["payment_log_entries"]["Row"];

// ----- Individual payments (Supabase) --------------------------------------

let individualCache: PaymentLogEntry[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PAYMENTS_EVENT));
}

function mapRow(row: PaymentRow): PaymentLogEntry {
  return {
    id: `pay-${row.id}`,
    entity_type: "individual",
    entity_id: row.student_id ? uuidToLegacySync(row.student_id) : "",
    name: row.name,
    company: row.company ?? undefined,
    amount: Number(row.amount),
    paid_at: row.paid_at,
    month: row.month,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    // Warm the user-id bridge first so `uuidToLegacySync` below resolves.
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("payment_log_entries")
      .select("*")
      .eq("entity_type", "individual")
      .order("paid_at", { ascending: false });
    if (error) {
      console.error("[payments-log] failed to load payment_log_entries", error);
      hydrated = true;
      return;
    }
    individualCache = (data ?? []).map(mapRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("payment-log-entries-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "payment_log_entries" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
}

// ----- Group payments (localStorage — see file header) ---------------------

function readGroupPayments(): PaymentLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(localStorage.getItem(PAYMENTS_KEY) || "[]") as PaymentLogEntry[];
    return all.filter((p) => p.entity_type === "group");
  } catch { return []; }
}
function writeGroupPayments(list: PaymentLogEntry[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PAYMENTS_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

// ----- Reads -----------------------------------------------------------
export function loadPayments(): PaymentLogEntry[] {
  if (!hydrated) void hydrate();
  return [...individualCache, ...readGroupPayments()];
}

export function subscribePayments(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(cb);
  // Group payments live in localStorage — pick up cross-tab writes too.
  const onStorage = (e: StorageEvent) => { if (e.key === PAYMENTS_KEY) cb(); };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Log a payment. Individual payments are written to Supabase (optimistic,
 *  temp-id rollback on failure, same convention as addKpiOverride in
 *  teacher-kpi-overrides-store.ts). Group payments are logged to localStorage
 *  only — see file header. */
export function logPayment(input: Omit<PaymentLogEntry, "id" | "month"> & { month?: string }) {
  const paidDate = new Date(input.paid_at);
  const month = input.month ?? monthKey(paidDate);

  if (input.entity_type === "group") {
    const entry: PaymentLogEntry = {
      ...input,
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      month,
    };
    writeGroupPayments([...readGroupPayments(), entry]);
    notify();
    return;
  }

  const tempId = `temp-${Date.now()}`;
  const optimistic: PaymentLogEntry = { ...input, id: tempId, month };
  individualCache = [optimistic, ...individualCache];
  notify();

  void (async () => {
    const studentUuid = await legacyToUuid(input.entity_id);
    if (!studentUuid) {
      console.error("[payments-log] unknown student id, dropping optimistic payment", input.entity_id);
      individualCache = individualCache.filter((p) => p.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("payment_log_entries")
      .insert({
        entity_type: "individual",
        student_id: studentUuid,
        name: input.name,
        company: input.company ?? null,
        amount: input.amount,
        paid_at: input.paid_at,
        month,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[payments-log] failed to save payment_log_entries", error);
      individualCache = individualCache.filter((p) => p.id !== tempId);
      notify();
      return;
    }
    const saved = mapRow(data);
    individualCache = individualCache.map((p) => (p.id === tempId ? saved : p));
    notify();
  })();
}

export function paymentsForMonth(mkey: string): PaymentLogEntry[] {
  return loadPayments().filter((p) => p.month === mkey);
}

export function paymentForEntityInMonth(
  entityType: PaidEntityType,
  entityId: string,
  mkey: string,
): PaymentLogEntry | undefined {
  return loadPayments().find(
    (p) => p.entity_type === entityType && p.entity_id === entityId && p.month === mkey,
  );
}

/** Retention pruning: deletes every individual payment older than `cutoffMs`
 *  from Supabase (optimistic, rollback on failure), and prunes group
 *  payments older than `cutoffMs` from localStorage. Replaces the old
 *  localStorage-era `replacePayments(fullList)` — mirrors
 *  deleteOldKpiOverrides in teacher-kpi-overrides-store.ts. */
export function deleteOldPayments(cutoffMs: number): void {
  const cutoffIso = new Date(cutoffMs).toISOString();

  writeGroupPayments(readGroupPayments().filter((p) => +new Date(p.paid_at) >= cutoffMs));

  const prev = individualCache;
  individualCache = individualCache.filter((p) => +new Date(p.paid_at) >= cutoffMs);
  notify();

  void (async () => {
    const { error } = await supabase
      .from("payment_log_entries")
      .delete()
      .eq("entity_type", "individual")
      .lt("paid_at", cutoffIso);
    if (error) {
      console.error("[payments-log] failed to prune old payment_log_entries", error);
      individualCache = prev;
      notify();
    }
  })();
}

// ---------------------------------------------------------------------------
// Amount derivation — no per-customer price is stored today, so we derive an
// expected monthly amount from access plan tier. Easy to swap for a real
// `monthly_amount` field later.
// ---------------------------------------------------------------------------
const PLAN_RATE: Record<string, number> = {
  Core: 4000,
  Advance: 6000,
  Elite: 9000,
  Signature: 15000,
};
const DEFAULT_INDIVIDUAL_RATE = 5000;
const DEFAULT_GROUP_MULTIPLIER = 1.6; // groups pay more (multi-seat contract)

export function expectedAmountForStudent(u: User): number {
  return PLAN_RATE[u.access_plan ?? ""] ?? DEFAULT_INDIVIDUAL_RATE;
}
export function expectedAmountForGroup(g: Group): number {
  const base = PLAN_RATE[g.access_plan ?? ""] ?? DEFAULT_INDIVIDUAL_RATE;
  return Math.round(base * DEFAULT_GROUP_MULTIPLIER);
}
