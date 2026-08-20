// ============================================================================
// Invoice requests (facturación) — 2026-08-20, Feature A7/A10.
//
// Every individual payment logged to `payment_log_entries` gets exactly one
// `invoice_requests` row with a unique, unguessable token (crypto.randomUUID,
// same convention already used for Storage object paths — see
// content-uploads.ts / materials-store.ts). That token is the ONLY way in:
// the facturación form is a hidden route with no nav link, reachable only via
// the link in the "payment_confirmed" email — this is deliberate (Jaret's
// answer when this was spec'd), not an oversight. There is no RLS policy for
// `anon` on this table on purpose; the public `submit-invoice-request` Edge
// Function (verify_jwt:false) reads/writes it with the service-role key
// after validating the token itself, since a token-only visitor has no
// `auth.uid()` for RLS to key off of.
//
// This module is the single call site for "a payment happened, give the
// payer a way to request their invoice and email them their receipt" — used
// by payments-log.ts's logPayment(), payment-plans.ts's markInstallmentPaid()
// AND createPaymentPlan()'s single-payment branch, so the invariant is simple:
// every row inserted into payment_log_entries with entity_type "individual"
// gets one of these. Group payments are excluded (groups aren't migrated to
// Supabase yet, and there's no invoicing target — see payments-log.ts header).
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

export interface InstallmentContext {
  installmentNumber: number;
  installmentsCount: number;
  planType: "single" | "installments";
}

/** Creates the invoice_requests row for a just-logged individual payment and
 *  fires the "payment_confirmed" email (fire-and-forget, best-effort — same
 *  pattern as notifySessionEvent/notifyAccountEvent, never blocks or fails
 *  the caller's own Mark-as-Paid action if either of these hiccups). */
export async function createInvoiceRequestAndNotify(opts: {
  paymentLogEntryId: number;
  studentUuid: string;
  installment?: InstallmentContext;
}): Promise<void> {
  const token = crypto.randomUUID();
  const { error } = await supabase.from("invoice_requests").insert({
    payment_log_entry_id: opts.paymentLogEntryId,
    student_id: opts.studentUuid,
    token,
  });
  if (error) {
    console.error("[invoice-requests] failed to create invoice_requests row", error);
    return;
  }

  void supabase.functions
    .invoke("notify-payment-event", {
      body: {
        paymentLogEntryId: opts.paymentLogEntryId,
        kind: "payment_confirmed",
        ...(opts.installment ? { extra: opts.installment } : {}),
      },
    })
    .then(({ error: fnError }) => {
      if (fnError) console.error("[invoice-requests] notify-payment-event failed", fnError);
    });
}
