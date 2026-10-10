// Public guest boundary. Never return an entire clubs row or a storage path.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (Deno.env.get("GUEST_APP_URL") || "https://www.verboacademic.com").replace(/\/$/, "");
const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const allowedOrigin = (origin: string | null) => !origin ||
  origin === "https://www.verboacademic.com" || origin === "https://verboacademic.com" ||
  /^http:\/\/localhost:\d+$/.test(origin) || /^https:\/[a-z0-9-]+\.vercel\.app$/.test(origin);

function headers(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigin(origin) ? origin : "https://www.verboacademic.com",
    "Access-Control-Allow-Headers": "content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
}
const respond = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });
const normalizedCode = (value: unknown) => typeof value === "string"
  ? value.toUpperCase().replace(/[\s-]/g, "") : "";
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const mxDate = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", dateStyle: "full", timeStyle: "short",
}).format(new Date(value));
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

async function sendConfirmation(data: { booking_id: string; email: string; guest_name: string;
  club_title: string; club_date: string; club_type: string }, accessToken: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>";
  const accessUrl = `${APP_URL}/guest/my-club#access=${accessToken}`;
  const html = emailFrame(`<p style="margin:0 0 10px;color:#c76a1f;font-size:11px;font-weight:700;letter-spacing:.18em;">TU RESERVA ESTÁ CONFIRMADA</p>
    <h1 style="margin:0 0 16px;color:#01304a;font-size:28px;line-height:1.18;">Tu lugar en ${escapeHtml(data.club_title)}</h1>
    <p style="margin:0 0 22px;color:#365568;font-size:15px;line-height:1.65;">Hola ${escapeHtml(data.guest_name)}. Tu lugar está reservado. Guarda este correo para volver a tu página personal cuando lo necesites.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f8;border:1px solid #dce5e8;border-radius:14px;"><tr><td style="padding:19px 22px;color:#01304a;font-size:15px;line-height:1.7;"><strong>Encuentro:</strong> ${escapeHtml(data.club_title)}<br><strong>Fecha:</strong> ${escapeHtml(mxDate(data.club_date))} (Ciudad de México)</td></tr></table>
    ${emailButton(accessUrl, "Ver mi club")}
    <p style="margin:0 0 16px;color:#365568;font-size:14px;line-height:1.65;">En tu página encontrarás los detalles del encuentro y el material si Verbo lo ha publicado. El botón de reunión aparecerá diez minutos antes de comenzar.</p>
    <p style="margin:0 0 16px;color:#607785;font-size:13px;line-height:1.6;">Este enlace es personal. No lo compartas.</p>`);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "Idempotency-Key": `guest-booking-${data.booking_id}` },
      body: JSON.stringify({ from, to: [data.email], subject: `Tu lugar en ${data.club_title} está confirmado`, html }),
    });
    return response.ok;
  } catch { return false; }
}

