// Sends transactional emails tied to a USER (not a specific session) —
// added 2026-08-20 alongside notify-session-event's premium template so
// account-level events (a password change, a club seat confirmation) don't
// have to be forced into the session-shaped payload that function expects.
// Same trust model: recipient email is looked up server-side from
// `app_users` via the service-role client, never trusted from the request
// body. Caller must be either the target user themselves (self-service
// password reset, booking their own club seat) or an admin (admin resetting
// someone else's password) — checked below.
//
// Required secrets: same as notify-session-event (RESEND_API_KEY,
// RESEND_FROM_EMAIL), already configured.
//
// 2026-09-21: TIMEZONE FIX, the same one applied to notify-session-event,
// notify-payment-event and confirm-password-reset that day. fmtDate() passed
// the "es-MX" locale but no `timeZone`, and Edge Functions run on a UTC
// clock, so both emails below were 6 hours ahead of Mexico City: the
// password-change confirmation claimed a time in the future (the kind of
// mismatch that makes someone think the change wasn't theirs), and a club
// confirmation gave the student the wrong hour for the club itself.
// `clubs.date` is a timestamptz, so its ISO string carries its own offset
// and reads correctly once pinned below. NOTE for whoever extends this:
// only timestamptz values may go through fmtDate() — a date-only "YYYY-MM-DD"
// column is parsed as UTC midnight by JS and would print the day BEFORE
// under a CDMX-pinned formatter.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://verboacademic.com";
const WHATSAPP_LINK = "https://wa.me/5212461152136";

// 2026-09-21: the academy's timezone (see the note at the top of this file).
const ACADEMY_TIMEZONE = "America/Mexico_City";

type AccountNotifyKind = "password_changed" | "club_confirmed";
const VALID_KINDS: AccountNotifyKind[] = ["password_changed", "club_confirmed"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendEmail(to: string[], subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[notify-account-event] RESEND_API_KEY not set - skipping send", { to, subject });
    return { ok: false, skipped: true };
  }
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[notify-account-event] Resend send failed", res.status, text);
    return { ok: false, status: res.status, error: text };
  }
  return { ok: true };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: ACADEMY_TIMEZONE,
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Same premium template as notify-session-event (kept in sync by hand -
// both files were built together 2026-08-20; if the design changes, update
// both). See that function's source for the annotated version.
type Row = { label: string; value: string };
type Cta = { label: string; href: string; color?: "orange" | "navy" };

function renderEmail(opts: {
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  bodyHtml: string;
  rows?: Row[];
  cta?: Cta;
  helperHtml?: string;
}): string {
  const eyebrowColor = opts.eyebrowColor ?? "#f38934";
  const ctaColor = opts.cta?.color === "navy" ? "#01304a" : "#f38934";
  const ctaShadow = opts.cta?.color === "navy" ? "rgba(1,48,74,0.45)" : "rgba(243,137,52,0.55)";

  const rowsHtml = (opts.rows ?? [])
    .filter((r) => !!r.value)
    .map(
      (r) => `
                  <tr>
                    <td style="padding:6px 0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:13px;color:#64748b;width:130px;">${r.label}</td>
                    <td style="padding:6px 0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:13px;color:#0f172a;font-weight:600;">${r.value}</td>
                  </tr>`,
    )
    .join("");

  const cardHtml = rowsHtml
    ? `
      <tr>
        <td style="padding:0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e6e9ee;border-radius:14px;">
            <tr>
              <td style="padding:18px 22px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const ctaHtml = opts.cta
    ? `
      <tr>
        <td class="card-pad" style="padding:28px 32px 6px;" align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td class="cta-cell">
                <table role="presentation" cellpadding="0" cellspacing="0" class="cta-btn" style="border-radius:18px;background:${ctaColor};box-shadow:0 10px 24px -10px ${ctaShadow};">
                  <tr><td><a href="${opts.cta.href}" style="display:inline-block;padding:15px 38px;font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">${opts.cta.label}</a></td></tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const helperHtml = opts.helperHtml
    ? `
      <tr>
        <td class="card-pad" style="padding:14px 32px 32px;" align="center">
          <p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12px;color:#94a3b8;">${opts.helperHtml}</p>
        </td>
      </tr>`
    : `
      <tr><td style="padding:14px 32px 32px;"></td></tr>`;

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
          <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${eyebrowColor};margin-bottom:10px;">${opts.eyebrow}</div>
          <h1 style="margin:0 0 14px;font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#0f172a;font-weight:800;">${opts.title}</h1>
          <p style="margin:0 0 24px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#475569;">${opts.bodyHtml}</p>
        </td>
      </tr>
      ${cardHtml}
      ${ctaHtml}
      ${helperHtml}
      <tr>
        <td class="card-pad" style="background:#f8fafc;border-top:1px solid #e6e9ee;padding:20px 32px;text-align:center;" align="center">
          <p style="margin:0 0 10px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;text-align:center;">Verbo Academy · <a href="${APP_URL}" style="color:#94a3b8;">verboacademic.com</a></p>
          <p style="margin:0 0 10px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;color:#c2cad3;text-align:center;">
            <a href="${APP_URL}/terms" style="color:#94a3b8;text-decoration:underline;">Términos y condiciones</a>
            &nbsp;·&nbsp;
            <a href="${APP_URL}/privacy" style="color:#94a3b8;text-decoration:underline;">Aviso de privacidad</a>
          </p>
          <p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;color:#c2cad3;text-align:center;">Recibiste este correo porque tienes una cuenta activa en Verbo Academy.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const WHATSAPP_HELPER = `¿No reconoces este cambio? Escríbenos por <a href="${WHATSAPP_LINK}" style="color:#f38934;font-weight:600;text-decoration:none;">WhatsApp</a> de inmediato.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerAuth?.user) return json({ error: "Not authenticated" }, 401);

  let body: { userId?: string; kind?: AccountNotifyKind; extra?: { clubName?: string; clubDate?: string; clubHost?: string } };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { userId, kind, extra } = body;
  if (!userId || !kind) return json({ error: "userId and kind are required" }, 400);
  if (!VALID_KINDS.includes(kind)) return json({ error: "Invalid kind" }, 400);

  const admin = createClient(url, serviceKey);
  const { data: callerRow } = await admin.from("app_users").select("role").eq("id", callerAuth.user.id).maybeSingle();
  const isAdminCaller = callerRow?.role === "admin";
  const isSelf = callerAuth.user.id === userId;
  if (!isAdminCaller && !isSelf) {
    return json({ error: "Forbidden: can only notify yourself, or be an admin" }, 403);
  }

  const { data: target, error: targetErr } = await admin.from("app_users").select("name, email").eq("id", userId).maybeSingle();
  if (targetErr || !target?.email) return json({ error: "User not found or has no email" }, 404);

  const results: Record<string, unknown> = {};

  if (kind === "password_changed") {
    const html = renderEmail({
      eyebrow: "Seguridad de tu cuenta",
      title: "Confirmamos el cambio de tu contraseña",
      bodyHtml: `Hola ${target.name ?? ""}, tu contraseña se actualizó correctamente el <strong>${fmtDate(new Date().toISOString())}</strong>.`,
      helperHtml: WHATSAPP_HELPER,
    });
    results.email = await sendEmail([target.email], "Tu contraseña fue actualizada - Verbo Academy", html);
  }

  // Club reservation emails are owned by the committed booking trigger and
  // club-booking-email-worker. Older browser assets may still call this kind;
  // acknowledge it without sending a duplicate student confirmation.
  if (kind === "club_confirmed") results.email = { ok: true, queuedByBooking: true };

  return json({ ok: true, results });
});
