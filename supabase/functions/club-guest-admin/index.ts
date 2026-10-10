// Admin boundary for issuing and revoking individual club courtesies.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const APP_URL = (Deno.env.get("GUEST_APP_URL") || "https://www.verboacademic.com").replace(/\/$/, "");
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(12)))
  .map(byte => alphabet[byte & 31]).join("");
const newAccess = () => Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const mxDate = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", dateStyle: "full", timeStyle: "short",
}).format(new Date(value));
async function sendEmail(to: string, subject: string, html: string, idempotencyKey: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>",
        to: [to], subject, html }),
    });
    return result.ok;
  } catch { return false; }
}
function emailFrame(content: string) {
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f2f5f6;color:#01304a;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f6;"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dce5e8;border-radius:20px;overflow:hidden;">
      <tr><td style="height:5px;background:#f58a18;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="background:#01304a;padding:25px 30px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td><img src="https://raw.githubusercontent.com/ramirezjaret98-ST/verbo-academy-improved-design/main/src/assets/verbo-logo.png" width="44" height="44" alt="Verbo" style="display:block;border:0;border-radius:10px;"></td>
          <td style="padding-left:13px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.02em;">VERBO <span style="color:#f58a18;">CLUBS</span><br><span style="font-size:10px;font-weight:600;letter-spacing:.16em;color:#b9ced8;">LANGUAGE SOLUTIONS</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:34px 30px 12px;">${content}</td></tr>
      <tr><td style="padding:16px 30px 28px;border-top:1px solid #e5ecee;color:#607785;font-size:12px;line-height:1.6;">Verbo Language Solutions · Una invitación personal para conversar en inglés.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}
