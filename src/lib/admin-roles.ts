// Admin role model. All these users keep role="admin" so RoleGuard and
// existing routing continue to work; the sub-type lives on `admin_type`.
//
// - "super_admin"       full access, including User Management (and later
//                       Activity Logs).
// - "coordinator_ops"   everything in the Admin nav EXCEPT Financial and
//                       User Management.
// - "coordinator_fin"   ONLY Financial (Money Lab) and KPIs.
//
// Internal admin accounts and access are read from app_users. New accounts
// are created through the existing admin-create-user Edge Function.
import { USERS, pruneHiddenMockUsers, type User, type Role } from "./mock-data";
import { patchTeacherProfile } from "./teacher-model";
import { patchStudentProfile } from "./students-store";
import { supabase } from "@/integrations/supabase/client";
import { invalidateUserIdBridge, legacyToUuid } from "./user-id-bridge";

export type AdminType = "super_admin" | "coordinator_ops" | "coordinator_fin";
export type CoordinatorType = "operations" | "financial";

export const USERS_EVENT = "verbo:users-updated";

let hydratePromise: Promise<void> | null = null;
export function hydrateAdminRoles(): Promise<void> {
  pruneHiddenMockUsers();
  if (typeof window === "undefined") return Promise.resolve();
  // Jaret confirmed these old browser records were not authoritative.
  // Remove the old account/password and deactivation caches on upgrade.
  try {
    localStorage.removeItem("verbo:created-users");
    localStorage.removeItem("verbo:user-status-overrides");
  } catch { /* Storage can be unavailable; the database stays authoritative. */ }
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase.from("app_users")
      .select("id,legacy_id,name,email,role,admin_type,admin_disabled")
      .eq("role", "admin");
    if (error) { console.error("[admin-roles] failed to load internal users", error); return; }
    const remote = (data ?? []).map((row): User => ({
      id: row.legacy_id || row.id, name: row.name, email: row.email,
      password: "", role: "admin", admin_type: row.admin_type ?? undefined,
      admin_disabled: row.admin_disabled,
    }));
    if (remote.length === 0) return;
    for (let i = USERS.length - 1; i >= 0; i--) if (USERS[i].role === "admin") USERS.splice(i, 1);
    USERS.push(...remote);
    emit();
  })().catch((error) => {
    console.error("[admin-roles] failed to hydrate internal users", error);
  }).finally(() => { hydratePromise = null; });
  return hydratePromise;
}

export function getAdminType(user: User | null | undefined): AdminType | null {
  if (!user || user.role !== "admin") return null;
  const t = user.admin_type as AdminType | undefined;
  // No silent elevation: a missing/unknown admin_type grants NO privileges.
  // The genuine "super_admin" assignment happens in hydrateAdminRoles().
  if (t === "super_admin" || t === "coordinator_ops" || t === "coordinator_fin") return t;
  return null;
}

// Path-prefix based permission check for Admin nav / route access.
export function canAccessAdminPath(type: AdminType, pathname: string): boolean {
  // 2026-08-19: Tablet quick-actions view — deliberately super_admin-only
  // for now (Jaret's own driving-companion use case), regardless of the
  // super_admin catch-all below. Not in NAV_GROUPS either, so this is the
  // only gate protecting a coordinator from a direct /admin/tablet URL.
  if (pathname.startsWith("/admin/tablet")) return type === "super_admin";
  if (type === "super_admin") return true;
  if (type === "coordinator_fin") {
    return pathname.startsWith("/admin/financial") || pathname.startsWith("/admin/kpis");
  }
  // coordinator_ops
  if (pathname.startsWith("/admin/financial")) return false;
  if (pathname.startsWith("/admin/users")) return false;
  if (pathname.startsWith("/admin/activity-logs")) return false;
  return true;
}

export function defaultAdminLanding(type: AdminType): string {
  if (type === "coordinator_fin") return "/admin/financial/money-lab";
  return "/admin";
}

export function coordinatorTypeOf(user: User): CoordinatorType | null {
  if (user.admin_type === "coordinator_ops") return "operations";
  if (user.admin_type === "coordinator_fin") return "financial";
  return null;
}

export function subscribeUsers(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(USERS_EVENT, cb);
  return () => window.removeEventListener(USERS_EVENT, cb);
}

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(USERS_EVENT));
}

export interface CreateInternalUserInput {
  name: string;
  email: string;
  password: string;
  role: Role;                 // "admin" | "teacher" | "student"
  admin_type?: AdminType;     // required when role === "admin"
}

