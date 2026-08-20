// Groups store — group-level payment/progress record for Performance Sessions
// customers that share a single live class (e.g. a company buys 3 seats and
// three of its employees attend together). Individual student records still
// live in USERS (via students-store) — this store only owns the *shared*
// group fields plus the group ↔ member relationship.
//
// Persisted to localStorage and broadcast across tabs, mirroring the
// sessions-store / clubs-store convention. Swap for Lovable Cloud later.

import { USERS, type User } from "./mock-data";
import { removeAssignment, setAssignment } from "./assignments-store";
import { nextPaymentDateAfterToday, type ProductId, type AccessPlanId } from "./student-model";
import { logPayment, expectedAmountForGroup, type PaymentDetailFields } from "./payments-log";
import { patchStudentProfile, type StudentProfileFields } from "./students-store";

export type GroupMemberStatus = "active" | "pending_removal" | "archived";

export interface GroupMember {
  student_id: string;
  group_id: string;
  status: GroupMemberStatus;
  joined_at: string;
  removal_started_at?: string; // ISO — set when moved to pending_removal
  archived_at?: string;        // ISO — set when moved to archived
  prior_group_id?: string;     // last group they belonged to (for recycle bin history)
}

export interface Group {
  id: string;
  name: string;                 // manually typed by admin, e.g. "Acme Corp – Core Group A"
  company_client: string;       // used to gate Move to Group targets
  max_capacity: number;         // default 4
  // Shared program fields (mirror the Individual Register form)
  product_type: "performance";  // groups are Performance-only
  product?: ProductId;
  focus?: string;
  access_plan?: AccessPlanId;
  contracted_levels?: string[];
  current_roadmap_level?: string;
  hired_sessions: number;
  remaining_sessions: number;
  sessions_per_week?: number;
  session_duration?: number;
  reschedule_policy?: string;
  reschedule_custom_hours?: number;
  reschedule_custom_pct?: number;
  payment_day?: number;
  cycle_start?: string;
  next_payment?: string;
  video_call_link?: string;
  teacher_id?: string;
  addon_insights_per_month?: number;
  addon_bookclubs_per_month?: number;
  addon_spotlight_per_month?: number;
  addon_workshops_enabled?: boolean;
  created_at: string;
}

export const GROUPS_KEY = "verbo:groups";
export const GROUP_MEMBERS_KEY = "verbo:group-members";
export const GROUPS_EVENT = "verbo:groups-updated";

// 30-day grace period before auto-archive (see remove flow).
export const GRACE_DAYS = 30;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}
function broadcast() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GROUPS_EVENT));
}

export function loadGroups(): Group[] {
  return readJson<Group[]>(GROUPS_KEY, []);
}
export function loadGroupMembers(): GroupMember[] {
  // Side effect: expire any pending_removal past the grace window.
  const members = readJson<GroupMember[]>(GROUP_MEMBERS_KEY, []);
  const now = Date.now();
  let mutated = false;
  const next = members.map((m) => {
    if (m.status === "pending_removal" && m.removal_started_at) {
      const days = Math.floor((now - +new Date(m.removal_started_at)) / (86400_000));
      if (days >= GRACE_DAYS) {
        mutated = true;
        return { ...m, status: "archived" as GroupMemberStatus, archived_at: new Date().toISOString() };
      }
    }
    return m;
  });
  if (mutated) writeJson(GROUP_MEMBERS_KEY, next);
  return next;
}

function persistGroups(list: Group[]) { writeJson(GROUPS_KEY, list); broadcast(); }
function persistMembers(list: GroupMember[]) { writeJson(GROUP_MEMBERS_KEY, list); broadcast(); }