const emailButton = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;"><tr><td style="border-radius:12px;background:#f58a18;">
  <a href="${href}" style="display:inline-block;padding:15px 24px;color:#01304a;font-size:15px;font-weight:700;text-decoration:none;">${label}</a>
  </td></tr></table>`;

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const caller = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return response({ error: "Not authenticated" }, 401);
  const admin = createClient(url, serviceKey);
  const { data: actor, error: actorError } = await admin.from("app_users")
    .select("role,admin_disabled").eq("id", auth.user.id).maybeSingle();
  if (actorError || !actor || actor.role !== "admin" || actor.admin_disabled)
    return response({ error: "Forbidden" }, 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return response({ error: "Invalid body" }, 400); }

  if (body.action === "list") {
    const { data: invitations, error } = await admin.from("club_guest_invitations")
      .select("id,guest_name,email,allowed_types,expires_at,redeemed_at,revoked_at,invitation_sent_at,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return response({ error: "Could not load courtesies" }, 503);
    const ids = (invitations || []).map(invitation => invitation.id);
    const { data: bookings } = ids.length ? await admin.from("club_guest_bookings")
      .select("id,invitation_id,club_id,status,booked_at,confirmation_sent_at").in("invitation_id", ids) : { data: [] };
    const clubIds = (bookings || []).map(booking => booking.club_id);
    const { data: clubs } = clubIds.length ? await admin.from("clubs")
      .select("id,title,date,type").in("id", clubIds) : { data: [] };
    return response({ invitations, bookings, clubs });
  }

  if (body.action === "create") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return response({ error: "Name and valid email are required" }, 400);
    const code = newCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();
    const { data: invitation, error } = await admin.from("club_guest_invitations").insert({
      guest_name: name, email, code_hash: await digest(code),
      allowed_types: ["insight", "book"], expires_at: expiresAt, created_by: auth.user.id,
    }).select("id").single();
    if (error || !invitation) return response({ error: "Could not create courtesy" }, 503);
    const formattedCode = code.match(/.{1,4}/g)!.join("-");
    const html = emailFrame(`<p style="margin:0 0 10px;color:#c76a1f;font-size:11px;font-weight:700;letter-spacing:.18em;">TU INVITACIÓN PERSONAL</p>
      <h1 style="margin:0 0 16px;color:#01304a;font-size:28px;line-height:1.18;">Hay un lugar para ti en Verbo Clubs</h1>
      <p style="margin:0 0 22px;color:#365568;font-size:15px;line-height:1.65;">Hola ${escapeHtml(name)}. Elige un Insight o Book Club que te interese y reserva tu lugar con este código:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f8;border:1px solid #dce5e8;border-radius:14px;"><tr><td style="padding:20px 22px;">
        <p style="margin:0 0 7px;color:#607785;font-size:11px;font-weight:700;letter-spacing:.14em;">CÓDIGO DE CORTESÍA</p>
        <p style="margin:0;color:#01304a;font-family:Consolas,Monaco,monospace;font-size:24px;font-weight:700;letter-spacing:2px;">${formattedCode}</p>
      </td></tr></table>
      <p style="margin:22px 0 0;color:#365568;font-size:15px;line-height:1.7;"><strong>¿Cómo reservar?</strong><br>1. Abre el catálogo con el botón de abajo.<br>2. Elige un Club y pulsa «Reservar con mi cortesía».<br>3. Introduce el código y confirma. Te enviaremos otro correo con el botón «Ver mi club».</p>
      ${emailButton(`${APP_URL}/guest/clubs`, "Explorar Clubs")}
      <p style="margin:0 0 12px;color:#365568;font-size:14px;line-height:1.65;"><strong>Vence:</strong> ${escapeHtml(mxDate(expiresAt))} (Ciudad de México).</p>
      <p style="margin:0 0 16px;color:#607785;font-size:13px;line-height:1.6;">El código permite una sola reserva y se consume al confirmar, incluso si después cancelas. Este correo es personal; si no esperabas la invitación, puedes ignorarlo.</p>`);
    const sent = await sendEmail(email, "Tu cortesía para un Verbo Club", html, `guest-invitation-${invitation.id}`);
    if (!sent) {
      await admin.rpc("revoke_guest_invitation", { p_invitation_id: invitation.id });
      return response({ error: "No se pudo enviar el correo. No se activó la cortesía; inténtalo de nuevo." }, 503);
    }
    await admin.from("club_guest_invitations").update({ invitation_sent_at: new Date().toISOString() })
      .eq("id", invitation.id);
    return response({ created: true, id: invitation.id });
  }

  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (!id) return response({ error: "Invalid invitation" }, 400);
  if (body.action === "revoke") {
    const { data, error } = await admin.rpc("revoke_guest_invitation", { p_invitation_id: id });
    return error || !data ? response({ error: "Could not revoke courtesy" }, 503) : response({ revoked: true });
  }
  if (body.action === "resendConfirmation") {
    const { data: invitation } = await admin.from("club_guest_invitations")
      .select("id,guest_name,email,revoked_at").eq("id", id).maybeSingle();
    const { data: booking } = await admin.from("club_guest_bookings")
      .select("id,club_id,access_hash,status,confirmation_sent_at").eq("invitation_id", id).maybeSingle();
    if (!invitation || invitation.revoked_at || !booking || booking.status !== "booked" || booking.confirmation_sent_at)
      return response({ error: "This courtesy has no pending confirmation" }, 400);
    const { data: club } = await admin.from("clubs").select("title,date,status").eq("id", booking.club_id).maybeSingle();
    if (!club || club.status === "cancelled") return response({ error: "Club unavailable" }, 400);
    const access = newAccess();
    const newHash = await digest(access);
    const { data: rotated, error: updateError } = await admin.from("club_guest_bookings")
      .update({ access_hash: newHash }).eq("id", booking.id).eq("access_hash", booking.access_hash)
      .is("confirmation_sent_at", null).select("id").maybeSingle();
    if (updateError || !rotated) return response({ error: "The access was already updated. Refresh the list." }, 409);
    const html = emailFrame(`<p style="margin:0 0 10px;color:#c76a1f;font-size:11px;font-weight:700;letter-spacing:.18em;">TU RESERVA ESTÁ CONFIRMADA</p>
      <h1 style="margin:0 0 16px;color:#01304a;font-size:28px;line-height:1.18;">Tu lugar en ${escapeHtml(club.title)}</h1>
      <p style="margin:0 0 22px;color:#365568;font-size:15px;line-height:1.65;">Hola ${escapeHtml(invitation.guest_name)}. Tu lugar está reservado. Guarda este correo para volver a tu página personal cuando lo necesites.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f8;border:1px solid #dce5e8;border-radius:14px;"><tr><td style="padding:19px 22px;color:#01304a;font-size:15px;line-height:1.7;"><strong>Encuentro:</strong> ${escapeHtml(club.title)}<br><strong>Fecha:</strong> ${escapeHtml(mxDate(club.date))} (Ciudad de México)</td></tr></table>
      ${emailButton(`${APP_URL}/guest/my-club#access=${access}`, "Ver mi club")}
      <p style="margin:0 0 16px;color:#365568;font-size:14px;line-height:1.65;">En tu página encontrarás los detalles del encuentro y el material si Verbo lo ha publicado. El botón de reunión aparecerá diez minutos antes de comenzar.</p>
      <p style="margin:0 0 16px;color:#607785;font-size:13px;line-height:1.6;">Este enlace es personal. No lo compartas.</p>`);
    const sent = await sendEmail(invitation.email, `Tu acceso a ${club.title}`, html, `guest-confirmation-resend-${booking.id}-${newHash.slice(0, 16)}`);
    if (!sent) {
      const { data: restored, error: restoreError } = await admin.from("club_guest_bookings")
        .update({ access_hash: booking.access_hash }).eq("id", booking.id).eq("access_hash", newHash)
        .select("id").maybeSingle();
      return response({ error: restoreError || !restored
        ? "No se pudo confirmar el estado del enlace. Revisa esta reserva antes de reenviar."
        : "No se pudo enviar el correo. El enlace anterior sigue vigente." }, 503);
    }
    const { data: marked, error: markError } = await admin.from("club_guest_bookings")
      .update({ confirmation_sent_at: new Date().toISOString() }).eq("id", booking.id)
      .eq("access_hash", newHash).select("id").maybeSingle();
    if (markError || !marked) return response({ error: "El correo salió, pero no pudimos confirmar el registro. Revisa esta reserva." }, 503);
    return response({ sent: true });
  }
  return response({ error: "Unknown action" }, 400);
});
