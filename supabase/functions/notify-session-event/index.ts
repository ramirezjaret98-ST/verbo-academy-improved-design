// Canonical source, based on live version 8 retrieved 2026-09-26.
// Sends authenticated session notifications through Resend; recipient addresses are resolved server-side.
// Preserve all notification kinds, Mexico City time, templates and authentication.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { emailEventKey, sendResendEmail, uniqueRecipients } from "./email-delivery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://verboacademic.com";
const WHATSAPP_LINK = "https://wa.me/5212461152136";

// 2026-09-21: the academy's timezone. Every date printed in an email from
// this function is read against this clock, never the container's UTC.
const ACADEMY_TIMEZONE = "America/Mexico_City";

type NotifyKind =
  | "cancelled"
  | "absent"
  | "pending_reschedule"
  | "report_ready"
  | "reschedule_approved"
  | "admin_rescheduled"
  | "lesson_plan_ready"
  | "reschedule_declined";

const VALID_KINDS: NotifyKind[] = [
  "cancelled", "absent", "pending_reschedule", "report_ready",
  "reschedule_approved", "admin_rescheduled", "lesson_plan_ready",
  "reschedule_declined",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: ACADEMY_TIMEZONE,
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Shared premium template — Jaret-approved spec (2026-08-20): Open Sauce Sans
// + Montserrat, navy/orange brand colors, real logo, 18px rounded buttons
// with a tinted shadow (full-width on mobile), centered header/footer, no
// em dashes anywhere (use "-" or "·" instead), WhatsApp contact link.
// ---------------------------------------------------------------------------
type Row = { label: string; value: string };
type Cta = { label: string; href: string; color?: "orange" | "navy" };

function renderEmail(opts: {
  eyebrow: string;
  eyebrowColor?: string;
  badge?: { symbol: string; color: string; bg: string; label: string };
  title: string;
  bodyHtml: string;
  rows?: Row[];
  cta?: Cta;
  secondary?: { label: string; href: string };
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

  const badgeHtml = opts.badge
    ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
            <tr>
              <td style="width:26px;height:26px;background:${opts.badge.bg};border-radius:50%;text-align:center;vertical-align:middle;">
                <span style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:${opts.badge.color};line-height:26px;">${opts.badge.symbol}</span>
              </td>
              <td style="padding-left:10px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${opts.badge.color};">${opts.badge.label}</td>
            </tr>
          </table>`
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

  const secondaryHtml = opts.secondary
    ? `
      <tr>
        <td class="card-pad" style="padding:14px 32px 0;" align="center">
          <a href="${opts.secondary.href}" style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#01304a;text-decoration:underline;">${opts.secondary.label}</a>
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
          ${badgeHtml}
          <div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${eyebrowColor};margin-bottom:10px;">${opts.eyebrow}</div>
          <h1 style="margin:0 0 14px;font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#0f172a;font-weight:800;">${opts.title}</h1>
          <p style="margin:0 0 24px;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#475569;">${opts.bodyHtml}</p>
        </td>
      </tr>
      ${cardHtml}
      ${ctaHtml}
      ${secondaryHtml}
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

const WHATSAPP_HELPER = `¿Algo no cuadra? Escríbenos por <a href="${WHATSAPP_LINK}" style="color:#f38934;font-weight:600;text-decoration:none;">WhatsApp</a> y lo revisamos contigo.`;

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

  let body: { sessionId?: number; kind?: NotifyKind; extra?: { previousDateTime?: string; reason?: string } };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { sessionId, kind, extra } = body;
  if (!sessionId || !kind) return json({ error: "sessionId and kind are required" }, 400);
  if (!VALID_KINDS.includes(kind)) return json({ error: "Invalid kind" }, 400);

  const admin = createClient(url, serviceKey);

  const { data: session, error: sessionErr } = await admin
    .from("sessions")
    .select("id, teacher_id, student_id, date_time, status, cancellation_reason, cancellation_note, report_pdf_url, group_id, updated_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr || !session) return json({ error: "Session not found" }, 404);

  const { data: callerRow } = await admin.from("app_users").select("role").eq("id", callerAuth.user.id).maybeSingle();
  const isAdminCaller = callerRow?.role === "admin";
  const isParty = session.teacher_id === callerAuth.user.id || session.student_id === callerAuth.user.id;
  if (!isAdminCaller && !isParty) {
    return json({ error: "Forbidden: not a party to this session" }, 403);
  }

  const [{ data: teacher }, { data: student }, { data: settings }] = await Promise.all([
    session.teacher_id ? admin.from("app_users").select("name, email").eq("id", session.teacher_id).maybeSingle() : Promise.resolve({ data: null }),
    session.student_id ? admin.from("app_users").select("name, email").eq("id", session.student_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("notification_settings").select("admin_emails").eq("id", true).maybeSingle(),
  ]);

  const adminEmails = uniqueRecipients(settings?.admin_emails ?? []);
  const dateLabel = fmtDate(session.date_time);
  const results: Record<string, { ok: boolean; id?: string; status?: number; code?: string; attempts: number }> = {};
  const eventId = `${sessionId}:${kind}:${session.updated_at}`;
  let sendCount = 0;
  async function sendEmail(to: string[], subject: string, html: string) {
    // Pace this invocation; retry 429s caused by other simultaneous events.
    if (sendCount++ > 0) await new Promise(resolve => setTimeout(resolve, 650));
    return sendResendEmail({
      apiKey: Deno.env.get("RESEND_API_KEY"),
      from: Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>",
      to, subject, html, idempotencyKey: await emailEventKey(eventId, to),
    });
  }

  if (kind === "cancelled" || kind === "absent" || kind === "pending_reschedule") {
    const actionLabel = kind === "pending_reschedule" ? "solicitó reagendar" : kind === "cancelled" ? "canceló" : "no podrá asistir a";
    const teacherEmails = uniqueRecipients([teacher?.email]);
    const internalRecipients = uniqueRecipients([...teacherEmails, ...adminEmails]);
    for (const [index, recipient] of internalRecipients.entries()) {
      const isTeacherRecipient = teacherEmails.includes(recipient);
      const html = renderEmail({
        eyebrow: kind === "pending_reschedule" ? "Solicitud de reagendo" : "Sesión modificada",
        title: `${student?.name ?? "Un alumno"} ${actionLabel} una sesión`,
        bodyHtml: `<strong>${student?.name ?? "Alumno"}</strong> ${actionLabel} la sesión del <strong>${dateLabel}</strong> con <strong>${teacher?.name ?? "-"}</strong>.${session.cancellation_note ? ` Nota del alumno: "${session.cancellation_note}"` : ""}`,
        rows: [{ label: "Fecha", value: dateLabel }, { label: "Profesor", value: teacher?.name ?? "" }],
        cta: { label: "Ver en el calendario", href: `${APP_URL}/${isTeacherRecipient ? "teacher" : "admin"}/calendar` },
      });
      results[`internal_${index}`] = await sendEmail([recipient], `Aviso: ${student?.name ?? "Un alumno"} ${actionLabel} una sesión`, html);
    }
    if (!teacherEmails.length) results.teacher = { ok: false, code: "missing_teacher_email", attempts: 0 };
    if (!adminEmails.length) results.admin = { ok: false, code: "missing_admin_email", attempts: 0 };
    if (student?.email) {
      const confirmLabel = kind === "pending_reschedule" ? "Recibimos tu solicitud de reagendar" : "Confirmamos la cancelación de tu sesión";
      const html = renderEmail({
        eyebrow: kind === "pending_reschedule" ? "Solicitud de reagendo" : "Sesión cancelada",
        title: confirmLabel,
        bodyHtml: `Hola ${student?.name ?? ""}, ${confirmLabel.toLowerCase()} del <strong>${dateLabel}</strong> con <strong>${teacher?.name ?? "tu profesor(a)"}</strong>.`,
        rows: [{ label: "Fecha", value: dateLabel }, { label: "Profesor", value: teacher?.name ?? "" }],
        cta: { label: "Ver mi calendario", href: `${APP_URL}/student/sessions` },
        helperHtml: WHATSAPP_HELPER,
      });
      results.student = await sendEmail([student.email], confirmLabel, html);
    }
  }

  if (kind === "report_ready") {
    if (student?.email) {
      const html = renderEmail({
        eyebrow: "Reporte de sesión",
        title: "Tu reporte de sesión ya está listo",
        bodyHtml: `Hola ${student?.name ?? ""}, tu profesor(a) <strong>${teacher?.name ?? ""}</strong> ya completó el reporte de tu sesión del <strong>${dateLabel}</strong>.`,
        rows: [{ label: "Fecha", value: dateLabel }, { label: "Profesor", value: teacher?.name ?? "" }],
        cta: session.report_pdf_url
          ? { label: "Ver reporte (PDF)", href: session.report_pdf_url }
          : { label: "Ver en mi cuenta", href: `${APP_URL}/student/sessions` },
      });
      results.student = await sendEmail([student.email], "Tu reporte de sesión ya está listo - Verbo Academy", html);
    }
  }

  if (kind === "reschedule_approved" || kind === "admin_rescheduled") {
    if (student?.email) {
      const isApproval = kind === "reschedule_approved";
      const rows: Row[] = [];
      if (extra?.previousDateTime) rows.push({ label: "Fecha anterior", value: fmtDate(extra.previousDateTime) });
      rows.push({ label: "Fecha nueva", value: dateLabel }, { label: "Profesor", value: teacher?.name ?? "" });
      const html = renderEmail({
        eyebrow: isApproval ? "Reagendo aprobado" : "Cambio de horario",
        title: isApproval ? "¡Listo! Ya movimos tu sesión" : "Tu sesión cambió de horario",
        bodyHtml: `Hola ${student?.name ?? ""}, tu sesión con <strong>${teacher?.name ?? "tu profesor(a)"}</strong> ${isApproval ? "quedó reagendada" : "se movió"}. Aquí los nuevos detalles:`,
        rows,
        cta: { label: "Ver en mi calendario", href: `${APP_URL}/student/sessions` },
      });
      results.student = await sendEmail(
        [student.email],
        isApproval ? "Tu reagendo quedó confirmado" : `Movimos tu sesión con ${teacher?.name ?? "tu profesor(a)"}`,
        html,
      );
    }
  }

  // 2026-09-08: the fix — this branch simply didn't exist before, even
  // though the frontend (lesson-plans-store.ts) already called this
  // function with kind: "lesson_plan_ready" every time a teacher saved a
  // plan for the first time. Silently fell into the final `return` with an
  // empty `results` and no email ever went out. CTA deep-links straight
  // into the new SessionPrepModal via `?prep=<sessionId>` (see
  // student.sessions.tsx's validateSearch + NotificationsBell.tsx, which
  // opens the same modal from the in-app notification).
  if (kind === "lesson_plan_ready") {
    if (student?.email) {
      const { data: plan } = await admin
        .from("lesson_plans")
        .select("title, comments")
        .eq("session_id", sessionId)
        .maybeSingle();
      const rows: Row[] = [{ label: "Fecha", value: dateLabel }, { label: "Profesor", value: teacher?.name ?? "" }];
      if (plan?.title) rows.push({ label: "Tema", value: plan.title });
      const html = renderEmail({
        eyebrow: "Tu clase está lista",
        title: "Tu profesor(a) ya preparó tu próxima clase",
        bodyHtml: `Hola ${student?.name ?? ""}, <strong>${teacher?.name ?? "tu profesor(a)"}</strong> ya dejó todo listo para tu sesión del <strong>${dateLabel}</strong>${plan?.title ? ` sobre <strong>${plan.title}</strong>` : ""}. Puedes revisar los comentarios y el material antes de tu clase.`,
        rows,
        cta: { label: "Ver mi planeación", href: `${APP_URL}/student/sessions?prep=${sessionId}` },
      });
      results.student = await sendEmail([student.email], "Tu próxima clase ya está lista - Verbo Academy", html);
    }
  }

  // 2026-08-20 (later same day): the "we couldn't move it" counterpart to
  // the branch above — session already reverted to its ORIGINAL date/time
  // client-side before this fires (see RescheduleModal.tsx's declineSubmit),
  // so `dateLabel` here already reflects the unchanged original schedule.
  // Jaret's explicit ask: empathetic tone + offer a direct way to reach out.
  if (kind === "reschedule_declined") {
    if (student?.email) {
      const rows: Row[] = [{ label: "Fecha", value: dateLabel }, { label: "Profesor", value: teacher?.name ?? "" }];
      if (extra?.reason) rows.push({ label: "Motivo", value: extra.reason });
      const html = renderEmail({
        eyebrow: "Sobre tu solicitud de reagendo",
        title: "No pudimos mover esta sesión esta vez",
        bodyHtml: `Hola ${student?.name ?? ""}, sabemos que reagendar es importante para ti y lamentamos no haber podido mover tu sesión con <strong>${teacher?.name ?? "tu profesor(a)"}</strong> en esta ocasión. Tu sesión se queda tal como estaba, sin ningún cambio.`,
        rows,
        cta: { label: "Elegir otra fecha", href: `${APP_URL}/student/sessions` },
        secondary: { label: "Escríbenos por WhatsApp para buscar otra opción", href: WHATSAPP_LINK },
        helperHtml: "Estamos para ayudarte a encontrar algo que sí funcione - escríbenos cuando quieras.",
      });
      results.student = await sendEmail([student.email], "Sobre tu solicitud de reagendo", html);
    }
  }

  const failed = Object.entries(results).filter(([, result]) => !result.ok);
  // Do not log addresses, names, notes or email bodies.
  if (failed.length) console.error("[notify-session-event] email_not_accepted", { sessionId, kind, failed });
  return json({ ok: failed.length === 0, accepted: Object.values(results).filter(result => result.ok).length, results });
});
