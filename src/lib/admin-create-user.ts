// Admin-only: creates a REAL Supabase Auth account (email + temp password)
// for a new student/teacher/internal-admin, so beta users get a working
// login instead of the old localStorage-only "registration" that never
// touched auth.users.
//
// `on_auth_user_created` (a DB trigger already in this project) auto-inserts
// the matching public.app_users row (id, name, email, role) from the auth
// user's raw_user_meta_data as soon as it's created — we only need to patch
// in `legacy_id` (the short frontend id, e.g. "u1738879234567", so the
// existing user-id-bridge.ts resolves it), `must_change_password`, and (for
// role === "admin") `admin_type`.
//
// Creating an internal admin/coordinator account (role === "admin") is
// further restricted to callers who are themselves super_admin — any
// regular admin/coordinator could otherwise mint themselves a super_admin
// account. Student/teacher creation keeps the original any-admin check.
//
// 2026-08-08 fix: the browser calls this function cross-origin
// (app origin -> *.supabase.co), so any real call is preceded by a CORS
// preflight OPTIONS request. This function had no OPTIONS handling and no
// CORS response headers at all, so every preflight got the generic
// "Method not allowed" 405 and the browser silently dropped the real POST
// before it was ever sent. Net effect: EVERY teacher/student created via the
// Admin panel since this function went live got added to the on-screen list
// (optimistic local state) but never actually got a working Supabase login,
// with only a console.error left behind — nothing visible to the admin.
// Added a standard CORS preflight branch + Access-Control-Allow-* headers on
// every response to fix this.
//
// 2026-08-20: added a best-effort "bienvenida" email for new STUDENT
// accounts, sent only when the admin explicitly checks "Send welcome email"
// on the New Student form (StudentFormModal in admin.students.tsx) —
// `sendWelcomeEmail` in the request body. Never blocks or fails the account
// creation itself. Not offered for teacher/admin accounts — not part of
// what Jaret asked for.
//
// 2026-08-20 (later same day): rebuilt the email itself per Jaret's actual
// spec (see correo_bienvenida_alumno_pendiente_2026-08-20 in project
// memory) — the first version was a bare confirmation with no credentials.
// Now: motivational welcome copy, a Concepto/Detalle-style credentials
// table (same visual language as the payment receipt/other notify-*
// emails), a first-login note about the mandatory password change, a
// "Ingresar a la academia" CTA, and support contacts (WhatsApp, info@,
// academic contact). Rebuilt on the shared `renderEmail()` template used by
// notify-session-event/notify-account-event/notify-payment-event (kept in
// sync by hand — see those functions for the annotated original) instead of
// the one-off HTML string the first version used, plus a new optional
// `noteHtml` slot (between the credentials card and the CTA) that those
// other functions don't need yet.
//
// Because this is opt-in (the admin explicitly asks for it per student) and
// the whole point is handing over usable login info, the email includes the
// temp password in plain text — unlike the very first draft of this
// function, which deliberately left the password out. The checkbox's own
// helper text in the admin UI already warns the admin about this.
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
// TODO(Jaret): confirm this is the right inbox for academic questions — it
// wasn't specified when this feature was requested, this is a reasonable
// placeholder on the verbolanguagesolutions.com sending domain. Swap it (and
// redeploy) if the real one is different.
const ACADEMIC_EMAIL = "academico@verbolanguagesolutions.com";
const SUPPORT_EMAIL = "info@verbolanguagesolutions.com";

// Same premium template as notify-session-event / notify-account-event /
// notify-payment-event (kept in sync by hand across all four — see
// notify-session-event's source for the fully annotated version), plus one
// addition: an optional `noteHtml` slot rendered between the credentials
// card and the CTA button, for the "you'll be asked to change this
// password" line. The other three functions don't need that slot yet, so it
// hasn't been backported there.
type Row = { label: string; value: string };
type Cta = { label: string; href: string; color?: "orange" | "navy" };

