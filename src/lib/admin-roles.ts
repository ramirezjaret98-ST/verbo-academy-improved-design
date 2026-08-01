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
// localStorage and are merged into the USERS singleton on hydrate.
import { USERS, type User, type Role } from "./mock-data";

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

export function createInternalUser(
  input: CreateInternalUserInput,
): { ok: true; user: User } | { ok: false; error: string } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Name is required." };
  if (!email || !email.includes("@")) return { ok: false, error: "Valid email required." };
  if (!input.password || input.password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
  if (USERS.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: "A user with that email already exists." };
  }
  if (input.role === "admin" && !input.admin_type) {
    return { ok: false, error: "Admin type is required." };
  }
  const id = `u_${Math.random().toString(36).slice(2, 9)}`;
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

const T_OVERRIDES_KEY = "verbo:teacher-profile-overrides";
const S_OVERRIDES_KEY = "verbo:student-profile-overrides";

function writeProfileOverride(key: string, id: string, patch: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    map[id] = { ...(map[id] || {}), ...patch };
    localStorage.setItem(key, JSON.stringify(map));
  } catch { /* noop */ }
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
    // Reuse the Teachers freeze/reactivate flow — same field, same override key.
    const next = deactivated ? "frozen" : "active";
    u.teacher_status = next;
    writeProfileOverride(T_OVERRIDES_KEY, userId, { teacher_status: next });
  } else if (u.role === "student") {
    // Reuse the Students suspend flow.
    const next = deactivated ? "suspended" : "active";
    u.status = next;
    writeProfileOverride(S_OVERRIDES_KEY, userId, { status: next });
  } else {
    // Internal admin — no equivalent freeze page, use the local override map.
    const st = readStatus();
    if (deactivated) st[userId] = { status: "deactivated" };
    else delete st[userId];
    writeStatus(st);
  }
  emit();
}
