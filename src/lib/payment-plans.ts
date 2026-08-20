// ============================================================================
// Student payment plans (2026-08-19) — replaces `custom_price` as the source
// of truth for what a student owes once a plan exists for them (see
// payments-log.ts's expectedAmountForStudent, updated in the same batch).
//
// A plan is either:
//  - "single": one lump-sum payment. Recorded as already paid the moment the
//    plan is created (no due date to track, no alerts) — matches Jaret's
//    spec: "si el alumno paga en una sola exhibición... ya está pagado".
//  - "installments": N installments spread over time. The total amount is
//    auto-divided evenly across the chosen count (last installment absorbs
//    any rounding remainder so the sum always equals the total exactly).
//    Due dates default to `firstDueDate + i * frequencyDays` but can be
//    edited individually afterward — "frecuencia libre": an admin can move
//    any single installment's due date without touching the others.
//
// `method` (transferencia, depósito, MSI, meses con intereses, etc.) is a
// free-text/tag field only — purely informational. No interest calculation
// is performed on top of `totalAmount`, per Jaret's explicit answer.
//
// Backed by Supabase (`public.payment_plans` + `public.payment_installments`,
// RLS: coordinator_fin/super_admin manage, student reads their own — see the
// 2026-08-19 migration). Global cache hydrated once + Postgres Realtime, same
// pattern used across this codebase (see payments-log.ts, right next to this
// file, for the individual-payments version of the same pattern).
//
// Marking an installment paid inserts directly into `payment_log_entries` —
// NOT via payments-log.ts's logPayment() — specifically to avoid a circular
// import (payments-log.ts's expectedAmountForStudent needs to read this
// module). payments-log.ts already re-hydrates on ANY postgres_changes event
// on that table, so a direct insert here is picked up by The Money Lab the
// same way a normal Mark-as-Paid click would be.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
import { createInvoiceRequestAndNotify } from "@/lib/invoice-requests";
import type { PaymentDetailFields } from "@/lib/payments-log";

export type PlanType = "single" | "installments";
export type InstallmentStatus = "pending" | "paid";
export type PlanStatus = "active" | "completed" | "cancelled";

export interface PaymentInstallment {
  id: string;               // "inst-<row.id>"
  planId: string;            // "plan-<row.id>"
  installmentNumber: number;
  amount: number;
  dueDate: string;           // ISO date, e.g. "2026-09-15"
  status: InstallmentStatus;
  paidAt?: string;
}

export interface PaymentPlan {
  id: string;                 // "plan-<row.id>"
  studentId: string;          // legacy id (matches User.id elsewhere)
  planType: PlanType;
  totalAmount: number;
  method?: string;
  installmentsCount: number;
  frequencyDays?: number;
  firstDueDate: string;
  status: PlanStatus;
  notes?: string;
  createdAt: string;
  installments: PaymentInstallment[];
}

export const PAYMENT_PLANS_EVENT = "verbo:payment-plans-updated";

type PlanRow = Database["public"]["Tables"]["payment_plans"]["Row"];
type InstallmentRow = Database["public"]["Tables"]["payment_installments"]["Row"];

let cache: PaymentPlan[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PAYMENT_PLANS_EVENT));
}

function mapInstallment(row: InstallmentRow): PaymentInstallment {
  return {
    id: `inst-${row.id}`,
    planId: `plan-${row.plan_id}`,
    installmentNumber: row.installment_number,
    amount: Number(row.amount),
    dueDate: row.due_date,
    status: row.status as InstallmentStatus,
    paidAt: row.paid_at ?? undefined,
  };
}

