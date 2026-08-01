// Payments log — thin ledger of "Mark as Paid" events across Students &
// Groups. This is NOT a parallel payments table — it's an event log written
// as a side-effect of the existing Mark-as-Paid actions in Students and
// Group Detail, so The Money Lab can show historical Received Income.
//
// The source of truth for a customer's next payment date still lives on the
// student (next_payment) or the group (next_payment). This log only records
// that a payment was collected on a given date.

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

function read(): PaymentLogEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PAYMENTS_KEY) || "[]"); }
  catch { return []; }
}
function write(list: PaymentLogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(PAYMENTS_EVENT));
  } catch { /* noop */ }
}

export function loadPayments(): PaymentLogEntry[] { return read(); }

/** Replace the entire payments log — used by retention cleanup. */
export function replacePayments(list: PaymentLogEntry[]) { write(list); }

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function logPayment(input: Omit<PaymentLogEntry, "id" | "month"> & { month?: string }) {
  const paidDate = new Date(input.paid_at);
  const entry: PaymentLogEntry = {
    ...input,
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    month: input.month ?? monthKey(paidDate),
  };
  write([...read(), entry]);
}

export function paymentsForMonth(mkey: string): PaymentLogEntry[] {
  return read().filter((p) => p.month === mkey);
}

export function paymentForEntityInMonth(
  entityType: PaidEntityType,
  entityId: string,
  mkey: string,
): PaymentLogEntry | undefined {
  return read().find(
    (p) => p.entity_type === entityType && p.entity_id === entityId && p.month === mkey,
  );
}

export function subscribePayments(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === PAYMENTS_KEY) cb(); };
  window.addEventListener(PAYMENTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PAYMENTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
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
