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
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#01304a">
    <p style="color:#f58a18;font-weight:bold">VERBO CLUBS</p>${content}</div>`;
}

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
    const html = emailFrame(`<h1>Una conversación para ti</h1>
      <p>Hola ${escapeHtml(name)}, Verbo te invita a explorar nuestros próximos Insights y Book Clubs y reservar un encuentro.</p>
      <p>Tu código personal es <strong style="font-size:22px;letter-spacing:2px">${formattedCode}</strong>.</p>
      <p><a href="${APP_URL}/guest/clubs" style="display:inline-block;background:#f58a18;color:#01304a;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Explorar Clubs</a></p>
      <p>La invitación vence el ${escapeHtml(mxDate(expiresAt))}. Solo permite una reserva; una vez reservada, no se recupera si cancelas.</p>
      <p>Este correo es personal. Si no esperabas la invitación, puedes ignorarlo.</p>`);
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
    const html = emailFrame(`<h1>Tu acceso a ${escapeHtml(club.title)}</h1>
      <p>Hola ${escapeHtml(invitation.guest_name)}, tu reserva está confirmada para el ${escapeHtml(mxDate(club.date))} (Ciudad de México).</p>
      <p><a href="${APP_URL}/guest/my-club#access=${access}" style="display:inline-block;background:#f58a18;color:#01304a;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Ver mi club</a></p>
      <p>Este enlace es personal. Desde la página verás el material y, diez minutos antes, el acceso a la reunión.</p>`);
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
