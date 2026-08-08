// Admin-only: permanently deletes a REAL Supabase Auth account (and, via
// cascade, its public.app_users row and everything that references it —
// assignments, sessions the student took, payments, reports, etc., since
// those tables were built with `ON DELETE CASCADE` back to app_users).
//
// This is the counterpart to admin-create-user. Before this existed, the
// Admin panel could only "Suspend"/"Freeze"/"Remove access" someone (flip a
// status field) — there was no way to actually erase a mistaken or
// duplicate registration, including local-only "ghost" entries left behind
// by a registration attempt that failed on the Supabase side (e.g. the
// pre-2026-08-08 CORS bug, or a duplicate email) but still optimistically
// showed up in the admin's own browser list.
//
// A handful of tables intentionally do NOT cascade from app_users (e.g.
// `sessions.teacher_id` is `ON DELETE RESTRICT`) so that an account with
// real class history can't be silently erased by mistake — deleting one of
// those fails at the database level and this function relays that error
// message as-is rather than swallowing it, so the caller can see exactly why
// (e.g. "update or delete on table app_users violates foreign key
// constraint ...") instead of getting a generic failure.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client scoped to the caller's own JWT — used only to confirm identity.
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerAuth, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerAuth?.user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Service-role client — used for the admin-role check (bypasses RLS so
  // this is reliable regardless of policy shape) and for the actual deletion.
  const admin = createClient(url, serviceKey);
  const { data: callerRow, error: callerRowErr } = await admin
    .from("app_users")
    .select("role, admin_type")
    .eq("id", callerAuth.user.id)
    .maybeSingle();
  if (callerRowErr || !callerRow || callerRow.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: { uuid?: string; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { uuid, confirm } = body;
  if (!uuid) {
    return new Response(JSON.stringify({ error: "uuid is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (confirm !== true) {
    return new Response(JSON.stringify({ error: "confirm must be true — this permanently deletes the account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (uuid === callerAuth.user.id) {
    return new Response(JSON.stringify({ error: "You cannot delete your own account" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: targetRow, error: targetRowErr } = await admin
    .from("app_users")
    .select("role, admin_type")
    .eq("id", uuid)
    .maybeSingle();
  if (targetRowErr || !targetRow) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // Deleting an internal admin/coordinator is further restricted to
  // super_admin callers — same restriction admin-create-user applies when
  // CREATING one, for the same reason (a regular admin/coordinator
  // shouldn't be able to remove a super_admin, including themselves-adjacent
  // accounts, out from under the organization).
  if (targetRow.role === "admin" && callerRow.admin_type !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden: only Super Admin can delete internal admin/coordinator accounts" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(uuid);
  if (deleteErr) {
    return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
