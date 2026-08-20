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
import { defaultMonthlyPrice } from "@/lib/student-model";

import type { User } from "./mock-data";
import type { Group } from "./groups-store";
import { currentAmountForStudent } from "./payment-plans";
import { createInvoiceRequestAndNotify } from "./invoice-requests";

export type PaidEntityType = "individual" | "group";

// 2026-08-20 (Feature A7) — payment method + receipt detail, all OPTIONAL
// regardless of method (Jaret's explicit correction: "haz que todos los
// campos sean opcionales ya que a veces los depositos no tienen los mismos
// datos de transferencias y asi"). Which fields the Mark-as-Paid modal shows
// still varies by method (his earlier answer), but none are required.
// Individual payments only — persisted to the new payment_log_entries
// columns; group payments carry these on the localStorage-only entry for
// display parity, but never generate an invoice_requests row (see
// invoice-requests.ts header).
export type PaymentMethod = "transferencia" | "deposito" | "tarjeta" | "efectivo" | "otro";

export interface PaymentDetailFields {
  method?: PaymentMethod;
  folio?: string;
  trackingKey?: string;    // clave de rastreo
  issuingBank?: string;    // banco emisor
  receivingBank?: string;  // banco receptor
  cardLast4?: string;
  methodDetail?: string;   // free text — referencia, notas, "otro" description
  receiptPdfUrl?: string;  // filled in later by the PDF-generation phase
}

export interface PaymentLogEntry extends PaymentDetailFields {
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
    method: (row.method as PaymentMethod | null) ?? undefined,
    folio: row.folio ?? undefined,
    trackingKey: row.tracking_key ?? undefined,
    issuingBank: row.issuing_bank ?? undefined,
    receivingBank: row.receiving_bank ?? undefined,
    cardLast4: row.card_last4 ?? undefined,
    methodDetail: row.method_detail ?? undefined,
    receiptPdfUrl: row.receipt_pdf_url ?? undefined,
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
        method: input.method ?? null,
        folio: input.folio ?? null,
        tracking_key: input.trackingKey ?? null,
        issuing_bank: input.issuingBank ?? null,
        receiving_bank: input.receivingBank ?? null,
        card_last4: input.cardLast4 ?? null,
        method_detail: input.methodDetail ?? null,
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
    void createInvoiceRequestAndNotify({ paymentLogEntryId: data.id, studentUuid });
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

/** Every payment logged for one entity in one month — plural sibling of
 *  `paymentForEntityInMonth`. A student on an installment payment plan
 *  (payment-plans.ts) can legitimately have more than one entry in the same
 *  month (e.g. two biweekly installments both due in the same calendar
 *  month), so The Money Lab sums THIS (not just the single most-recent
 *  entry) for "amount received this month" — see admin.financial.money-lab.tsx.
 *  2026-08-19: added after finding accidental duplicate "Mark as Paid" log
 *  rows (same entity/month/amount, seconds apart) were silently inflating
 *  the Trend chart's raw per-month sum while the summary card's old
 *  single-entry lookup showed a different, lower number under the exact same
 *  "Received Income" label — both now go through this one function. */
export function paymentsForEntityInMonth(
  entityType: PaidEntityType,
  entityId: string,
  mkey: string,
): PaymentLogEntry[] {
  return loadPayments().filter(
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
// Amount derivation. Priority, highest first (2026-08-19 — Feature A):
//  1. An active payment plan (payment-plans.ts) — the current/next
//     installment amount (or the lump sum for a single-payment plan). This
//     REPLACES custom_price as the source of truth once a plan exists for a
//     student, per Jaret's explicit answer when this was spec'd.
//  2. `custom_price` — per-student override, set by admin for negotiated
//     deals (students-store.ts), for students with no plan configured yet.
//  3. The official price-per-session table (`PRICE_PER_SESSION` in
//     student-model.ts) × the student's real weekly cadence, via
//     `defaultMonthlyPrice`.
// Groups have no override field yet (see groups-store.ts header — groups
// aren't migrated to Supabase, and no payment plan support for groups
// either), so they always use the plan default × the multi-seat multiplier
// below.
// ---------------------------------------------------------------------------
const DEFAULT_GROUP_MULTIPLIER = 1.6; // groups pay more (multi-seat contract)

export function expectedAmountForStudent(u: User): number {
  const planAmount = currentAmountForStudent(u.id);
  if (planAmount != null) return planAmount;
  if (u.custom_price != null) return u.custom_price;
  return defaultMonthlyPrice(u.access_plan, u.sessions_per_week);
}
export function expectedAmountForGroup(g: Group): number {
  const base = defaultMonthlyPrice(g.access_plan, g.sessions_per_week);
  return Math.round(base * DEFAULT_GROUP_MULTIPLIER);
}