/** Creates an internal admin/coordinator account. Requires a real Supabase
 *  Auth account + app_users row to exist before reporting success — unlike
 *  the student/teacher registration flows (which optimistically show success
 *  and create the real account in the background), an admin/coordinator
 *  account that's silently broken is a much worse failure mode (whoever it's
 *  for simply can't log in, and nobody would notice until they tried), so
 *  this awaits the real account creation and only writes to the local
 *  USERS/localStorage cache — used for this page's table — once it's
 *  confirmed to exist. Requires the password length the edge function itself
 *  enforces (>= 6 chars), not just the old >= 4 used for the local-only mock. */
export async function createInternalUser(
  input: CreateInternalUserInput,
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Name is required." };
  if (!email || !email.includes("@")) return { ok: false, error: "Valid email required." };
  if (!input.password || input.password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  if (USERS.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: "A user with that email already exists." };
  }
  if (input.role === "admin" && !input.admin_type) {
    return { ok: false, error: "Admin type is required." };
  }
  const id = `u${Date.now()}`;

  const { data, error } = await supabase.functions.invoke("admin-create-user", {
    body: {
      legacyId: id,
      email,
      password: input.password,
      name,
      role: input.role,
      ...(input.role === "admin" ? { adminType: input.admin_type } : {}),
    },
  });
  const invokeError = (data as { error?: string } | null)?.error;
  if (error || invokeError) {
    return { ok: false, error: invokeError || error?.message || "Failed to create the account — please try again." };
  }
  invalidateUserIdBridge();

  const user: User = {
    id, name, email, password: "", role: input.role,
    ...(input.role === "admin" ? { admin_type: input.admin_type } : {}),
  };
  USERS.push(user);
  emit();
  return { ok: true, user };
}

export async function updateInternalUser(
  userId: string,
  patch: { name?: string; admin_type?: AdminType },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const u = USERS.find((x) => x.id === userId);
  if (!u || u.role !== "admin") return { ok: false, error: "Internal user not found." };
  const uuid = await legacyToUuid(userId);
  if (!uuid) return { ok: false, error: "Account is unavailable in the database." };
  const name = patch.name?.trim();
  if (name !== undefined && !name) return { ok: false, error: "Name is required." };
  const { data, error } = await supabase.from("app_users")
    .update({ ...(name === undefined ? {} : { name }), ...(patch.admin_type ? { admin_type: patch.admin_type } : {}) })
    .eq("id", uuid).eq("role", "admin")
    .select("name,admin_type,admin_disabled").maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save the account." };
  u.name = data.name;
  u.admin_type = data.admin_type ?? undefined;
  u.admin_disabled = data.admin_disabled;
  emit();
  return { ok: true };
}

// A user is "deactivated" when:
// - teacher whose teacher_status === "frozen" (same freeze used by strikes & Teachers page)
// - student whose status === "suspended" (same suspend used by Students page)
// - internal admin flagged in the override map
export function isUserDeactivated(userId: string): boolean {
  const u = USERS.find((x) => x.id === userId);
  if (!u) return false;
  if (u.role === "teacher") return (u.teacher_status ?? "active") === "frozen";
  if (u.role === "student") return (u.status ?? "active") === "suspended";
  return u.admin_disabled === true;
}

export async function setUserDeactivated(userId: string, deactivated: boolean): Promise<boolean> {
  const u = USERS.find((x) => x.id === userId);
  if (!u) return false;

  if (u.role === "teacher") {
    // Reuse the Teachers freeze/reactivate flow — same DB-backed field,
    // persisted through the Supabase-backed teacher profile store (Lote 11).
    // IMPORTANT: this must go through patchTeacherProfile() and not a direct
    // localStorage override — a direct override is silently reverted the
    // next time hydrateTeachers() re-fetches from Supabase (its background
    // fetch applies the real, unchanged DB value on top of the override),
    // so a raw override looks like it worked for a moment and then quietly
    // undoes itself. This was a real bug found and fixed in Lote 14.
    patchTeacherProfile(userId, { teacher_status: deactivated ? "frozen" : "active" });
  } else if (u.role === "student") {
    // Reuse the Students suspend flow — same reasoning as above, via the
    // Supabase-backed student profile store (Lote 10).
    patchStudentProfile(userId, { status: deactivated ? "suspended" : "active" });
  } else {
    const uuid = await legacyToUuid(userId);
    if (!uuid) return false;
    const { data, error } = await supabase.from("app_users")
      .update({ admin_disabled: deactivated }).eq("id", uuid).eq("role", "admin")
      .select("admin_disabled").maybeSingle();
    if (error || !data) { console.error("[admin-roles] failed to change internal access", error); return false; }
    u.admin_disabled = data.admin_disabled;
  }
  emit();
  return true;
}
