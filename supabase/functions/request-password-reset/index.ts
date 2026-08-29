// Public (verify_jwt:false): first half of the self-service "forgot
// password" flow. Added 2026-08-29 to replace Supabase Auth's own built-in
// recovery email, which was reported broken end-to-end: the copy was the
// bare unstyled default and the reset link 404'd ("Email link is invalid or
// has expired") because it depends on the project's Auth > URL Configuration
// (Site URL / Redirect URLs) being set up correctly on the Supabase side,
// which it wasn't. Rather than depend on that dashboard config, this pair of
// functions (see confirm-password-reset) rolls the whole flow ourselves,
// the same way notify-session-event/notify-account-event/admin-create-user
// already send every other transactional email in this app: our own token
// in our own table, our own branded Resend email, our own /reset-password
// page. Nothing here depends on Supabase Auth's mailer or its Site URL
// setting at all, so that dashboard misconfiguration can't break it again.
//
// Always responds { ok: true } whether or not the email matches a real
// account, so this endpoint can't be used to enumerate registered emails.
//
// Required secrets: RESEND_API_KEY, RESEND_FROM_EMAIL (already configured -
// same ones admin-create-user's welcome email and notify-account-event use).
//
// NOTE: this file is kept here for version control / reference. It is
// already deployed live to the Supabase project via the Management API —
// uploading this copy through GitHub does NOT redeploy it. If you ever need
// to change this function's behavior, the change has to be applied through
// Supabase directly (ask Claude to redeploy it), not just by editing this
// file in the repo.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://verboacademic.com";
const WHATSAPP_LINK = "https://wa.me/5212461152136";
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // don't re-send if one was just requested

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Same premium template used by notify-session-event / notify-account-event
// / admin-create-user (kept in sync by hand - see notify-session-event for
// the fully annotated original).
function renderEmail(opts: { eyebrow: string; title: string; bodyHtml: string; cta: { label: string; href: string }; helperHtml: string }): string {
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
  @import url('https://api.fontshare.com/v2/css?f[]=open-sauce-sans@400,500,600,700,800&display=swap');
  @media only screen and (max-width:480px) {
    .card-pad { padding-left:22px !important; padding-right:22px !important; }
    .cta-cell { display:block !important; width:100% !important; }
    .cta-btn { display:block !important; }
    .cta-btn a { display:block !important; text-align:center; }
  }
</style></head>
<body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:36px 0;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6e9ee;box-shadow:0 18px 40px -20px rgba(1,48,74,0.35);">
      <tr>
        <td class="card-pad" style="background:linear-gradient(150deg,#073756 0%,#01304a 55%,#001a29 100%);padding:28px 32px;" align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center">
            <tr>
              <td style="width:40px;">
                <img src="https://raw.githubusercontent.com/ramirezjaret98-ST/verbo-academy-improved-design/main/src/assets/verbo-logo.png" width="40" height="40" alt="Verbo" style="display:block;border-radius:9px;">
              </td>
              <td style="padding-left:12px;">
                <div style="font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;letter-spacing:0.03em;color:#ffffff;line-height:1.1;">VERBO ACADEMY</div>
                <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.12em;color:#9fc2d6;text-transform:uppercase;margin-top:2px;">Language Solutions</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td class="card-pad" style="padding:36px 32px 8px;">
          <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#f38934;margin-bottom:10px;">${opts.eyebrow}</div>
          <h1 style="margin:0 0 14px;font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#0f172a;font-weight:800;">${opts.title}</h1>
          <p style="margin:0 0 24px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#475569;">${opts.bodyHtml}</p>
        </td>
      </tr>
      <tr>
        <td class="card-pad" style="padding:6px 32px 6px;" align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td class="cta-cell">
                <table role="presentation" cellpadding="0" cellspacing="0" class="cta-btn" style="border-radius:18px;background:#f38934;box-shadow:0 10px 24px -10px rgba(243,137,52,0.55);">
                  <tr><td><a href="${opts.cta.href}" style="display:inline-block;padding:15px 38px;font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">${opts.cta.label}</a></td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td class="card-pad" style="padding:14px 32px 32px;" align="center">
          <p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;color:#94a3b8;">${opts.helperHtml}</p>
        </td>
      </tr>
      <tr>
        <td class="card-pad" style="background:#f8fafc;border-top:1px solid #e6e9ee;padding:20px 32px;text-align:center;" align="center">
          <p style="margin:0 0 10px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;text-align:center;">Verbo Academy · <a href="${APP_URL}" style="color:#94a3b8;">verboacademic.com</a></p>
          <p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;color:#c2cad3;text-align:center;">Recibiste este correo porque tienes una cuenta activa en Verbo Academy.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[request-password-reset] RESEND_API_KEY not set - skipping send");
    return;
  }
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[request-password-reset] Resend send failed", res.status, text);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  // Always the same generic response, whether or not this matches an
  // account - never reveal which emails are registered.
  const genericResponse = { ok: true, message: "If that email has an account, a reset link is on its way." };
  if (!email) return json(genericResponse);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const { data: target } = await admin
    .from("app_users")
    .select("id, name, email")
    .ilike("email", email)
    .maybeSingle();

  if (!target?.email) {
    // No matching account - pretend it worked, don't send anything.
    return json(genericResponse);
  }

  // Skip if a token was already issued in the last 30s (double-click / spam guard).
  const { data: recent } = await admin
    .from("password_reset_tokens")
    .select("created_at")
    .eq("user_id", target.id)
    .is("used_at", null)
    .gt("created_at", new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString())
    .maybeSingle();
  if (recent) return json(genericResponse);

  // Invalidate any older outstanding tokens for this user, then issue a new one.
  await admin.from("password_reset_tokens").delete().eq("user_id", target.id).is("used_at", null);

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error: insertErr } = await admin.from("password_reset_tokens").insert({
    user_id: target.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (insertErr) {
    console.error("[request-password-reset] failed to store token", insertErr);
    return json(genericResponse);
  }

  const resetLink = `${APP_URL}/reset-password?token=${token}`;
  const html = renderEmail({
    eyebrow: "Restablecer contraseña",
    title: "Recibimos una solicitud para restablecer tu contraseña",
    bodyHtml: `Hola ${target.name ?? ""}, alguien (esperamos que hayas sido tú) solicitó restablecer la contraseña de tu cuenta en Verbo Academy. Haz clic en el botón de abajo para elegir una nueva. Este enlace expira en 30 minutos y solo se puede usar una vez.`,
    cta: { label: "Restablecer mi contraseña", href: resetLink },
    helperHtml: `Si tú no solicitaste esto, puedes ignorar este correo con confianza - tu contraseña no cambiará. ¿Dudas? Escríbenos por <a href="${WHATSAPP_LINK}" style="color:#f38934;font-weight:600;text-decoration:none;">WhatsApp</a>.`,
  });

  await sendEmail(target.email, "Restablece tu contraseña - Verbo Academy", html);

  return json(genericResponse);
});
