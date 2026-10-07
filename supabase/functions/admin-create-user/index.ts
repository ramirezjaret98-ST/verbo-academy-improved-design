// Admin-only account creation. Student welcome is a separate action.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ClubPackageInput = {
  months: 1 | 3 | 6;
  insights: boolean;
  books: boolean;
  insightBonus: number;
  bookBonus: number;
  reason?: string;
};

function validClubPackage(value: unknown): value is ClubPackageInput {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return [1, 3, 6].includes(p.months as number)
    && typeof p.insights === "boolean" && typeof p.books === "boolean"
    && (p.insights || p.books)
    && Number.isSafeInteger(p.insightBonus) && Number.isSafeInteger(p.bookBonus)
    && (p.insightBonus as number) >= 0 && (p.bookBonus as number) >= 0
    && (p.insightBonus as number) <= 2147483647 && (p.bookBonus as number) <= 2147483647
    && (p.insights || p.insightBonus === 0) && (p.books || p.bookBonus === 0)
    && (p.reason === undefined || typeof p.reason === "string")
    && (!(p.insightBonus || p.bookBonus) || (typeof p.reason === "string" && p.reason.trim().length >= 8));
}

function mexicoDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

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

  // Service-role client — used for the admin-role check (bypasses RLS so this
  // is reliable regardless of policy shape) and for the actual account creation.
  const admin = createClient(url, serviceKey);
  const { data: callerRow, error: callerRowErr } = await admin
    .from("app_users")
    .select("role, admin_type, admin_disabled")
    .eq("id", callerAuth.user.id)
    .maybeSingle();
  if (callerRowErr || !callerRow || callerRow.role !== "admin" || callerRow.admin_disabled) {
    return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: { legacyId?: string; email?: string; password?: string; name?: string; role?: string; adminType?: string; sendWelcomeEmail?: boolean; clubPackage?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { legacyId, email, password: requestedPassword, name, role, adminType } = body;
  if (!legacyId || !email || !name || (role !== "student" && !requestedPassword) || (role !== "student" && role !== "teacher" && role !== "admin")) {
    return new Response(JSON.stringify({ error: "legacyId, email, password, name and role ('student'|'teacher'|'admin') are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (role !== "student" && (requestedPassword?.length ?? 0) < 6) {
    return new Response(JSON.stringify({ error: "password must be at least 6 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (role === "admin") {
    if (callerRow.admin_type !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden: only Super Admin can create internal admin/coordinator accounts" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const validAdminTypes = ["super_admin", "coordinator_ops", "coordinator_fin"];
    if (!validAdminTypes.includes(adminType ?? "")) {
      return new Response(JSON.stringify({ error: "adminType ('super_admin'|'coordinator_ops'|'coordinator_fin') is required when role is 'admin'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
  if (body.clubPackage !== undefined && (role !== "student" || !validClubPackage(body.clubPackage))) {
    return new Response(JSON.stringify({ error: "Invalid Clubs package" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Keep the registration year for invitations sent after a year change.
  const passwordYear = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Mexico_City", year: "numeric" }).format(new Date()));
  let password = requestedPassword;
  if (role === "student") {
    const { data, error } = await admin.rpc("student_temporary_password", { p_year: passwordYear });
    if (error || typeof data !== "string" || data.length < 6) {
      return new Response(JSON.stringify({ error: "Student temporary credential is not configured" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    password = data;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (createErr || !created?.user) {
    return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create auth user" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const clubPackage = body.clubPackage as ClubPackageInput | undefined;
  const startedOn = clubPackage ? mexicoDate() : null;
  const { data: savedProfile, error: updateErr } = await admin
    .from("app_users")
    .update({
      legacy_id: legacyId,
      must_change_password: true,
      ...(role === "student" ? { welcome_pending: true, welcome_password_year: passwordYear } : {}),
      ...(role === "admin" ? { admin_type: adminType } : {}),
      ...(clubPackage && startedOn ? {
        product_type: "insights",
        addon_insights_per_month: clubPackage.insights ? 1 : 0,
        addon_bookclubs_per_month: clubPackage.books ? 1 : 0,
        club_package_id: crypto.randomUUID(),
        club_package_months: clubPackage.months,
        club_package_started_on: startedOn,
        club_package_expires_on: addMonthsClamped(startedOn, 2 * clubPackage.months),
        club_insight_base: clubPackage.insights ? 4 * clubPackage.months : 0,
        club_book_base: clubPackage.books ? 4 * clubPackage.months : 0,
        club_insight_bonus: clubPackage.insightBonus,
        club_book_bonus: clubPackage.bookBonus,
        club_package_changed_by: callerAuth.user.id,
        club_package_change_reason: clubPackage.reason?.trim() || "New contract",
      } : {}),
    })
    .eq("id", created.user.id).select("*").single();
  if (updateErr) {
    if (clubPackage) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
      if (!rollbackError) return new Response(JSON.stringify({ error: `Clubs package could not be created: ${updateErr.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Auth user exists but the app_users patch failed — surface this clearly
    // rather than leaving a silent half-created account with no legacy_id.
    return new Response(JSON.stringify({ error: `Auth account created but failed to link legacy_id: ${updateErr.message}`, authUserId: created.user.id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Welcome is sent only by the separate explicit admin action.

  return new Response(JSON.stringify({ id: created.user.id, legacyId, profile: clubPackage ? savedProfile : undefined }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