export function subscribeGroups(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === GROUPS_KEY || e.key === GROUP_MEMBERS_KEY) cb();
  };
  window.addEventListener(GROUPS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(GROUPS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
export function groupById(id: string): Group | undefined {
  return loadGroups().find((g) => g.id === id);
}
export function membersOf(groupId: string): GroupMember[] {
  return loadGroupMembers().filter((m) => m.group_id === groupId);
}
export function activeMembersOf(groupId: string): GroupMember[] {
  return membersOf(groupId).filter((m) => m.status === "active");
}
export function groupOfStudent(studentId: string): { group: Group; member: GroupMember } | null {
  const m = loadGroupMembers().find(
    (m) => m.student_id === studentId && m.status !== "archived",
  );
  if (!m) return null;
  const g = groupById(m.group_id);
  return g ? { group: g, member: m } : null;
}
/** How many days remain in the grace window (0 when expired). */
export function pendingCountdownDays(m: GroupMember): number {
  if (m.status !== "pending_removal" || !m.removal_started_at) return 0;
  const elapsed = Math.floor((Date.now() - +new Date(m.removal_started_at)) / 86400_000);
  return Math.max(0, GRACE_DAYS - elapsed);
}
export function isMemberBlocked(studentId: string): boolean {
  const info = groupOfStudent(studentId);
  if (info && info.member.status !== "active") return true;
  // Also block if archived-only
  const any = loadGroupMembers().find((m) => m.student_id === studentId);
  if (any && any.status === "archived") return true;
  return false;
}

/** Resolve the effective hired / remaining session counts for a student.
 *  Group members inherit both numbers from their Group (single contract
 *  shared across all members); individual students keep their user values. */
export function effectiveSessionCounts(
  studentId: string,
  fallback: { hired?: number; remaining?: number },
): { hired: number; remaining: number; source: "group" | "individual" } {
  const info = groupOfStudent(studentId);
  if (info) {
    return {
      hired: info.group.hired_sessions ?? 0,
      remaining: info.group.remaining_sessions ?? 0,
      source: "group",
    };
  }
  return {
    hired: fallback.hired ?? 0,
    remaining: fallback.remaining ?? 0,
    source: "individual",
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function createGroup(input: Omit<Group, "id" | "created_at">): Group {
  const g: Group = {
    ...input,
    id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
  };
  persistGroups([...loadGroups(), g]);
  return g;
}

export function updateGroup(id: string, patch: Partial<Group>) {
  const before = groupById(id);
  persistGroups(loadGroups().map((g) => (g.id === id ? { ...g, ...patch } : g)));
  if (!before) return;
  const after = groupById(id);
  if (!after) return;
  propagateGroupToMembers(before, after);
}

/** Sync shared Group fields onto every non-archived member's User record so
 *  admin/teacher/student surfaces stay in sync when the group is edited. */
function propagateGroupToMembers(before: Group, after: Group) {
  const memberFieldMap: Array<[keyof Group, keyof User | Array<keyof User>]> = [
    ["product", "product"],
    ["focus", "focus"],
    ["access_plan", ["access_plan", "hired_plan"]],
    ["contracted_levels", "contracted_levels"],
    ["current_roadmap_level", "current_roadmap_level"],
    ["company_client", "company"],
    ["video_call_link", "video_call_link"],
    ["addon_insights_per_month", "addon_insights_per_month"],
    ["addon_bookclubs_per_month", "addon_bookclubs_per_month"],
    ["addon_spotlight_per_month", "addon_spotlight_per_month"],
    ["addon_workshops_enabled", "addon_workshops_enabled"],
  ];
  // Which fields actually changed?
  const changed: Array<[keyof Group, keyof User | Array<keyof User>]> = memberFieldMap.filter(
    ([gk]) => JSON.stringify(before[gk]) !== JSON.stringify(after[gk]),
  );
  const teacherChanged = before.teacher_id !== after.teacher_id;
  if (changed.length === 0 && !teacherChanged) return;

  const memberIds = loadGroupMembers()
    .filter((m) => m.group_id === after.id && m.status !== "archived")
    .map((m) => m.student_id);
  if (memberIds.length === 0) return;

  for (const sid of memberIds) {
    const patch: Partial<User> = {};
    for (const [gk, uk] of changed) {
      const value = after[gk] as unknown;
      const keys = Array.isArray(uk) ? uk : [uk];
      for (const k of keys) {
        (patch as unknown as Record<string, unknown>)[k as string] = value;
      }
    }
    if (Object.keys(patch).length > 0) {
      // patchStudentProfile handles the USERS mutation, the Supabase write
      // (or localStorage fallback for local-only members), and the
      // STUDENTS_EVENT ("verbo:students-updated") dispatch.
      patchStudentProfile(sid, patch as Partial<StudentProfileFields>);
    }

    if (teacherChanged) {
      if (after.teacher_id) setAssignment(sid, after.teacher_id);
      else removeAssignment(sid);
    }
  }
}

export function markGroupAsPaid(id: string, detail?: PaymentDetailFields) {
  const g = groupById(id); if (!g) return;
  // Log the payment event so The Money Lab (Admin > Financial) can show
  // historical Received Income. This is a shortcut into the same state.
  logPayment({
    entity_type: "group",
    entity_id: g.id,
    name: g.name,
    company: g.company_client,
    amount: expectedAmountForGroup(g),
    paid_at: new Date().toISOString(),
    ...detail,
  });
  // Advance to the next real occurrence of the payment day (same calculation
  // used by the individual student flow) so the indicator clears immediately.
  const day = g.payment_day ?? (g.next_payment ? new Date(g.next_payment).getDate() : new Date().getDate());
  updateGroup(id, { next_payment: nextPaymentDateAfterToday(day).toISOString() });
}

export function addMember(groupId: string, member: {
  student_id: string; joined_at?: string;
}): GroupMember | null {
  const g = groupById(groupId); if (!g) return null;
  if (activeMembersOf(groupId).length >= g.max_capacity) return null;
  // If this student is already an active member somewhere, don't duplicate.
  const existing = groupOfStudent(member.student_id);
  if (existing && existing.member.status === "active") return null;
  const m: GroupMember = {
    student_id: member.student_id,
    group_id: groupId,
    status: "active",
    joined_at: member.joined_at ?? new Date().toISOString(),
  };
  // Any existing pending_removal / archived record is superseded by the new
  // active membership.
  const next = loadGroupMembers().filter((x) => x.student_id !== member.student_id);
  persistMembers([...next, m]);
  // Ensure the assignments store reflects the group's teacher.
  if (g.teacher_id) setAssignment(member.student_id, g.teacher_id);
  return m;
}

/** Remove flow — enters 30-day grace period, capacity freed immediately. */
export function removeMember(studentId: string) {
  const next = loadGroupMembers().map((m) =>
    m.student_id === studentId && m.status === "active"
      ? { ...m, status: "pending_removal" as GroupMemberStatus, removal_started_at: new Date().toISOString() }
      : m,
  );
  persistMembers(next);
}

export function restoreMember(studentId: string): { ok: boolean; reason?: string } {
  const member = loadGroupMembers().find((m) => m.student_id === studentId);
  if (!member) return { ok: false, reason: "Member not found" };
  const g = groupById(member.group_id);
  if (!g) return { ok: false, reason: "Group not found" };
  if (activeMembersOf(g.id).length >= g.max_capacity) {
    return { ok: false, reason: "No spots left in this group" };
  }
  const next = loadGroupMembers().map((m) =>
    m.student_id === studentId
      ? { ...m, status: "active" as GroupMemberStatus, removal_started_at: undefined, archived_at: undefined }
      : m,
  );
  persistMembers(next);
  return { ok: true };
}

export function archiveMember(studentId: string) {
  const next = loadGroupMembers().map((m) =>
    m.student_id === studentId
      ? { ...m, status: "archived" as GroupMemberStatus, archived_at: new Date().toISOString() }
      : m,
  );
  persistMembers(next);
}

export function moveMember(studentId: string, targetGroupId: string): { ok: boolean; reason?: string } {
  const member = loadGroupMembers().find((m) => m.student_id === studentId);
  if (!member) return { ok: false, reason: "Member not found" };
  const target = groupById(targetGroupId);
  if (!target) return { ok: false, reason: "Target group not found" };
  const current = groupById(member.group_id);
  if (current && current.company_client !== target.company_client) {
    return { ok: false, reason: "Groups must belong to the same Company / Client" };
  }
  if (activeMembersOf(target.id).length >= target.max_capacity) {
    return { ok: false, reason: "No spots left in this group" };
  }
  const next = loadGroupMembers().map((m) =>
    m.student_id === studentId
      ? {
          ...m,
          group_id: targetGroupId,
          prior_group_id: current?.id,
          status: "active" as GroupMemberStatus,
          removal_started_at: undefined,
          archived_at: undefined,
          joined_at: new Date().toISOString(),
        }
      : m,
  );
  persistMembers(next);
  // Reassign teacher to target group's teacher.
  if (target.teacher_id) setAssignment(studentId, target.teacher_id);
  return { ok: true };
}

/** Decrement the group's Remaining Sessions counter by one. Group progress
 *  advances once per session regardless of member count. */
export function decrementGroupRemaining(groupId: string) {
  const g = groupById(groupId); if (!g) return;
  updateGroup(groupId, {
    remaining_sessions: Math.max(0, (g.remaining_sessions ?? 0) - 1),
  });
}

/** Symmetric refund helper — bump the shared counter back up by one, capped
 *  at the group's Hired Sessions so a refund can never exceed the contract. */
export function incrementGroupRemaining(groupId: string) {
  const g = groupById(groupId); if (!g) return;
  const hired = g.hired_sessions ?? 0;
  updateGroup(groupId, {
    remaining_sessions: Math.min(hired, (g.remaining_sessions ?? 0) + 1),
  });
}

/** Shared "% of the contracted sessions used" helper — single source of
 *  truth for the progress-bar math previously duplicated across Admin and
 *  Teacher student cards + Group Detail modal. */
export function sessionProgressFor(hired: number, remaining: number): { done: number; pct: number } {
  const done = Math.max(0, hired - remaining);
  const pct = hired > 0 ? (done / hired) * 100 : 0;
  return { done, pct };
}

/** Read the group each student belongs to as a lookup map (studentId → group). */
export function groupsByStudentId(): Map<string, Group> {
  const groups = loadGroups();
  const members = loadGroupMembers();
  const gMap = new Map(groups.map((g) => [g.id, g]));
  const out = new Map<string, Group>();
  for (const m of members) {
    if (m.status === "archived") continue;
    const g = gMap.get(m.group_id);
    if (g) out.set(m.student_id, g);
  }
  return out;
}

/** Register a brand-new group + create its member User records. */
export function registerGroupWithMembers(
  groupData: Omit<Group, "id" | "created_at">,
  members: Array<{ name: string; email: string; password: string; member_since?: string }>,
): { group: Group; users: User[] } {
  const group = createGroup(groupData);
  const users: User[] = [];
  for (const m of members) {
    const id = `u${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const u: User = {
      id,
      name: m.name.trim(),
      email: m.email.trim(),
      password: m.password,
      role: "student",
      product_type: "performance",
      product: group.product,
      focus: group.focus,
      access_plan: group.access_plan,
      hired_plan: group.access_plan,
      contracted_levels: group.contracted_levels ?? [],
      current_roadmap_level: group.current_roadmap_level,
      company: group.company_client,
      member_since: m.member_since,
      status: "active",
      insights_strikes: 0,
      bookclub_strikes: 0,
      video_call_link: group.video_call_link,
      addon_insights_per_month: group.addon_insights_per_month ?? 0,
      addon_bookclubs_per_month: group.addon_bookclubs_per_month ?? 0,
      addon_spotlight_per_month: group.addon_spotlight_per_month ?? 0,
      addon_workshops_enabled: group.addon_workshops_enabled ?? false,
    };
    USERS.push(u);
    users.push(u);
    addMember(group.id, { student_id: id });
  }
  // Persist newly-created users so a reload keeps them.
  try {
    if (typeof window !== "undefined") {
      const KEY = "verbo:registered-students";
      const prev = JSON.parse(localStorage.getItem(KEY) || "[]");
      localStorage.setItem(KEY, JSON.stringify([...prev, ...users]));
    }
  } catch { /* noop */ }
  return { group, users };
}
