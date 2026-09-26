// Sends the transactional emails Verbo Academy was missing entirely (bugs
// #3 and #4 from Jaret's 2026-08-13 report):
//   - A student cancels / can't-attend / requests a reschedule → the
//     assigned teacher AND every address in notification_settings.admin_emails
//     get notified, and the student gets a confirmation copy. Before this,
//     the only signal was the in-app bell + the calendar — nothing external,
//     so a same-day cancellation could go completely unnoticed (exactly
//     what happened to Jaret).
//   - A teacher submits a Final Session Report → the student gets an email
//     with a link to their PDF report (which, until now, was generated and
//     uploaded to Storage but never actually surfaced to anyone outside the
//     app).
//
// This function is the ONLY place that talks to Resend — the API key never
// reaches the browser. Recipients (teacher/student/admin emails) are looked
// up server-side from `sessions`/`app_users`/`notification_settings` via the
// service-role client, not trusted from the request body, so a caller can
// only ever trigger a notification about a session they actually appear on
// (validated below) — they can't redirect it to an arbitrary inbox.
//
// Required secrets (Project Settings → Edge Functions → Manage secrets):
//   RESEND_API_KEY   — from resend.com/api-keys
//   RESEND_FROM_EMAIL — e.g. "Verbo Academy <notificaciones@tudominio.com>",
//                        must be on a domain verified in Resend. Falls back
//                        to Resend's shared test address (which can only
//                        deliver to the Resend account's own inbox) so this
//                        function still runs end-to-end before the real
//                        domain is verified.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotifyKind = "cancelled" | "absent" | "pending_reschedule" | "report_ready";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendEmail(to: string[], subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[notify-session-event] RESEND_API_KEY not set — skipping send", { to, subject });
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
    console.error("[notify-session-event] Resend send failed", res.status, text);
    return { ok: false, status: res.status, error: text };
  }
  return { ok: true };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f4f6f8;padding:24px;margin:0;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#01304a;padding:20px 24px;">
        <div style="color:#ffffff;font-weight:700;font-size:16px;letter-spacing:0.02em;">VERBO ACADEMY</div>
      </div>
      <div style="padding:24px;color:#0f172a;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#01304a;">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:11px;">verbolanguagesolutions.com</div>
    </div>
  </body></html>`;
}

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

  let body: { sessionId?: number; kind?: NotifyKind };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { sessionId, kind } = body;
  if (!sessionId || !kind) return json({ error: "sessionId and kind are required" }, 400);
  if (!["cancelled", "absent", "pending_reschedule", "report_ready"].includes(kind)) {
    return json({ error: "Invalid kind" }, 400);
  }

  const admin = createClient(url, serviceKey);

  const { data: session, error: sessionErr } = await admin
    .from("sessions")
    .select("id, teacher_id, student_id, date_time, status, cancellation_reason, cancellation_note, report_pdf_url, group_id")
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

  const adminEmails = (settings?.admin_emails ?? []).filter((e: string) => !!e);
  const dateLabel = fmtDate(session.date_time);
  const results: Record<string, unknown> = {};

  if (kind === "cancelled" || kind === "absent" || kind === "pending_reschedule") {
    const actionLabel = kind === "pending_reschedule" ? "solicitó reagendar" : kind === "cancelled" ? "canceló" : "no podrá asistir a";
    const internalTo = [teacher?.email, ...adminEmails].filter((e): e is string => !!e);
    if (internalTo.length > 0) {
      const html = wrap(
        `Un alumno ${actionLabel} una sesión`,
        `<p><strong>${student?.name ?? "Alumno"}</strong> ${actionLabel} la sesión del <strong>${dateLabel}</strong> con <strong>${teacher?.name ?? "—"}</strong>.</p>
         ${session.cancellation_note ? `<p style="color:#475569;">Nota del alumno: "${session.cancellation_note}"</p>` : ""}
         <p style="margin-top:16px;color:#64748b;font-size:13px;">Revisa el calendario en Verbo Academy para más detalles.</p>`,
      );
      results.internal = await sendEmail(internalTo, `Aviso: ${student?.name ?? "Un alumno"} ${actionLabel} una sesión`, html);
    }
    if (student?.email) {
      const confirmLabel = kind === "pending_reschedule" ? "Recibimos tu solicitud de reagendar" : "Confirmamos la cancelación de tu sesión";
      const html = wrap(
        confirmLabel,
        `<p>Hola ${student?.name ?? ""},</p>
         <p>${confirmLabel.toLowerCase()} del <strong>${dateLabel}</strong> con <strong>${teacher?.name ?? "tu profesor(a)"}</strong>.</p>
         <p style="margin-top:16px;color:#64748b;font-size:13px;">Si esto no lo hiciste tú, contáctanos lo antes posible.</p>`,
      );
      results.student = await sendEmail([student.email], confirmLabel, html);
    }
  }

  if (kind === "report_ready") {
    if (student?.email) {
      const html = wrap(
        "Tu reporte de sesión ya está listo",
        `<p>Hola ${student?.name ?? ""},</p>
         <p>Tu profesor(a) <strong>${teacher?.name ?? ""}</strong> ya completó el reporte de tu sesión del <strong>${dateLabel}</strong>.</p>
         ${session.report_pdf_url ? `<p style="margin-top:16px;"><a href="${session.report_pdf_url}" style="background:#01304a;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Ver reporte (PDF)</a></p>` : `<p style="margin-top:16px;color:#64748b;font-size:13px;">Puedes verlo desde tu cuenta de Verbo Academy.</p>`}`,
      );
      results.student = await sendEmail([student.email], "Tu reporte de sesión ya está listo — Verbo Academy", html);
    }
  }

  return json({ ok: true, results });
});