function mapPlan(row: PlanRow, installments: PaymentInstallment[]): PaymentPlan {
  return {
    id: `plan-${row.id}`,
    studentId: row.student_id ? uuidToLegacySync(row.student_id) : "",
    planType: row.plan_type as PlanType,
    totalAmount: Number(row.total_amount),
    method: row.method ?? undefined,
    installmentsCount: row.installments_count,
    frequencyDays: row.frequency_days ?? undefined,
    firstDueDate: row.first_due_date,
    status: row.status as PlanStatus,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    installments: installments
      .filter((i) => i.planId === `plan-${row.id}`)
      .sort((a, b) => a.installmentNumber - b.installmentNumber),
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const [plansRes, instRes] = await Promise.all([
      supabase.from("payment_plans").select("*").order("created_at", { ascending: false }),
      supabase.from("payment_installments").select("*"),
    ]);
    if (plansRes.error) console.error("[payment-plans] failed to load payment_plans", plansRes.error);
    if (instRes.error) console.error("[payment-plans] failed to load payment_installments", instRes.error);
    const installments = (instRes.data ?? []).map(mapInstallment);
    cache = (plansRes.data ?? []).map((row) => mapPlan(row, installments));
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("payment-plans-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "payment_plans" }, () => {
      hydrated = false;
      void hydrate();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "payment_installments" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
}

export function loadPaymentPlans(): PaymentPlan[] {
  if (!hydrated) void hydrate();
  return cache;
}

export function subscribePaymentPlans(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The student's current active plan, if any (a student has at most one
 *  active plan at a time — creating a new one should cancel the old one;
 *  enforced by callers, not the DB, to keep the schema simple). */
export function activePlanForStudent(studentId: string): PaymentPlan | undefined {
  return loadPaymentPlans().find((p) => p.studentId === studentId && p.status === "active");
}

export function nextPendingInstallment(plan: PaymentPlan): PaymentInstallment | undefined {
  return plan.installments
    .filter((i) => i.status === "pending")
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];
}

/** The amount this student currently owes, per their active payment plan —
 *  `null` when they have none (caller falls back to custom_price / plan
 *  default, see payments-log.ts's expectedAmountForStudent). Single-payment
 *  plans are already paid in full, so they still report `totalAmount` here
 *  (there's nothing pending, but it's still "what they pay" for display
 *  purposes) — callers that care about outstanding balance should check
 *  `nextPendingInstallment` instead. */
export function currentAmountForStudent(studentId: string): number | null {
  const plan = activePlanForStudent(studentId);
  if (!plan) return null;
  if (plan.planType === "single") return plan.totalAmount;
  const next = nextPendingInstallment(plan);
  return next ? next.amount : plan.totalAmount / plan.installmentsCount;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Evenly divides `totalAmount` across `count` installments, spaced
 *  `frequencyDays` apart starting at `firstDueDate`. The last installment
 *  absorbs the rounding remainder (MXN, 2 decimals) so the sum always equals
 *  totalAmount exactly. Purely a default seed — each due date/amount can be
 *  edited individually after creation via updateInstallment(). */
export function computeInstallmentSchedule(
  totalAmount: number,
  count: number,
  firstDueDate: string,
  frequencyDays: number,
): { installmentNumber: number; amount: number; dueDate: string }[] {
  const base = Math.round((totalAmount / count) * 100) / 100;
  const out: { installmentNumber: number; amount: number; dueDate: string }[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const amount = isLast ? Math.round((totalAmount - allocated) * 100) / 100 : base;
    allocated += amount;
    out.push({
      installmentNumber: i + 1,
      amount,
      dueDate: i === 0 ? firstDueDate : addDays(firstDueDate, frequencyDays * i),
    });
  }
  return out;
}

export interface CreatePaymentPlanInput {
  studentId: string;          // legacy id
  studentName: string;        // for the payment_log_entries row on a single-payment plan
  planType: PlanType;
  totalAmount: number;
  method?: string;
  installmentsCount?: number; // required + >=1 when planType === "installments"
  frequencyDays?: number;     // required when planType === "installments"
  firstDueDate: string;       // ISO date — for "single", the (already-paid) payment date
  notes?: string;
  createdBy?: string;         // legacy id of the admin creating it
}

/** Creates a payment plan and its installment rows. For a "single" plan this
 *  creates exactly one installment already marked `paid` and logs a
 *  `payment_log_entries` row immediately (no alerts, no pending balance — see
 *  file header). For "installments" it seeds the schedule via
 *  computeInstallmentSchedule(), all `pending`.
 *
 *  Any previously-active plan for this student is marked `cancelled` first —
 *  a student has at most one active plan at a time, and the new plan is what
 *  now determines what they owe (replaces custom_price as source of truth,
 *  per Jaret's explicit answer). */
export async function createPaymentPlan(
  input: CreatePaymentPlanInput,
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  if (!(input.totalAmount > 0)) return { ok: false, error: "El monto total debe ser mayor a 0." };
  const studentUuid = await legacyToUuid(input.studentId);
  if (!studentUuid) return { ok: false, error: "No se encontró la cuenta real de este alumno." };
  const createdByUuid = input.createdBy ? await legacyToUuid(input.createdBy) : null;

  const existing = loadPaymentPlans().filter((p) => p.studentId === input.studentId && p.status === "active");
  for (const p of existing) {
    const planDbId = Number(p.id.replace("plan-", ""));
    await supabase.from("payment_plans").update({ status: "cancelled" }).eq("id", planDbId);
  }

  const count = input.planType === "single" ? 1 : Math.max(1, input.installmentsCount ?? 1);
  const { data: planRow, error: planErr } = await supabase
    .from("payment_plans")
    .insert({
      student_id: studentUuid,
      plan_type: input.planType,
      total_amount: input.totalAmount,
      method: input.method || null,
      installments_count: count,
      frequency_days: input.planType === "installments" ? (input.frequencyDays ?? 30) : null,
      first_due_date: input.firstDueDate,
      notes: input.notes || null,
      created_by: createdByUuid,
    })
    .select("*")
    .single();
  if (planErr || !planRow) {
    return { ok: false, error: planErr?.message || "No se pudo crear el plan de pago." };
  }

  if (input.planType === "single") {
    const paidAt = new Date().toISOString();
    const { error: instErr } = await supabase.from("payment_installments").insert({
      plan_id: planRow.id,
      installment_number: 1,
      amount: input.totalAmount,
      due_date: input.firstDueDate,
      status: "paid",
      paid_at: paidAt,
    });
    if (instErr) console.error("[payment-plans] failed to create single installment", instErr);
    const { data: logRow, error: logErr } = await supabase
      .from("payment_log_entries")
      .insert({
        entity_type: "individual",
        student_id: studentUuid,
        name: input.studentName,
        amount: input.totalAmount,
        paid_at: paidAt,
        month: paidAt.slice(0, 7),
        method: input.method || null,
      })
      .select("id")
      .single();
    if (logErr || !logRow) {
      console.error("[payment-plans] failed to log single-payment as paid", logErr);
    } else {
      // 2026-08-20: a single-payment plan is recorded as already paid the
      // moment it's created (see file header) — there's no separate
      // "Mark as Paid" click for this path, but it's still a real row in
      // payment_log_entries, so the student still gets a payment
      // confirmation + a way to request their invoice, same as any other
      // individual payment (see invoice-requests.ts).
      void createInvoiceRequestAndNotify({
        paymentLogEntryId: logRow.id,
        studentUuid,
        installment: { installmentNumber: 1, installmentsCount: 1, planType: "single" },
      });
    }
  } else {
    const schedule = computeInstallmentSchedule(
      input.totalAmount,
      count,
      input.firstDueDate,
      input.frequencyDays ?? 30,
    );
    const { error: instErr } = await supabase.from("payment_installments").insert(
      schedule.map((s) => ({
        plan_id: planRow.id,
        installment_number: s.installmentNumber,
        amount: s.amount,
        due_date: s.dueDate,
        status: "pending" as const,
      })),
    );
    if (instErr) return { ok: false, error: instErr.message };
  }

  hydrated = false;
  await hydrate();
  return { ok: true, planId: `plan-${planRow.id}` };
}

/** Marks a single installment as paid and logs it to payment_log_entries
 *  (so The Money Lab's Received Income reflects it — see file header). If
 *  every installment on the plan is now paid, the plan itself is marked
 *  `completed`. */
export async function markInstallmentPaid(
  installmentId: string,
  studentName: string,
  detail?: PaymentDetailFields,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const instDbId = Number(installmentId.replace("inst-", ""));
  const installment = cache.flatMap((p) => p.installments).find((i) => i.id === installmentId);
  const plan = cache.find((p) => p.installments.some((i) => i.id === installmentId));
  if (!installment || !plan) return { ok: false, error: "Installment not found." };

  const paidAt = new Date().toISOString();
  const { error } = await supabase
    .from("payment_installments")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", instDbId);
  if (error) return { ok: false, error: error.message };

  const studentUuid = await legacyToUuid(plan.studentId);
  if (studentUuid) {
    const { data: logRow, error: logErr } = await supabase
      .from("payment_log_entries")
      .insert({
        entity_type: "individual",
        student_id: studentUuid,
        name: studentName,
        amount: installment.amount,
        paid_at: paidAt,
        month: paidAt.slice(0, 7),
        method: detail?.method ?? null,
        folio: detail?.folio ?? null,
        tracking_key: detail?.trackingKey ?? null,
        issuing_bank: detail?.issuingBank ?? null,
        receiving_bank: detail?.receivingBank ?? null,
        card_last4: detail?.cardLast4 ?? null,
        method_detail: detail?.methodDetail ?? null,
      })
      .select("id")
      .single();
    if (logErr || !logRow) {
      console.error("[payment-plans] failed to log installment payment", logErr);
    } else {
      void createInvoiceRequestAndNotify({
        paymentLogEntryId: logRow.id,
        studentUuid,
        installment: {
          installmentNumber: installment.installmentNumber,
          installmentsCount: plan.installmentsCount,
          planType: "installments",
        },
      });
    }
  }

  const stillPending = plan.installments.some((i) => i.id !== installmentId && i.status === "pending");
  if (!stillPending) {
    const planDbId = Number(plan.id.replace("plan-", ""));
    await supabase.from("payment_plans").update({ status: "completed" }).eq("id", planDbId);
  }

  hydrated = false;
  await hydrate();
  return { ok: true };
}

export async function updateInstallmentDueDate(installmentId: string, dueDate: string): Promise<void> {
  const instDbId = Number(installmentId.replace("inst-", ""));
  const { error } = await supabase.from("payment_installments").update({ due_date: dueDate }).eq("id", instDbId);
  if (error) { console.error("[payment-plans] failed to update installment due date", error); return; }
  hydrated = false;
  await hydrate();
}

export async function cancelPaymentPlan(planId: string): Promise<void> {
  const planDbId = Number(planId.replace("plan-", ""));
  const { error } = await supabase.from("payment_plans").update({ status: "cancelled" }).eq("id", planDbId);
  if (error) { console.error("[payment-plans] failed to cancel plan", error); return; }
  hydrated = false;
  await hydrate();
}