function renderEmail(opts: {
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  bodyHtml: string;
  rows?: Row[];
  noteHtml?: string;
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

  const noteHtml = opts.noteHtml
    ? `
      <tr>
        <td class="card-pad" style="padding:14px 32px 0;">
          <p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#64748b;">${opts.noteHtml}</p>
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
      ${noteHtml}
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

async function sendWelcomeEmail(to: string, name: string, password: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[admin-create-user] RESEND_API_KEY not set - skipping welcome email");
    return;
  }
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>";

  const helperHtml = `¿Dudas? Escríbenos por <a href="${WHATSAPP_LINK}" style="color:#f38934;font-weight:600;text-decoration:none;">WhatsApp</a>, a <a href="mailto:${SUPPORT_EMAIL}" style="color:#f38934;font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a>, o para temas de tu programa académico a <a href="mailto:${ACADEMIC_EMAIL}" style="color:#f38934;font-weight:600;text-decoration:none;">${ACADEMIC_EMAIL}</a>.`;

  const html = renderEmail({
    eyebrow: "Bienvenida",
    title: `¡Qué gusto tenerte con nosotros, ${name}!`,
    bodyHtml: `Tu cuenta en Verbo Academy ya está lista. Desde ahí vas a poder ver tus próximas sesiones, tu material de estudio y tu progreso en todo momento - este es el primer paso de tu camino con nosotros. Aquí están tus datos de acceso:`,
    rows: [
      { label: "Correo", value: to },
      { label: "Contraseña temporal", value: password },
    ],
    noteHtml: "Por tu seguridad, en tu primer inicio de sesión te vamos a pedir crear una nueva contraseña.",
    cta: { label: "Ingresar a la academia", href: `${APP_URL}/login` },
    helperHtml,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "Bienvenido(a) a Verbo Academy - tus datos de acceso", html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[admin-create-user] welcome email send failed", res.status, text);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client scoped to the caller's own JWT — used only to confirm identity.
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerAuth?.user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Service-role client — used for the admin-role check (bypasses RLS so this
  // is reliable regardless of policy shape) and for the actual account creation.
  const admin = createClient(url, serviceKey);
  const { data: callerRow, error: callerRowErr } = await admin
    .from("app_users")
    .select("role, admin_type")
    .eq("id", callerAuth.user.id)
    .maybeSingle();
  if (callerRowErr || !callerRow || callerRow.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: { legacyId?: string; email?: string; password?: string; name?: string; role?: string; adminType?: string; sendWelcomeEmail?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { legacyId, email, password, name, role, adminType, sendWelcomeEmail: wantsWelcomeEmail } = body;
  if (!legacyId || !email || !password || !name || (role !== "student" && role !== "teacher" && role !== "admin")) {
    return new Response(JSON.stringify({ error: "legacyId, email, password, name and role ('student'|'teacher'|'admin') are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "password must be at least 6 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (role === "admin") {
    if (callerRow.admin_type !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: only Super Admin can create internal admin/coordinator accounts" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const validAdminTypes = ["super_admin", "coordinator_ops", "coordinator_fin"];
    if (!validAdminTypes.includes(adminType ?? "")) {
      return new Response(JSON.stringify({ error: "adminType ('super_admin'|'coordinator_ops'|'coordinator_fin') is required when role is 'admin'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (createErr || !created?.user) {
    return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create auth user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { error: updateErr } = await admin
    .from("app_users")
    .update({
      legacy_id: legacyId,
      must_change_password: true,
      ...(role === "admin" ? { admin_type: adminType } : {}),
    })
    .eq("id", created.user.id);
  if (updateErr) {
    // Auth user exists but the app_users patch failed — surface this clearly
    // rather than leaving a silent half-created account with no legacy_id.
    return new Response(JSON.stringify({ error: `Auth account created but failed to link legacy_id: ${updateErr.message}`, authUserId: created.user.id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (role === "student" && wantsWelcomeEmail === true) {
    // Best-effort: awaited (not fire-and-forget) because Edge Functions can
    // tear down background work once the response is sent — but wrapped so
    // a Resend hiccup never fails account creation, which already succeeded
    // above.
    try {
      await sendWelcomeEmail(email, name, password);
    } catch (e) {
      console.error("[admin-create-user] welcome email threw", e);
    }
  }

  return new Response(JSON.stringify({ id: created.user.id, legacyId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
