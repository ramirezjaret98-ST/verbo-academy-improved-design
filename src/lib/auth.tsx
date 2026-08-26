import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { USERS, userById, type User, type Role } from "./mock-data";
import { isMemberBlocked } from "./groups-store";
import { hydrateAdminRoles, isUserDeactivated } from "./admin-roles";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

interface AuthCtx {
  user: User | null;
  /** False until the stored session has been restored on the client. */
  ready: boolean;
  /** True during an intentional sign-out, from the moment `logout()` is called
   *  until the app finishes navigating away from the protected area. Protected
   *  UI (guards, screens) must use it to tell a deliberate logout apart from a
   *  session that actually expired. */
  isLoggingOut: boolean;
  login: (
    email: string,
    password: string,
    remember: boolean,
    /** Cloudflare Turnstile token (2026-08-13 security batch). Only required
     *  once Jaret enables "CAPTCHA protection" in the Supabase Auth
     *  dashboard — until then Supabase Auth ignores it if present and
     *  doesn't require it if absent. */
    captchaToken?: string,
  ) => Promise<{ ok: true; role: Role; must_change_password: boolean } | { ok: false; error: string }>;

  logout: () => void;
  updateProfile: (
    updates: { name?: string; currentPassword?: string; newPassword?: string; forceChange?: boolean },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Password complexity rule shared by forced-change and normal profile flow.
 *  At least 4 chars, at least one uppercase letter, and at least one digit. */
export function validatePasswordComplexity(pwd: string): string | null {
  if (!pwd || pwd.length < 4) return "Password must be at least 4 characters.";
  if (!/[A-Z]/.test(pwd)) return "Password must include at least one uppercase letter.";
  if (!/[0-9]/.test(pwd)) return "Password must include at least one number.";
  return null;
}

const Ctx = createContext<AuthCtx | null>(null);

type AppUserRow = Database["public"]["Tables"]["app_users"]["Row"];

/** The DB-backed STUDENT profile/commercial fields, copied from the
 *  `app_users` row onto the built `User` so the freshly-logged-in student sees
 *  real data before any page-level `hydrateStudents()` runs. Uses the
 *  `?? undefined` pattern and then drops the undefined keys entirely so a
 *  `null` DB value never clobbers the canonical/mock value on spread. */
function buildStudentProfilePatch(row: AppUserRow): Partial<User> {
  const patch: Partial<User> = {
    current_level: row.current_level ?? undefined,
    attendance_percentage: row.attendance_percentage ?? undefined,
    company: row.company ?? undefined,
    member_since: row.member_since ?? undefined,
    hired_sessions: row.hired_sessions ?? undefined,
    remaining_sessions: row.remaining_sessions ?? undefined,
    product: row.product ?? undefined,
    focus: row.focus ?? undefined,
    access_plan: row.access_plan ?? undefined,
    contracted_levels: row.contracted_levels ?? undefined,
    current_roadmap_level: row.current_roadmap_level ?? undefined,
    reopened_levels: row.reopened_levels ?? undefined,
    sessions_per_week: row.sessions_per_week ?? undefined,
    session_duration: row.session_duration ?? undefined,
    reschedule_policy: row.reschedule_policy ?? undefined,
    reschedule_custom_hours: row.reschedule_custom_hours ?? undefined,
    reschedule_custom_pct: row.reschedule_custom_pct ?? undefined,
    payment_day: row.payment_day ?? undefined,
    cycle_start: row.cycle_start ?? undefined,
    next_payment: row.next_payment ?? undefined,
    video_call_link: row.video_call_link ?? undefined,
    status: row.status ?? undefined,
    insights_strikes: row.insights_strikes ?? undefined,
    bookclub_strikes: row.bookclub_strikes ?? undefined,
    sessions_auto: row.sessions_auto ?? undefined,
    admin_notes: row.admin_notes ?? undefined,
    freeze_start: row.freeze_start ?? undefined,
    freeze_end: row.freeze_end ?? undefined,
    product_type: row.product_type ?? undefined,
    addon_insights_per_month: row.addon_insights_per_month ?? undefined,
    addon_bookclubs_per_month: row.addon_bookclubs_per_month ?? undefined,
    addon_spotlight_per_month: row.addon_spotlight_per_month ?? undefined,
    addon_workshops_enabled: row.addon_workshops_enabled ?? undefined,
    // Legacy display-only alias of access_plan (no DB column of its own).
    hired_plan: row.access_plan ?? undefined,
  };
  for (const k of Object.keys(patch) as (keyof User)[]) {
    if (patch[k] === undefined) delete patch[k];
  }
  return patch;
}

/** The DB-backed TEACHER profile/commercial fields, copied from the
 *  `app_users` row onto the built `User` so the freshly-logged-in teacher sees
 *  real data before any page-level `hydrateTeachers()` runs. Uses the same
 *  `?? undefined` + drop-undefined-keys pattern as buildStudentProfilePatch,
 *  EXCEPT `availability_request`: `null` is a valid value there (no pending
 *  request), so that key is always kept. */
function buildTeacherProfilePatch(row: AppUserRow): Partial<User> {
  const patch: Partial<User> = {
    qualified_products: row.qualified_products ?? undefined,
    hourly_rate: row.hourly_rate ?? undefined,
    teacher_status: row.teacher_status ?? undefined,
    hire_date: row.hire_date ?? undefined,
    tier_frozen_since: row.tier_frozen_since ?? undefined,
    tier_frozen_days: row.tier_frozen_days ?? undefined,
    tier_reset_at: row.tier_reset_at ?? undefined,
    rating: row.rating ?? undefined,
    plan_punctuality: row.plan_punctuality ?? undefined,
    report_punctuality: row.report_punctuality ?? undefined,
    hours_month: row.hours_month ?? undefined,
    hours_cycle: row.hours_cycle ?? undefined,
    payment_frequency: row.payment_frequency ?? undefined,
    admin_notes: row.admin_notes ?? undefined,
  };
  for (const k of Object.keys(patch) as (keyof User)[]) {
    if (patch[k] === undefined) delete patch[k];
  }
  // Nested shape reconstructed from the two flat DB columns. `null` (no
  // pending request) is meaningful — always include the key.
  patch.availability_request =
    row.availability_request_note || row.availability_request_at
      ? { note: row.availability_request_note ?? "", requested_on: row.availability_request_at ?? "" }
      : null;
  return patch;
}

/** Builds the frontend `User` object from the real Supabase Auth session.
 *
 *  Every other store still lives in `localStorage`/`mock-data.ts` and is
 *  keyed by the OLD demo ids ("u1".."u8", not a real UUID) — see
 *  `app_users.legacy_id`, set for every demo account during the auth
 *  migration (2026-08-06). To avoid breaking every not-yet-migrated store at
 *  once, the `User.id` this app exposes stays the LEGACY id (matching what
 *  ASSIGNMENTS/SESSIONS/GROUPS/etc. already use), not the raw Supabase UUID.
 *  Once a given store is migrated to Supabase for real, it should look the
 *  user up by email or by a dedicated `auth_id` field rather than assuming
 *  `user.id` is a UUID. */
async function buildUser(authId: string, email: string): Promise<User | null> {
  const { data: row, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", authId)
    .maybeSingle();
  if (error || !row) {
    console.error("[auth] failed to load app_users profile for session", error);
    return null;
  }
  const typedRow = row as AppUserRow;
  const canonical = typedRow.legacy_id ? userById(typedRow.legacy_id) : undefined;
  const base: User = canonical ?? {
    id: typedRow.legacy_id ?? typedRow.id,
    name: typedRow.name,
    email: typedRow.email,
    password: "",
    role: typedRow.role,
  };
  return {
    ...base,
    id: typedRow.legacy_id ?? typedRow.id,
    name: typedRow.name,
    email: typedRow.email,
    role: typedRow.role,
    admin_type: typedRow.admin_type ?? undefined,
    must_change_password: typedRow.must_change_password,
    ...(typedRow.role === "student" ? buildStudentProfilePatch(typedRow) : {}),
    ...(typedRow.role === "teacher" ? buildTeacherProfilePatch(typedRow) : {}),
  };
}

// Last-known role of the logged-in user, cached outside React so plain
// lib/store modules (which can't call useAuth()) can still tailor a message
// to "is this an admin or not" — see notify.ts. Updated every time the
// AuthProvider below changes `user`, via the setUser wrapper just under it.
// Best-effort only: defaults to null (treated as a non-admin) before the
// session restores or after logout, which is the safe direction to fail in
// (never shows a stranger technical error detail).
let cachedRole: Role | null = null;
export function getCurrentRole(): Role | null {
  return cachedRole;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const setUser = (u: User | null) => {
    cachedRole = u?.role ?? null;
    setUserState(u);
  };
  const [ready, setReady] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The real Supabase Auth user id behind the currently logged-in session.
  // Kept separately from `user.id` (which stays the legacy demo id) so
  // profile writes (`updateProfile`) hit the right `app_users` row.
  const authIdRef = useRef<string | null>(null);
  useEffect(() => () => { if (logoutTimer.current) clearTimeout(logoutTimer.current); }, []);

  useEffect(() => {
    let cancelled = false;
    hydrateAdminRoles();

    const applySession = async (sessionUser: { id: string; email?: string | null } | null | undefined) => {
      if (!sessionUser) {
        authIdRef.current = null;
        if (!cancelled) setUser(null);
        return;
      }
      const built = await buildUser(sessionUser.id, sessionUser.email ?? "");
      if (cancelled) return;
      if (!built) {
        authIdRef.current = null;
        setUser(null);
        return;
      }
      if (
        (built.role === "student" && isMemberBlocked(built.id)) ||
        isUserDeactivated(built.id)
      ) {
        authIdRef.current = null;
        setUser(null);
        void supabase.auth.signOut();
        return;
      }
      authIdRef.current = sessionUser.id;
      setUser(built);
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session?.user ?? null);
      if (!cancelled) setReady(true);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        authIdRef.current = null;
        setUser(null);
      }
      // TOKEN_REFRESHED / USER_UPDATED don't require rebuilding the profile;
      // SIGNED_IN is handled directly by `login()` below.
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const login: AuthCtx["login"] = async (email, password, _remember, captchaToken) => {
    // NOTE: Supabase's client (src/integrations/supabase/client.ts) always
    // persists the session to localStorage with auto-refresh — the
    // "Remember me" checkbox no longer changes storage duration the way the
    // old mock system did (sessionStorage vs. a 30-day localStorage entry).
    // Every real login now behaves like "remembered". Flagged for Jaret;
    // revisit if a real distinction is needed later.
    hydrateAdminRoles();

    // Login lockout (2026-08-13 security batch): 3 consecutive failed
    // attempts blocks further sign-in for this email until an admin clears
    // it from the Students/Teachers panel. Checked BEFORE calling Supabase
    // Auth so a locked account never even gets a password check. Both RPCs
    // are `SECURITY DEFINER` and callable by the `anon` role on purpose —
    // there is no session yet at this point in the flow.
    const normalizedEmail = email.trim().toLowerCase();
    const { data: lockedData, error: lockedError } = await supabase.rpc("is_login_locked", {
      p_email: normalizedEmail,
    });
    if (lockedError) {
      console.error("[auth] is_login_locked check failed", lockedError);
    }
    if (lockedData === true) {
      return {
        ok: false,
        error: "This account is locked after too many failed attempts. Contact your administrator to unlock it.",
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error || !data.user) {
      const { data: attemptData, error: attemptError } = await supabase.rpc("record_failed_login", {
        p_email: normalizedEmail,
      });
      if (attemptError) {
        console.error("[auth] record_failed_login failed", attemptError);
      }
      const nowLocked =
        !!attemptData && typeof attemptData === "object" && (attemptData as { locked?: boolean }).locked === true;
      return {
        ok: false,
        error: nowLocked
          ? "This account is now locked after too many failed attempts. Contact your administrator to unlock it."
          : "Invalid credentials. Contact your administrator.",
      };
    }
    const built = await buildUser(data.user.id, data.user.email ?? email);
    if (!built) {
      await supabase.auth.signOut();
      return { ok: false, error: "Invalid credentials. Contact your administrator." };
    }
    // Group members in Pending Removal or Archived status lose platform access.
    if (built.role === "student" && isMemberBlocked(built.id)) {
      await supabase.auth.signOut();
      return { ok: false, error: "Access revoked. Contact your administrator." };
    }
    if (isUserDeactivated(built.id)) {
      await supabase.auth.signOut();
      return { ok: false, error: "Account deactivated. Contact your administrator." };
    }
    // Successful login — clear any failed-attempt counter for next time.
    const { error: resetError } = await supabase.rpc("record_successful_login", { p_email: normalizedEmail });
    if (resetError) {
      console.error("[auth] record_successful_login failed", resetError);
    }
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    setIsLoggingOut(false);
    authIdRef.current = data.user.id;
    setUser(built);
    return { ok: true, role: built.role, must_change_password: !!built.must_change_password };
  };

  /** Clears the session. Raises `isLoggingOut` synchronously (before `user`
   *  becomes null) so protected screens can skip the "session expired" state
   *  while the app navigates away; the flag lowers on the next tick pair, or
   *  immediately on a new login. */
  const logout = () => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    setIsLoggingOut(true);
    authIdRef.current = null;
    setUser(null);
    void supabase.auth.signOut();
    logoutTimer.current = setTimeout(() => setIsLoggingOut(false), 1200);
  };

  const updateProfile: AuthCtx["updateProfile"] = async (updates) => {
    if (!user || !authIdRef.current) return { ok: false, error: "No active session." };
    const authId = authIdRef.current;

    if (updates.newPassword) {
      if (!updates.forceChange) {
        if (!updates.currentPassword) {
          return { ok: false, error: "Current password is incorrect." };
        }
        // Re-verify the current password by attempting a fresh sign-in
        // before allowing the change (Supabase's updateUser doesn't ask for
        // the current password itself once a session is active).
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: updates.currentPassword,
        });
        if (reauthError) {
          return { ok: false, error: "Current password is incorrect." };
        }
      }
      const complexityError = validatePasswordComplexity(updates.newPassword);
      if (complexityError) {
        return { ok: false, error: complexityError };
      }
      const { error: pwError } = await supabase.auth.updateUser({ password: updates.newPassword });
      if (pwError) {
        return { ok: false, error: "Couldn't update the password. Try again." };
      }
    }

    const patch: { name?: string; must_change_password?: boolean } = {};
    if (updates.name) patch.name = updates.name.trim();
    if (updates.newPassword) patch.must_change_password = false;

    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase.from("app_users").update(patch).eq("id", authId);
      if (updateError) {
        return { ok: false, error: "Couldn't save the profile. Try again." };
      }
    }

    const next: User = {
      ...user,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.newPassword ? { must_change_password: false } : {}),
    };

    // Keep the in-memory mock DB in sync for any code still reading USERS
    // directly (e.g. admin lists of the demo roster).
    const idx = USERS.findIndex((u) => u.id === user.id);
    if (idx !== -1) USERS[idx] = { ...USERS[idx], ...next };

    setUser(next);
    return { ok: true };
  };

  return <Ctx.Provider value={{ user, ready, isLoggingOut, login, logout, updateProfile }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
