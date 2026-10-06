import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const PROFILE_FIELDS = new Set([
  "must_change_password", "current_level", "attendance_percentage", "phone",
  "company", "member_since", "hired_sessions", "remaining_sessions", "product",
  "focus", "access_plan", "contracted_levels", "current_roadmap_level",
  "reopened_levels", "sessions_per_week", "session_duration", "reschedule_policy",
  "reschedule_custom_hours", "reschedule_custom_pct", "payment_day", "cycle_start",
  "next_payment", "custom_price", "exclude_from_financials", "video_call_link",
  "status", "insights_strikes", "bookclub_strikes", "sessions_auto", "admin_notes",
  "freeze_start", "freeze_end", "product_type", "addon_insights_per_month",
  "addon_bookclubs_per_month", "addon_spotlight_per_month", "addon_workshops_enabled",
  "failed_login_attempts", "login_locked_at",
]);

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") ?? "";
  if (!url || !anonKey || !serviceKey || !authorization.startsWith("Bearer ")) {
    return reply(401, { error: "Not authenticated" });
  }

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return reply(401, { error: "Not authenticated" });

  const service = createClient(url, serviceKey);
  const { data: adminRow } = await service.from("app_users")
    .select("role, admin_disabled").eq("id", auth.user.id).maybeSingle();
  if (adminRow?.role !== "admin" || adminRow.admin_disabled) {
    return reply(403, { error: "Admin access required" });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid JSON" }); }
  const studentId = body.studentId;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const profile = body.profile;
  if (typeof studentId !== "string" || !/^[0-9a-f-]{36}$/i.test(studentId)
    || !name || name.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !profile || typeof profile !== "object" || Array.isArray(profile)) {
    return reply(400, { error: "Invalid student profile" });
  }
  const profileEntries = Object.entries(profile);
  if (profileEntries.some(([key]) => !PROFILE_FIELDS.has(key))) {
    return reply(400, { error: "Unsupported profile field" });
  }

  const { data: previous, error: lookupError } = await service.from("app_users")
    .select("id, role, name, email").eq("id", studentId).maybeSingle();
  if (lookupError || previous?.role !== "student") return reply(404, { error: "Student not found" });

  const identityChanged = previous.name !== name || previous.email !== email;
  let oldMetadata: Record<string, unknown> | null = null;
  if (identityChanged) {
    const { data: existingAuth, error: existingAuthError } = await service.auth.admin.getUserById(studentId);
    if (existingAuthError || !existingAuth.user) return reply(502, { error: "Could not read student login" });
    oldMetadata = existingAuth.user.user_metadata ?? {};
    const { error: identityError } = await service.auth.admin.updateUserById(studentId, {
      email,
      user_metadata: { ...oldMetadata, name },
    });
    if (identityError) return reply(400, { error: `Could not update student login: ${identityError.message}` });
  }

  const update = { ...Object.fromEntries(profileEntries), name, email };
  const { data: saved, error: saveError } = await caller.from("app_users")
    .update(update).eq("id", studentId).eq("role", "student")
    .select("id, name, email").single();
  if (saveError || !saved) {
    if (identityChanged) {
      const { error: rollbackError } = await service.auth.admin.updateUserById(studentId, {
        email: previous.email,
        user_metadata: oldMetadata ?? { name: previous.name },
      });
      if (rollbackError) return reply(500, { error: "Profile save failed and login rollback needs attention" });
    }
    return reply(400, { error: `Could not save student profile: ${saveError?.message ?? "no row returned"}` });
  }
  return reply(200, { id: saved.id, name: saved.name, email: saved.email });
});
