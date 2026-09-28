import { sendResendEmail, type DeliveryResult } from "./email-delivery.ts";

/** Freeze the message and persist each acceptance across next-day retries. */
export async function sendJobEmail(
  options: Parameters<typeof sendResendEmail>[0],
  admin: { rpc: (name: string, args: Record<string, unknown>) => any },
  jobId?: string,
  runtime?: Parameters<typeof sendResendEmail>[1],
): Promise<DeliveryResult> {
  let message = { from: options.from, to: options.to, subject: options.subject, html: options.html };
  if (jobId) {
    const { data, error } = await admin.rpc("prepare_session_email_delivery", {
      p_job_id: jobId, p_delivery_key: options.idempotencyKey, p_message: message,
    });
    if (error || !data?.message) return { ok: false, code: "delivery_not_prepared", attempts: 0 };
    if (data.sent) return { ok: true, id: data.id, attempts: 0 };
    message = data.message;
  }
  const result = await sendResendEmail({ ...options, ...message }, runtime);
  if (jobId && result.ok) {
    const { error } = await admin.rpc("confirm_session_email_delivery", {
      p_job_id: jobId, p_delivery_key: options.idempotencyKey, p_provider_id: result.id ?? null,
    });
    if (error) return { ok: false, code: "delivery_receipt_not_saved", attempts: result.attempts };
  }
  return result;
}
