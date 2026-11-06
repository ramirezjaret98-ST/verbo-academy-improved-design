import { createClient } from "jsr:@supabase/supabase-js@2";

// Internal one-use setup job. Its random capability expires in ten minutes;
// only the service role can claim it. Neither credentials nor tokens are logged.
Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let id: string; let token: string;
  try {
    const body = await req.json();
    if (typeof body.id !== "string" || typeof body.token !== "string" || body.token.length !== 64) throw new Error();
    id = body.id; token = body.token;
  } catch { return json({ error: "Invalid request" }, 400); }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: jobs, error: claimError } = await admin.rpc("claim_sales_demo_setup", { p_id: id, p_token: token });
  if (claimError || jobs?.length !== 1) return json({ error: "Setup capability invalid or expired" }, 403);
  let userId: string | null = null;
  try {
    const year = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Mexico_City", year: "numeric" }).format(new Date()));
    const { data: password, error: passwordError } = await admin.rpc("student_temporary_password", { p_year: year });
    if (passwordError || typeof password !== "string" || password.length < 6) throw new Error("Temporary credential unavailable");
    const { data: existing, error: lookupError } = await admin.from("app_users").select("id,is_sales_demo,sales_demo_teacher_id,role").eq("email", "demo@verbo.com").maybeSingle();
    if (lookupError) throw new Error(`Demo lookup failed (${lookupError.code})`);
    if (existing) {
      if (!existing.is_sales_demo || existing.role !== "student" || existing.sales_demo_teacher_id !== jobs[0].teacher_id) throw new Error("Existing identity is not this sales demo");
      userId = existing.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: "demo@verbo.com", password, email_confirm: true,
        user_metadata: { name: "Verbo Sales Demo", role: "student" },
      });
      if (error || !data.user) throw new Error("Could not create demo account");
      userId = data.user.id;
    }
    const { error: profileError } = await admin.from("app_users").update({
      legacy_id: `sales-demo-${userId}`, name: "Verbo Sales Demo", role: "student",
      is_sales_demo: true, sales_demo_teacher_id: jobs[0].teacher_id,
      exclude_from_financials: true, custom_price: 0, welcome_pending: false,
      must_change_password: true, welcome_password_year: year,
      product: "go", product_type: "performance", focus: "Hobby & Culture", access_plan: "Elite",
      contracted_levels: ["Kickstart", "Everyday Flow", "Confident Voice", "Culture Master"],
      current_roadmap_level: "Kickstart", current_level: "B1", status: "active",
      hired_sessions: 48, remaining_sessions: 45, sessions_per_week: 2, session_duration: 60,
      sessions_auto: false, reschedule_policy: "6h notice, max 70% of monthly sessions",
      addon_insights_per_month: 2, addon_bookclubs_per_month: 2, addon_spotlight_per_month: 2,
      member_since: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10),
      admin_notes: "Sales demonstration only. Sample progress; isolated from real metrics, payroll and real Clubs capacity.",
    }).eq("id", userId).select("id").single();
    if (profileError) throw new Error(`Demo profile setup failed (${profileError.code})`);
    const { error: assignmentError } = await admin.from("assignments").upsert({ student_id: userId, teacher_id: jobs[0].teacher_id });
    if (assignmentError) throw new Error("Demo profile created; teacher assignment requires repair");
    const student = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: login, error: loginError } = await student.auth.signInWithPassword({ email: "demo@verbo.com", password });
    if (loginError || login.user?.id !== userId) throw new Error("Demo created; initial sign-in could not be verified");
    const { data: ownProfile, error: ownError } = await student.from("app_users").select("id,is_sales_demo,must_change_password").eq("id", userId).single();
    await student.auth.signOut();
    if (ownError || !ownProfile?.is_sales_demo || !ownProfile.must_change_password) throw new Error("Demo sign-in profile verification failed");
    const { error: finishError } = await admin.rpc("finish_sales_demo_setup", { p_id: id, p_user_id: userId, p_error: null });
    if (finishError) return json({ error: "Setup completion could not be recorded" }, 500);
    return json({ ok: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Setup failed";
    await admin.rpc("finish_sales_demo_setup", { p_id: id, p_user_id: userId, p_error: message });
    return json({ error: message }, 500);
  }
});
