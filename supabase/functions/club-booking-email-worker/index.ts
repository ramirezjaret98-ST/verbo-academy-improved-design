// A committed club booking creates the private job. The random per-job token
// authenticates database dispatches; no browser can choose recipients or content.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fmtDate, renderEmail } from "../notify-session-event/handler.ts";
import { sendResendEmail, uniqueRecipients } from "../notify-session-event/email-delivery.ts";

const APP_URL = "https://verboacademic.com";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

type BookingEvent = {
  id: number; student_id: string; teacher_id: string | null;
  club_title: string; club_date: string; club_type: "book" | "insight";
};

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: { id?: number; token?: string };
  try { body = await request.json(); } catch { return new Response("Invalid body", { status: 400 }); }
  if (typeof body.id !== "number" || !Number.isSafeInteger(body.id) || !/^[0-9a-f-]{72}$/i.test(body.token ?? ""))
    return new Response("Unauthorized", { status: 401 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: job, error: claimError } = await admin.rpc("claim_club_booking_email_job", {
    p_id: body.id, p_token: body.token,
  });
  if (claimError || !job) return new Response("Unauthorized or already processed", { status: 401 });

  const event = job.event as BookingEvent;
  const sent = new Set<string>(job.sentTo ?? []);
  let ok = true;
  let errorCode = "";
  try {
    const [{ data: student, error: studentError }, { data: teacher, error: teacherError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("app_users").select("name,email").eq("id", event.student_id).maybeSingle(),
      event.teacher_id ? admin.from("app_users").select("name,email").eq("id", event.teacher_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      admin.from("notification_settings").select("admin_emails").eq("id", true).maybeSingle(),
    ]);
    if (studentError || teacherError || settingsError || !student?.email || (event.teacher_id && !teacher?.email))
      throw new Error("missing_booking_recipient");

    const apiKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>";
    const club = escapeHtml(event.club_title);
    const studentName = escapeHtml(student.name ?? "Alumno");
    const host = escapeHtml(teacher?.name ?? "Por asignar");
    const date = fmtDate(event.club_date);
    const kind = event.club_type === "book" ? "Book Club" : "Verbo Insight";
    const admins = uniqueRecipients(settings?.admin_emails ?? []);
    if (!admins.length) throw new Error("missing_admin_email");

    const messages = [
      { role: "student", to: student.email, subject: `Tu lugar en ${event.club_title} está confirmado`,
        html: renderEmail({ eyebrow: `${kind} confirmado`, title: "¡Ya tienes tu lugar!",
          bodyHtml: `Hola ${studentName}, confirmamos tu lugar en <strong>${club}</strong>. Aquí los detalles:`,
          rows: [{ label: "Fecha", value: date }, { label: "Host", value: host }],
          cta: { label: "Ver mis clubs", href: `${APP_URL}/student/clubs` },
        }) },
      ...(teacher?.email ? [{ role: "teacher", to: teacher.email,
        subject: `Nueva reserva en ${event.club_title}`,
        html: renderEmail({ eyebrow: "Nueva reserva", title: "Un alumno reservó tu club",
          bodyHtml: `<strong>${studentName}</strong> reservó un lugar en <strong>${club}</strong>.`,
          rows: [{ label: "Fecha", value: date }, { label: "Alumno", value: studentName }],
          cta: { label: "Ver mis clubs", href: `${APP_URL}/teacher/clubs` },
        }) }] : []),
      ...admins.map(to => ({ role: "admin", to,
        subject: `Nueva reserva en ${event.club_title}`,
        html: renderEmail({ eyebrow: "Nueva reserva", title: "Un alumno reservó un club",
          bodyHtml: `<strong>${studentName}</strong> reservó un lugar en <strong>${club}</strong>.`,
          rows: [{ label: "Fecha", value: date }, { label: "Profesor", value: host }, { label: "Alumno", value: studentName }],
          cta: { label: "Ver clubs", href: `${APP_URL}/admin/clubs` },
        }) })),
    ];

    for (const message of messages) {
      const delivery = `${message.role}:${message.to.trim().toLowerCase()}`;
      if (sent.has(delivery)) continue;
      const result = await sendResendEmail({ apiKey, from, to: [message.to],
        subject: message.subject, html: message.html,
        idempotencyKey: `club-booking-${event.id}-${delivery}`,
      });
      if (!result.ok) {
        ok = false;
        errorCode = result.code ?? `resend_${result.status ?? "error"}`;
        continue;
      }
      const { error: receiptError } = await admin.rpc("mark_club_booking_email_sent", {
        p_id: event.id, p_email: delivery,
      });
      if (receiptError) { ok = false; errorCode = "receipt_not_saved"; }
      else sent.add(delivery);
    }
  } catch (error) {
    ok = false;
    errorCode = error instanceof Error ? error.message : "delivery_exception";
  }
  const { error: finishError } = await admin.rpc("finish_club_booking_email_job", {
    p_id: event.id, p_ok: ok, p_error: errorCode || null,
  });
  if (finishError) return new Response("Job result not saved", { status: 503 });
  return Response.json({ ok });
});
