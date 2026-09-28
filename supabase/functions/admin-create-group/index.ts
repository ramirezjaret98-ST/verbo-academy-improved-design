// Creates a real group and real student accounts. No welcome email is sent;
// each new student's welcome_pending flag is handled by admin-send-welcome.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: cors });

type Member = { name: string; email: string; member_since?: string };
type GroupInput = {
  name: string; company_client: string; max_capacity: number;
  product: string; access_plan?: string; focus?: string;
  contracted_levels?: string[]; current_roadmap_level?: string;
  hired_sessions: number; remaining_sessions: number;
  sessions_per_week?: number; session_duration?: number;
  reschedule_policy?: string; payment_day?: number; cycle_start?: string;
  next_payment?: string; video_call_link?: string; teacher_id?: string;
  addon_insights_per_month?: number; addon_bookclubs_per_month?: number;
  addon_spotlight_per_month?: number; addon_workshops_enabled?: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(500, { error: "Service unavailable" });
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerAuth, error: authError } = await caller.auth.getUser();
  if (authError || !callerAuth.user) return reply(401, { error: "Not authenticated" });
  const admin = createClient(url, serviceKey);
  const { data: actor } = await admin.from("app_users").select("role").eq("id", callerAuth.user.id).maybeSingle();
  if (actor?.role !== "admin") return reply(403, { error: "Admin only" });

  let body: { group?: GroupInput; members?: Member[] };
  try { body = await req.json(); } catch { return reply(400, { error: "Invalid request" }); }
  const group = body.group;
  const members = body.members;
  if (!group || !Array.isArray(members) || members.length < 2 || members.length > 20 ||
      !group.name?.trim() || !group.company_client?.trim() || !group.product ||
      !Number.isInteger(group.max_capacity) || group.max_capacity < members.length || group.max_capacity > 20 ||
      !Number.isInteger(group.hired_sessions) || group.hired_sessions < 0 ||
      !Number.isInteger(group.remaining_sessions) || group.remaining_sessions < 0 ||
      group.remaining_sessions > group.hired_sessions) {
    return reply(400, { error: "Invalid group details or member count" });
  }
  const emails = new Set<string>();
  for (const m of members) {
    const email = m.email?.trim().toLowerCase();
    if (!m.name?.trim() || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        emails.has(email)) {
      return reply(400, { error: "Each member needs a distinct valid email and name" });
    }
    emails.add(email);
  }
  if (group.teacher_id) {
    const { data: teacher } = await admin.from("app_users").select("role").eq("id", group.teacher_id).maybeSingle();
    if (teacher?.role !== "teacher") return reply(400, { error: "Invalid teacher" });
  }

  const passwordYear = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Mexico_City", year: "numeric" }).format(new Date()));
  const { data: password, error: passwordError } = await admin.rpc("student_temporary_password", { p_year: passwordYear });
  if (passwordError || typeof password !== "string" || password.length < 6) {
    return reply(503, { error: "Student temporary credential is not configured" });
  }

  const allowed: Array<keyof GroupInput> = [
    "name", "company_client", "max_capacity", "product", "access_plan", "focus",
    "contracted_levels", "current_roadmap_level", "hired_sessions", "remaining_sessions",
    "sessions_per_week", "session_duration", "reschedule_policy", "payment_day",
    "cycle_start", "next_payment", "video_call_link", "teacher_id",
    "addon_insights_per_month", "addon_bookclubs_per_month", "addon_spotlight_per_month",
    "addon_workshops_enabled",
  ];
  const groupRow: Record<string, unknown> = { product_type: "performance" };
  for (const key of allowed) if (group[key] !== undefined) groupRow[key] = group[key];
  const { data: createdGroup, error: groupError } = await admin.from("groups")
    .insert(groupRow).select("id").single();
  if (groupError || !createdGroup) return reply(400, { error: groupError?.message ?? "Group creation failed" });

  const createdUsers: string[] = [];
  try {
    for (const m of members) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: m.email.trim().toLowerCase(), password,
        email_confirm: true, user_metadata: { name: m.name.trim(), role: "student" },
      });
      if (createError || !created.user) throw new Error(createError?.message ?? "Account creation failed");
      createdUsers.push(created.user.id);
      const { error: profileError } = await admin.from("app_users").update({
        legacy_id: `u${crypto.randomUUID()}`, must_change_password: true, welcome_pending: true,
        welcome_password_year: passwordYear, member_since: m.member_since || null,
      }).eq("id", created.user.id);
      if (profileError) throw profileError;
      const { error: memberError } = await admin.from("group_members").insert({
        student_id: created.user.id, group_id: createdGroup.id,
      });
      if (memberError) throw memberError;
      // The membership trigger applies the shared profile and teacher atomically.
    }
    return reply(200, { groupId: createdGroup.id, memberCount: createdUsers.length });
  } catch (error) {
    // Compensate only objects created by this request. Never touch existing accounts.
    let rollbackFailed = false;
    for (const id of createdUsers.reverse()) {
      const { error: deletionError } = await admin.auth.admin.deleteUser(id);
      if (deletionError) rollbackFailed = true;
    }
    const { error: deleteGroupError } = await admin.from("groups").delete().eq("id", createdGroup.id);
    if (deleteGroupError) rollbackFailed = true;
    console.error("[admin-create-group] failed", error, { rollbackFailed });
    return reply(500, { error: rollbackFailed
      ? "Registration failed and cleanup was incomplete. Contact support before retrying."
      : error instanceof Error ? error.message : "Registration failed" });
  }
});
