import { createClient } from "jsr:@supabase/supabase-js@2.58.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const digest = async (token: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const date = (value: string) =>
  new Date(value).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    dateStyle: "long",
    timeStyle: "short",
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await request.text();
  if (raw.length > 8192) return json({ error: "Request too large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    if (body.action === "issue") {
      const jwt = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const { data: auth, error: authError } = await admin.auth.getUser(jwt);
      if (authError || !auth.user) return json({ error: "Not authenticated" }, 401);
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { data, error } = await admin.rpc("issue_suspension_notice_access", {
        p_student: auth.user.id,
        p_token_hash: await digest(token),
      });
      if (error) return json({ error: "No active suspension" }, 403);
      return json({ ...data, token });
    }
    if (body.action === "deliver") {
      if (
        typeof body.id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.id) ||
        typeof body.token !== "string" ||
        !/^[0-9a-f-]{72}$/i.test(body.token)
      )
        return json({ error: "Unauthorized" }, 401);
      const { data: job, error } = await admin.rpc("claim_suspension_email", {
        p_id: body.id,
        p_token: body.token,
      });
      if (error || !job) return json({ error: "Unauthorized or already processed" }, 401);
      let ok = false;
      let provider: string | null = null;
      let code = "delivery_exception";
      try {
        const copy = job.notice.copy;
        const ack = job.kind === "acknowledged";
        const deadline = job.notice.deadline_at
          ? `<p><strong>Fecha límite: ${escape(date(job.notice.deadline_at))} (hora de Ciudad de México).</strong></p>`
          : "<p>El plazo de siete días comenzará cuando veas por primera vez el aviso dentro de Academy.</p>";
        const second = ack
          ? `<h2 style="font-size:19px;color:#9f3412">${escape(copy.warningTitle)}</h2><p>${escape(copy.warning)}</p>${deadline}<p>Registramos tu clic en «Entendido» el ${escape(date(job.notice.acknowledged_at))}. Este correo conserva el contenido de ambos avisos.</p>`
          : "<p>Ingresa a Academy para consultar el aviso y el estado de tu cuenta.</p>";
        const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#334155"><div style="max-width:580px;margin:32px auto;border-radius:18px;overflow:hidden;background:white;border:1px solid #e2e8f0"><div style="padding:25px;background:#01304a;color:white;font-weight:bold;font-size:21px">VERBO ACADEMY</div><div style="padding:30px;line-height:1.7"><h1 style="font-size:23px;color:#01304a">${escape(copy.title)}</h1><p>${escape(copy.body)}</p>${second}<p><a href="https://wa.link/zomggz" style="display:inline-block;border-radius:14px;background:#f38934;padding:12px 25px;color:white;text-decoration:none;font-weight:bold">Contactar a Verbo</a></p><p><a href="https://verboacademic.com/login">Ir a Academy</a></p></div><div style="padding:20px;background:#f8fafc;font-size:12px">Verbo Language Solutions · Aviso relacionado con tu cuenta. La baja requiere revisión de Administración.</div></div></body></html>`;
        const apiKey = Deno.env.get("RESEND_API_KEY");
        if (!apiKey) throw new Error("missing_email_configuration");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `suspension-${job.id}`,
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>",
            to: [job.recipient],
            subject: ack
              ? "Constancia de recepción del aviso de suspensión · Verbo Academy"
              : "Tu acceso a Verbo Academy está suspendido",
            html,
          }),
        });
        const result = await response.json().catch(() => ({}));
        ok = response.ok && typeof result.id === "string";
        provider = ok ? result.id : null;
        code =
          result.name === "daily_quota_exceeded" || result.name === "monthly_quota_exceeded"
            ? "quota_exceeded"
            : `provider_${response.status}`;
      } catch (error) {
        code =
          error instanceof Error && error.message === "missing_email_configuration"
            ? error.message
            : "delivery_exception";
      }
      const { error: finishError } = await admin.rpc("finish_suspension_email", {
        p_id: body.id,
        p_token: body.token,
        p_ok: ok,
        p_provider: provider,
        p_error: ok ? null : code,
      });
      return finishError ? json({ error: "Receipt not saved" }, 503) : json({ ok });
    }
    if (
      typeof body.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.token) ||
      ![
        "shown",
        "warning_opened",
        "acknowledged",
        "closed",
        "contact_opened",
        "returned_to_login",
        "history",
      ].includes(String(body.action))
    )
      return json({ error: "Unauthorized" }, 401);
    const { data, error } = await admin.rpc("suspension_notice_action", {
      p_token_hash: await digest(body.token),
      p_action: body.action,
    });
    if (error)
      return json(
        {
          error:
            error.message === "Wait five seconds"
              ? "Espera cinco segundos antes de continuar."
              : "No se pudo registrar la acción. Reintenta o inicia sesión de nuevo.",
        },
        409,
      );
    return json(data);
  } catch {
    return json({ error: "No se pudo completar la solicitud. Intenta de nuevo." }, 503);
  }
});
