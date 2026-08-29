// Public (verify_jwt:false): second half of the self-service "forgot
// password" flow - see request-password-reset for why this exists (it
// replaces Supabase Auth's own broken/unstyled recovery email end to end).
// The frontend's /reset-password page reads `token` from the URL and posts
// it here with the chosen new password. Token was minted by
// request-password-reset, stored only as a SHA-256 hash, single-use, and
// expires after 30 minutes.
//
// Same password rule as admin-set-password (this sets a REAL Supabase Auth
// password, so it uses that function's stricter rule, not the legacy
// mock-login rule in src/lib/auth.tsx).
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same rule as admin-set-password's passwordError(). */
function passwordError(pwd: string): string | null {
  if (!pwd || pwd.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(pwd)) return "Password must include at least one uppercase letter.";
  if (!/[0-9]/.test(pwd)) return "Password must include at least one number.";
  return null;
}

async function sendConfirmationEmail(to: string, name: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Verbo Academy <onboarding@resend.dev>";
  const APP_URL = "https://verboacademic.com";
  const WHATSAPP_LINK = "https://wa.me/5212461152136";
  const fmtDate = new Date().toLocaleString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8">
<style>@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');@import url('https://api.fontshare.com/v2/css?f[]=open-sauce-sans@400,500,600,700,800&display=swap');</style></head>
<body style="margin:0;padding:0;background:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:36px 0;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6e9ee;box-shadow:0 18px 40px -20px rgba(1,48,74,0.35);">
<tr><td style="background:linear-gradient(150deg,#073756 0%,#01304a 55%,#001a29 100%);padding:28px 32px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
<td style="width:40px;"><img src="https://raw.githubusercontent.com/ramirezjaret98-ST/verbo-academy-improved-design/main/src/assets/verbo-logo.png" width="40" height="40" alt="Verbo" style="display:block;border-radius:9px;"></td>
<td style="padding-left:12px;"><div style="font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;letter-spacing:0.03em;color:#ffffff;line-height:1.1;">VERBO ACADEMY</div><div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.12em;color:#9fc2d6;text-transform:uppercase;margin-top:2px;">Language Solutions</div></td>
</tr></table></td></tr>
<tr><td style="padding:36px 32px 32px;">
<div style="font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#f38934;margin-bottom:10px;">Seguridad de tu cuenta</div>
<h1 style="margin:0 0 14px;font-family:'Open Sauce Sans','Montserrat',Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#0f172a;font-weight:800;">Confirmamos el cambio de tu contraseña</h1>
<p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#475569;">Hola ${name ?? ""}, tu contraseña se actualizó correctamente el <strong>${fmtDate}</strong> a través del enlace de «olvidé mi contraseña».</p>
<p style="margin:16px 0 0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:12.5px;color:#94a3b8;">¿No reconoces este cambio? Escríbenos por <a href="${WHATSAPP_LINK}" style="color:#f38934;font-weight:600;text-decoration:none;">WhatsApp</a> de inmediato.</p>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e6e9ee;padding:20px 32px;text-align:center;" align="center"><p style="margin:0;font-family:'Montserrat',Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;">Verbo Academy · <a href="${APP_URL}" style="color:#94a3b8;">verboacademic.com</a></p></td></tr>
</table></td></tr></table></body></html>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "Tu contraseña fue actualizada - Verbo Academy", html }),
  }).catch((e) => console.error("[confirm-password-reset] confirmation email failed", e));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { token?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { token, newPassword } = body;
  if (!token) return json({ error: "Invalid or expired link. Please request a new one." }, 400);

  const pwdErr = passwordError(newPassword ?? "");
  if (pwdErr) return json({ error: pwdErr }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const tokenHash = await sha256Hex(token);
  const { data: row, error: rowErr } = await admin
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (rowErr || !row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return json({ error: "Invalid or expired link. Please request a new one." }, 400);
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(row.user_id, { password: newPassword });
  if (updateErr) {
    return json({ error: updateErr.message }, 400);
  }

  // Single-use: mark this token (and drop any siblings for the same user).
  await admin.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await admin.from("password_reset_tokens").delete().eq("user_id", row.user_id).neq("id", row.id);

  const { data: target } = await admin.from("app_users").select("name, email").eq("id", row.user_id).maybeSingle();
  await admin.from("app_users").update({ must_change_password: false }).eq("id", row.user_id);

  if (target?.email) {
    await sendConfirmationEmail(target.email, target.name ?? "").catch(() => {});
  }

  return json({ ok: true });
});
