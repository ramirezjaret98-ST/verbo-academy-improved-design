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


const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c] ?? c);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return json({ error: "Email service unavailable" }, 503);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: callerAuth, error: authError } = await caller.auth.getUser();
  if (authError || !callerAuth.user) return json({ error: "Not authenticated" }, 401);
  const admin = createClient(url, serviceKey);
  const { data: actor } = await admin.from("app_users").select("role,admin_type").eq("id", callerAuth.user.id).maybeSingle();
  if (actor?.role !== "admin" || actor.admin_type !== "super_admin") return json({ error: "Super Admin only" }, 403);

  let body: { studentId?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid body" }, 400); }
  if (!body.studentId) return json({ error: "Student is required" }, 400);
  const { data: student, error: studentError } = await admin.from("app_users")
    .select("id,role,name,email,welcome_pending,must_change_password,welcome_password_year")
    .eq("id", body.studentId).maybeSingle();
  if (studentError || !student || student.role !== "student") return json({ error: "Student not found" }, 404);
  if (!student.welcome_pending) return json({ error: "Welcome already sent or this is an existing account" }, 409);
  if (!student.must_change_password) return json({ error: "Student has already completed first login" }, 409);
  if (!student.welcome_password_year) return json({ error: "Registration credential is not configured" }, 409);
  const { data: password, error: passwordError } = await admin.rpc("student_temporary_password", { p_year: student.welcome_password_year });
  if (passwordError || typeof password !== "string" || password.length < 6) return json({ error: "Student temporary credential is not configured" }, 503);

  const safeName = escapeHtml(student.name ?? "");
  const safeEmail = escapeHtml(student.email ?? "");
  const helperHtml = `¿Dudas? Escríbenos por <a href="${WHATSAPP_LINK}" style="color:#f38934;font-weight:600;text-decoration:none;">WhatsApp</a>, a <a href="mailto:${SUPPORT_EMAIL}" style="color:#f38934;font-weight:600;text-decoration:none;">${SUPPORT_EMAIL}</a>, o para temas de tu programa académico a <a href="mailto:${ACADEMIC_EMAIL}" style="color:#f38934;text-decoration:none;">${ACADEMIC_EMAIL}</a>.`;
  const html = renderEmail({
    eyebrow: "Bienvenida",
    title: `¡Qué gusto tenerte con nosotros, ${safeName}!`,
    bodyHtml: "Tu cuenta en Verbo Academy ya está lista. Desde ahí vas a poder ver tus próximas sesiones, tu material de estudio y tu progreso en todo momento - este es el primer paso de tu camino con nosotros. Aquí están tus datos de acceso:",
    rows: [{ label: "Correo", value: safeEmail }, { label: "Contraseña temporal", value: escapeHtml(password) }],
    noteHtml: "Por tu seguridad, en tu primer inicio de sesión te vamos a pedir crear una nueva contraseña.",
    cta: { label: "Ingresar a la academia", href: `${APP_URL}/login` },
    helperHtml,
  });
  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
      "Idempotency-Key": `student-welcome/${student.id}`,
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>",
      to: [student.email], subject: "Bienvenido(a) a Verbo Academy - tus datos de acceso", html,
    }),
  });
  if (!sent.ok) {
    console.error("[admin-send-welcome] delivery rejected", sent.status);
    return json({ error: "Email service did not accept the welcome email" }, 502);
  }
  const { data: updated, error: updateError } = await admin.from("app_users")
    .update({ welcome_pending: false, welcome_sent_at: new Date().toISOString() })
    .eq("id", student.id).eq("welcome_pending", true).select("id").maybeSingle();
  if (updateError || !updated) return json({ error: "Email accepted, but welcome state could not be saved. Contact support before retrying." }, 500);
  return json({ ok: true });
});
