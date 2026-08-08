// Admin-only: creates a REAL Supabase Auth account (email + temp password)
// for a new student/teacher/internal-admin, so beta users get a working
// login instead of the old localStorage-only "registration" that never
// touched auth.users.
//
// `on_auth_user_created` (a DB trigger already in this project) auto-inserts
// the matching public.app_users row (id, name, email, role) from the auth
// user's raw_user_meta_data as soon as it's created — we only need to patch
// in `legacy_id` (the short frontend id, e.g. "u1738879234567", so the
// existing user-id-bridge.ts resolves it), `must_change_password`, and (for
// role === "admin") `admin_type`.
//
// Creating an internal admin/coordinator account (role === "admin") is
// further restricted to callers who are themselves super_admin — any
// regular admin/coordinator could otherwise mint themselves a super_admin
// account. Student/teacher creation keeps the original any-admin check.
//
// NOTE: this file is kept here for version control / reference. It is
// already deployed live to the Supabase project via the Management API —
// uploading this copy through GitHub does NOT redeploy it. If you ever need
// to change this function's behavior, the change has to be applied through
// Supabase directly (ask Claude to redeploy it), not just by editing this
// file in the repo.
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client scoped to the caller's own JWT — used only to confirm identity.
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerAuth?.user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  // Service-role client — used for the admin-role check (bypasses RLS so this
  // is reliable regardless of policy shape) and for the actual account creation.
  const admin = createClient(url, serviceKey);
  const { data: callerRow, error: callerRowErr } = await admin
    .from("app_users")
    .select("role, admin_type")
    .eq("id", callerAuth.user.id)
    .maybeSingle();
  if (callerRowErr || !callerRow || callerRow.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  let body: { legacyId?: string; email?: string; password?: string; name?: string; role?: string; adminType?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  const { legacyId, email, password, name, role, adminType } = body;
  if (!legacyId || !email || !password || !name || (role !== "student" && role !== "teacher" && role !== "admin")) {
    return new Response(JSON.stringify({ error: "legacyId, email, password, name and role ('student'|'teacher'|'admin') are required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "password must be at least 6 characters" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
  if (role === "admin") {
    if (callerRow.admin_type !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: only Super Admin can create internal admin/coordinator accounts" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
    const validAdminTypes = ["super_admin", "coordinator_ops", "coordinator_fin"];
    if (!validAdminTypes.includes(adminType ?? "")) {
      return new Response(JSON.stringify({ error: "adminType ('super_admin'|'coordinator_ops'|'coordinator_fin') is required when role is 'admin'" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (createErr || !created?.user) {
    return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create auth user" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { error: updateErr } = await admin
    .from("app_users")
    .update({
      legacy_id: legacyId,
      must_change_password: true,
      ...(role === "admin" ? { admin_type: adminType } : {}),
    })
    .eq("id", created.user.id);
  if (updateErr) {
    // Auth user exists but the app_users patch failed — surface this clearly
    // rather than leaving a silent half-created account with no legacy_id.
    return new Response(JSON.stringify({ error: `Auth account created but failed to link legacy_id: ${updateErr.message}`, authUserId: created.user.id }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ id: created.user.id, legacyId }), { status: 200, headers: { "Content-Type": "application/json" } });
});
