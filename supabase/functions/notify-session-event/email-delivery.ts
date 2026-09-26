export type DeliveryResult = { ok: boolean; id?: string; status?: number; code?: string; attempts: number };

export function uniqueRecipients(emails: Array<string | null | undefined>): string[] {
  return [...new Set(emails.map(email => email?.trim().toLowerCase()).filter((email): email is string => !!email))];
}

/** Transport success means accepted by Resend, not delivered to the inbox. */
export async function sendResendEmail(
  options: { apiKey?: string; from: string; to: string[]; subject: string; html: string; idempotencyKey: string },
  runtime: { fetch: typeof fetch; sleep: (milliseconds: number) => Promise<void> } = {
    fetch, sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  },
): Promise<DeliveryResult> {
  if (!options.apiKey) return { ok: false, code: "missing_api_key", attempts: 0 };
  const to = uniqueRecipients(options.to);
  if (!to.length) return { ok: false, code: "missing_recipient", attempts: 0 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await runtime.fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": options.idempotencyKey },
        body: JSON.stringify({ from: options.from, to, subject: options.subject, html: options.html }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, id: typeof body.id === "string" ? body.id : undefined, attempts: attempt };
      const result = { ok: false, status: response.status, code: typeof body.name === "string" ? body.name : "provider_error", attempts: attempt };
      if (attempt === 3 || (response.status !== 429 && response.status < 500)) return result;
      const retryAfter = Number(response.headers.get("retry-after"));
      await runtime.sleep(Math.min(5000, Math.max(1000 * attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)));
    } catch {
      if (attempt === 3) return { ok: false, code: "transport_error", attempts: attempt };
      await runtime.sleep(1000 * attempt);
    }
  }
  return { ok: false, code: "transport_error", attempts: 3 };
}

export async function emailEventKey(event: string, recipients: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${event}:${uniqueRecipients(recipients).join(",")}`));
  return `session-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
