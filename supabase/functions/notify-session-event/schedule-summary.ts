import { createClient } from "jsr:@supabase/supabase-js@2";
import { emailEventKey, isQuotaExceeded, uniqueRecipients, type DeliveryResult } from "./email-delivery.ts";
import { sendJobEmail } from "./job-delivery.ts";
import { fmtDate, renderEmail } from "./handler.ts";

type Change = {
  eventId: string;
  session: { id: number; student_id?: string; teacher_id: string; date_time: string };
  previousTeacherId?: string;
  extra: { previousDateTime: string };
};
type User = { id: string; name: string; email?: string };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Recipient scope is computed on the server, never supplied by a client. */
export function summaryRecipients(changes: Change[], users: User[], adminEmails: string[]) {
  const admins = new Set(uniqueRecipients(adminEmails));
  const byId = new Map(users.map(user => [user.id, user]));
  const recipients = new Map<string, { changes: Change[]; role: "student" | "teacher" | "admin" }>();
  for (const change of changes) {
    const parties = [change.session.student_id, change.session.teacher_id, change.previousTeacherId];
    const teachers = uniqueRecipients([byId.get(change.session.teacher_id)?.email, byId.get(change.previousTeacherId ?? "")?.email]);
    for (const email of uniqueRecipients([...parties.map(id => byId.get(id ?? "")?.email), ...admins])) {
      const role = admins.has(email) ? "admin" : teachers.includes(email) ? "teacher" : "student";
      const recipient = recipients.get(email) ?? { changes: [], role };
      if (role === "admin" || (role === "teacher" && recipient.role === "student")) recipient.role = role;
      if (!recipient.changes.some(row => row.eventId === change.eventId)) recipient.changes.push(change);
      recipients.set(email, recipient);
    }
  }
  return recipients;
}

export async function handleAdminScheduleSummary(job: { eventId: string; changes: Change[] }) {
  if (!job.changes?.length) return Response.json({ ok: false, error: "Empty summary" }, { status: 400 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ids = [...new Set(job.changes.flatMap(c => [c.session.student_id, c.session.teacher_id, c.previousTeacherId]).filter((id): id is string => !!id))];
  const [{ data: users, error: userError }, { data: settings, error: settingsError }] = await Promise.all([
    admin.from("app_users").select("id,name,email").in("id", ids),
    admin.from("notification_settings").select("admin_emails").eq("id", true).maybeSingle(),
  ]);
  if (userError || settingsError) return Response.json({ ok: false, results: { lookup: { ok: false, code: "recipient_lookup_failed" } } }, { status: 503 });
  const byId = new Map<string, User>((users ?? []).map((u: User) => [u.id, u]));
  const results: Record<string, DeliveryResult> = {};
  const adminEmails = uniqueRecipients(settings?.admin_emails ?? []);
  if (!adminEmails.length) results.admin = { ok: false, code: "missing_admin_email", attempts: 0 };
  for (const id of ids) if (!byId.get(id)?.email) results[`missing_${id}`] = { ok: false, code: "missing_party_email", attempts: 0 };
  let count = 0;
  for (const [email, recipient] of summaryRecipients(job.changes, users ?? [], adminEmails)) {
    if (count > 0) await new Promise(resolve => setTimeout(resolve, 650));
    const changes = [...recipient.changes].sort((a, b) => +new Date(a.session.date_time) - +new Date(b.session.date_time));
    const rows = changes.map(change => ({
      label: recipient.role === "student" ? "Sesión" : escapeHtml(byId.get(change.session.student_id ?? "")?.name ?? "Sesión de grupo"),
      value: `${escapeHtml(fmtDate(change.extra.previousDateTime))}<br><strong>Nuevo: ${escapeHtml(fmtDate(change.session.date_time))}</strong><br>Profesor: ${escapeHtml(byId.get(change.session.teacher_id)?.name ?? "Academy")}`,
    }));
    const result = await sendJobEmail({
      apiKey: Deno.env.get("RESEND_API_KEY"),
      from: Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>",
      to: [email], subject: "Tu horario actualizado - Verbo Academy",
      html: renderEmail({ eyebrow: "Actualización de horario", title: "Tu calendario está actualizado",
        bodyHtml: `Academy actualizó ${changes.length} sesión${changes.length === 1 ? "" : "es"}. Aquí tienes el resumen completo de los cambios que te corresponden. Todas las horas son de Ciudad de México.`,
        rows, cta: { label: "Ver mi calendario", href: `https://verboacademic.com/${recipient.role === "student" ? "student/sessions" : recipient.role + "/calendar"}` } }),
      idempotencyKey: await emailEventKey(job.eventId, [email]),
    }, admin, job.eventId);
    results[`recipient_${count++}`] = result;
    if (isQuotaExceeded(result.code)) break;
  }
  return Response.json({ ok: Object.values(results).every(result => result.ok), results });
}
