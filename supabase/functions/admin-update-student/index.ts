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
    .select("role, admin_type, admin_disabled").eq("id", auth.user.id).maybeSingle();
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

  const packageInput = body.clubPackage;
  if (packageInput !== undefined && (!packageInput || typeof packageInput !== "object" || Array.isArray(packageInput))) {
    return reply(400, { error: "Invalid Clubs package" });
  }
  const clubPackage = packageInput as Record<string, unknown> | undefined;
  const mode = clubPackage?.mode;
  if (clubPackage && !["new", "adjust", "restore"].includes(mode as string)) {
    return reply(400, { error: "Invalid Clubs package action" });
  }
  if (clubPackage && (typeof clubPackage.reason !== "string" || clubPackage.reason.trim().length < 8)) {
    return reply(400, { error: "Explain the Clubs package change (at least 8 characters)" });
  }

  const { data: previous, error: lookupError } = await service.from("app_users")
    .select("id, role, name, email, product_type, club_package_id, club_package_months, club_package_started_on, club_package_expires_on, club_insight_base, club_book_base, club_insight_bonus, club_book_bonus")
    .eq("id", studentId).maybeSingle();
  if (lookupError || previous?.role !== "student") return reply(404, { error: "Student not found" });

  const today = mexicoDate();
  let packagePatch: Record<string, unknown> = {};
  if (clubPackage?.mode === "new") {
    const months = clubPackage.months;
    const insightBonus = clubPackage.insightBonus;
    const bookBonus = clubPackage.bookBonus;
    const insights = clubPackage.insights;
    const books = clubPackage.books;
    if (![1, 3, 6].includes(months as number)
      || typeof insights !== "boolean" || typeof books !== "boolean" || (!insights && !books)
      || !Number.isSafeInteger(insightBonus) || !Number.isSafeInteger(bookBonus)
      || (insightBonus as number) < 0 || (bookBonus as number) < 0
      || (insightBonus as number) > 2147483647 || (bookBonus as number) > 2147483647
      || (!insights && insightBonus !== 0) || (!books && bookBonus !== 0)) {
      return reply(400, { error: "Invalid Clubs package" });
    }
    if (previous.club_package_expires_on && previous.club_package_expires_on > today) {
      return reply(409, { error: "The current Clubs package is still active. Adjust its extras or wait until it expires before renewing." });
    }
    packagePatch = {
      product_type: "insights",
      addon_insights_per_month: insights ? 1 : 0,
      addon_bookclubs_per_month: books ? 1 : 0,
      club_package_id: crypto.randomUUID(),
      club_package_months: months,
      club_package_started_on: today,
      club_package_expires_on: addMonthsClamped(today, 2 * (months as number)),
      club_insight_base: insights ? 4 * (months as number) : 0,
      club_book_base: books ? 4 * (months as number) : 0,
      club_insight_bonus: insightBonus,
      club_book_bonus: bookBonus,
    };
  } else if (clubPackage?.mode === "adjust") {
    const insightBonus = clubPackage.insightBonus;
    const bookBonus = clubPackage.bookBonus;
    if (previous.product_type !== "insights" || !previous.club_package_id
      || !Number.isSafeInteger(insightBonus) || !Number.isSafeInteger(bookBonus)
      || (insightBonus as number) < previous.club_insight_bonus
      || (bookBonus as number) < previous.club_book_bonus
      || (insightBonus as number) > 2147483647 || (bookBonus as number) > 2147483647
      || (!previous.club_insight_base && insightBonus !== 0)
      || (!previous.club_book_base && bookBonus !== 0)
      || (insightBonus === previous.club_insight_bonus && bookBonus === previous.club_book_bonus)) {
      return reply(400, { error: "Extras can only increase within an existing collection" });
    }
    packagePatch = { club_insight_bonus: insightBonus, club_book_bonus: bookBonus };
  } else if (clubPackage?.mode === "restore") {
    const expiresOn = clubPackage.expiresOn;
    if (adminRow.admin_type !== "super_admin") return reply(403, { error: "Only Super Admin can restore expired access" });
    if (previous.product_type !== "insights" || !previous.club_package_id
      || typeof expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)
      || !previous.club_package_expires_on || previous.club_package_expires_on > today
      || expiresOn <= today) {
      return reply(400, { error: "Choose a future restoration expiry for an expired package" });
    }
    packagePatch = { club_package_expires_on: expiresOn };
  }
  if (clubPackage) {
    packagePatch.club_package_changed_by = auth.user.id;
    packagePatch.club_package_change_reason = (clubPackage.reason as string).trim();
  }

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

  const update = { ...Object.fromEntries(profileEntries), ...packagePatch, name, email };
  const updater = clubPackage ? service : caller;
  let saveQuery = updater.from("app_users").update(update).eq("id", studentId).eq("role", "student");
  if (clubPackage) {
    saveQuery = previous.club_package_id
      ? saveQuery.eq("club_package_id", previous.club_package_id)
      : saveQuery.is("club_package_id", null);
    if (mode === "adjust") {
      saveQuery = saveQuery.eq("club_insight_bonus", previous.club_insight_bonus)
        .eq("club_book_bonus", previous.club_book_bonus);
    } else if (previous.club_package_expires_on) {
      saveQuery = saveQuery.eq("club_package_expires_on", previous.club_package_expires_on);
    }
  }
  const { data: saved, error: saveError } = await saveQuery.select("*").single();
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
  return reply(200, { id: saved.id, name: saved.name, email: saved.email, profile: saved });
});