async function checkedBooking(accessToken: unknown) {
  if (typeof accessToken !== "string" || !/^[0-9a-f]{64}$/.test(accessToken)) return null;
  const accessHash = await hash(accessToken);
  const { data: booking, error } = await admin.from("club_guest_bookings")
    .select("id,invitation_id,club_id,status,booked_at")
    .eq("access_hash", accessHash).maybeSingle();
  if (error || !booking) return null;
  const [{ data: invitation }, { data: club }] = await Promise.all([
    admin.from("club_guest_invitations").select("guest_name,email,revoked_at")
      .eq("id", booking.invitation_id).maybeSingle(),
    admin.from("clubs").select("id,type,title,description,subtitle,instructions,date,duration_minutes,status,cover_image,material,link")
      .eq("id", booking.club_id).maybeSingle(),
  ]);
  if (!invitation || invitation.revoked_at || !club) return null;
  const end = new Date(club.date).getTime() + club.duration_minutes * 60_000;
  if (Date.now() > end + 24 * 60 * 60_000) return null;
  return { booking, invitation, club, accessHash, end };
}

Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  if (!allowedOrigin(origin)) return respond({ error: "Forbidden" }, 403, null);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405, origin);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return respond({ error: "Request too large" }, 413, origin);
    body = JSON.parse(raw);
  } catch { return respond({ error: "Invalid request" }, 400, origin); }

  if (body.action === "catalog") {
    const { data: clubs, error } = await admin.from("clubs")
      .select("id,type,title,description,subtitle,topic_tag,cover_image,cover_position_x,cover_position_y,cover_scale,date,duration_minutes,status,teacher_id,link")
      .eq("status", "upcoming").gt("date", new Date().toISOString())
      .order("date", { ascending: true }).limit(100);
    if (error) return respond({ error: "Catalog unavailable" }, 503, origin);
    const ids = (clubs || []).map(club => club.id);
    const { data: taken } = ids.length ? await admin.from("club_guest_bookings")
      .select("club_id").in("club_id", ids).eq("status", "booked") : { data: [] };
    const reserved = new Set((taken || []).map(row => row.club_id));
    return respond({ clubs: (clubs || []).map(club => {
      const { teacher_id, link, ...publicClub } = club;
      return { ...publicClub,
        guestSeatAvailable: Boolean(teacher_id && link?.trim()) && !reserved.has(club.id)
          && new Date(club.date).getTime() - Date.now() >= 24 * 60 * 60_000 };
    }) }, 200, origin);
  }

  if (body.action === "book") {
    const code = normalizedCode(body.code);
    const clubId = body.clubId;
    if (!/^[A-Z2-9]{12}$/.test(code) || typeof clubId !== "number" || !Number.isSafeInteger(clubId) || clubId < 1)
      return respond({ error: "No pudimos validar esta cortesía. Revisa el código o elige otro club." }, 400, origin);
    // The proxy-provided IP provides a practical rate limit; the 60-bit code is
    // also resistant to guessing if a caller can rotate their IP address.
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: allowed, error: limitError } = await admin.rpc("check_guest_code_rate_limit", { p_key_hash: await hash(ip) });
    if (limitError || !allowed) return respond({ error: "Demasiados intentos. Intenta más tarde." }, 429, origin);
    const accessToken = token();
    const { data, error } = await admin.rpc("reserve_guest_club", {
      p_code_hash: await hash(code), p_club_id: clubId, p_access_hash: await hash(accessToken),
    });
    if (error || !data) return respond({ error: "No pudimos validar esta cortesía. Revisa el código o elige otro club." }, 400, origin);
    const emailSent = await sendConfirmation(data, accessToken);
    if (emailSent) await admin.from("club_guest_bookings").update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", data.booking_id);
    return respond({ booked: true, emailSent, email: data.email }, 200, origin);
  }

  if (["detail", "material", "meeting", "cancel"].includes(String(body.action))) {
    const checked = await checkedBooking(body.accessToken);
    if (!checked) return respond({ error: "Este acceso ya no está disponible." }, 403, origin);
    const { booking, invitation, club, accessHash, end } = checked;
    const active = booking.status === "booked" && club.status !== "cancelled";
    if (body.action === "detail") return respond({
      guestName: invitation.guest_name,
      bookingStatus: booking.status,
      club: { id: club.id, type: club.type, title: club.title, description: club.description,
        subtitle: club.subtitle, instructions: club.instructions, date: club.date,
        duration_minutes: club.duration_minutes, status: club.status, cover_image: club.cover_image },
      materialAvailable: active && Boolean(club.material),
      meetingAvailable: active && Boolean(club.link)
        && Date.now() >= new Date(club.date).getTime() - 10 * 60_000 && Date.now() <= end,
      cancellationAvailable: active && new Date(club.date).getTime() - Date.now() >= 24 * 60 * 60_000,
    }, 200, origin);
    if (!active) return respond({ error: "Esta reserva ya no está activa." }, 403, origin);
    if (body.action === "cancel") {
      const { data: cancelled, error } = await admin.rpc("cancel_guest_club", { p_access_hash: accessHash });
      return error || !cancelled ? respond({ error: "La cancelación ya no está disponible." }, 400, origin)
        : respond({ cancelled: true }, 200, origin);
    }
    if (body.action === "meeting") {
      if (!club.link || Date.now() < new Date(club.date).getTime() - 10 * 60_000 || Date.now() > end)
        return respond({ error: "El enlace estará disponible diez minutos antes del club." }, 403, origin);
      const { data: allowed, error } = await admin.rpc("check_guest_code_rate_limit", {
        p_key_hash: await hash(`resource:${accessHash}`), p_limit: 20,
      });
      if (error || !allowed) return respond({ error: "Demasiadas solicitudes. Intenta más tarde." }, 429, origin);
      return respond({ url: club.link }, 200, origin);
    }
    if (!club.material) return respond({ error: "Todavía no hay material para este club." }, 404, origin);
    const { data: allowed, error: limitError } = await admin.rpc("check_guest_code_rate_limit", {
      p_key_hash: await hash(`resource:${accessHash}`), p_limit: 20,
    });
    if (limitError || !allowed) return respond({ error: "Demasiadas solicitudes. Intenta más tarde." }, 429, origin);
    if (!club.material.startsWith("storage://materials/")) {
      // Older externally hosted materials cannot be revoked after opening.
      if (!/^https:\/\//i.test(club.material)) return respond({ error: "Material no disponible." }, 404, origin);
      return respond({ url: club.material }, 200, origin);
    }
    const path = club.material.slice("storage://materials/".length);
    if (!path.startsWith("club-materials/") || path.includes(".."))
      return respond({ error: "Material no disponible." }, 404, origin);
    const { data: signed, error } = await admin.storage.from("materials").createSignedUrl(path, 60 * 5);
    return error || !signed?.signedUrl ? respond({ error: "No pudimos abrir el material." }, 503, origin)
      : respond({ url: signed.signedUrl }, 200, origin);
  }
  return respond({ error: "Unknown action" }, 400, origin);
});
