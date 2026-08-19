// Admin role model. All these users keep role="admin" so RoleGuard and
// existing routing continue to work; the sub-type lives on `admin_type`.
//
// - "super_admin"       full access, including User Management (and later
//                       Activity Logs).
// - "coordinator_ops"   everything in the Admin nav EXCEPT Financial and
//                       User Management.
// - "coordinator_fin"   ONLY Financial (Money Lab) and KPIs.
//
// Newly-created accounts (from the User Management page) persist in
// localStorage and are merged into the USERS singleton on hydrate — this
// keeps the table's instant-feedback UI working the same as before. But
// createInternalUser() ALSO fires a real `admin-create-user` edge-function
// call in the background (same pattern as handleRegister() in
// admin.students.tsx), so the account actually gets a working Supabase Auth
// login + a real app_users row with the right role/admin_type, instead of
// being a localStorage-only fake that can never sign in. This was a
// confirmed bug found in the pre-launch QA audit — the old version pushed to
// USERS/localStorage and nothing else, so newly "created" admins/coordinators
// had no real account at all.
import { USERS, pruneHiddenMockUsers, type User, type Role } from "./mock-data";
import { patchTeacherProfile } from "./teacher-model";
import { patchStudentProfile } from "./students-store";
import { supabase } from "@/integrations/supabase/client";
import { invalidateUserIdBridge } from "./user-id-bridge";

export type AdminType = "super_admin" | "coordinator_ops" | "coordinator_fin";
export type CoordinatorType = "operations" | "financial";

const CREATED_KEY = "verbo:created-users";
const STATUS_KEY = "verbo:user-status-overrides";
export const USERS_EVENT = "verbo:users-updated";

export interface UserStatusOverride {
  status: "active" | "deactivated";
}

function readCreated(): User[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CREATED_KEY) || "[]"); } catch { return []; }
}
function writeCreated(list: User[]) {
  if (typeof window !== "undefined") localStorage.setItem(CREATED_KEY, JSON.stringify(list));
}
function readStatus(): Record<string, UserStatusOverride> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}"); } catch { return {}; }
}
function writeStatus(m: Record<string, UserStatusOverride>) {
  if (typeof window !== "undefined") localStorage.setItem(STATUS_KEY, JSON.stringify(m));
}

// Seed a couple of demo coordinators so the new nav filtering is visible.
const SEEDED: User[] = [
  { id: "u_ops", name: "Paulina Ortiz", email: "paulina@verbo.com", password: "ops123", role: "admin", admin_type: "coordinator_ops" },
  { id: "u_fin", name: "Ricardo Mena", email: "ricardo@verbo.com", password: "fin123", role: "admin", admin_type: "coordinator_fin" },
];

let hydrated = false;
export function hydrateAdminRoles() {
  pruneHiddenMockUsers();
  if (hydrated) return;
  hydrated = true;
  // Ensure u1 has super_admin type.
  const u1 = USERS.find((u) => u.id === "u1");
  if (u1 && !u1.admin_type) u1.admin_type = "super_admin";
  // Seeded coordinators.
  SEEDED.forEach((u) => { if (!USERS.find((x) => x.id === u.id)) USERS.push(u); });
  // Persisted created users.
  readCreated().forEach((u) => { if (!USERS.find((x) => x.id === u.id)) USERS.push(u); });
  // Legacy status-override key is only used for internal admins; teacher /
  // student deactivation piggybacks on their own status fields hydrated
  // elsewhere (hydrateStudents + teacher profile overrides).

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
    id, name, email, password: input.password, role: input.role,
    ...(input.role === "admin" ? { admin_type: input.admin_type } : {}),
  };
  USERS.push(user);
  const created = readCreated();
  created.push(user);
  writeCreated(created);
  emit();
  return { ok: true, user };
}

export function updateInternalUser(
  userId: string,
  patch: { name?: string; admin_type?: AdminType },
): { ok: true } | { ok: false; error: string } {
  const u = USERS.find((x) => x.id === userId);
  if (!u) return { ok: false, error: "User not found." };
  if (patch.name !== undefined) u.name = patch.name.trim();
  if (patch.admin_type && u.role === "admin") u.admin_type = patch.admin_type;
  // Persist for created users; seeded/mock users only mutate in-memory.
  const created = readCreated();
  const idx = created.findIndex((x) => x.id === userId);
  if (idx !== -1) { created[idx] = { ...created[idx], ...patch }; writeCreated(created); }
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
  const st = readStatus();
  return st[userId]?.status === "deactivated";
}

export function setUserDeactivated(userId: string, deactivated: boolean) {
  const u = USERS.find((x) => x.id === userId);
  if (!u) return;

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
    // Internal admin — no equivalent freeze page and no migrated DB field
    // for this concept; keep the local override map (internal/coordinator
    // accounts are not part of the Supabase migration).
    const st = readStatus();
    if (deactivated) st[userId] = { status: "deactivated" };
    else delete st[userId];
    writeStatus(st);
  }
  emit();
}
