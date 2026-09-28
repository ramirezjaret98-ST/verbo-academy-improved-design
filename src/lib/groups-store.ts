// Groups store — group-level payment/progress record for Performance Sessions
// customers that share a single live class (e.g. a company buys 3 seats and
// three of its employees attend together). Individual student records still
// live in USERS (via students-store) — this store only owns the *shared*
// group fields plus the group ↔ member relationship.
//
// Supabase is authoritative. The in-memory cache keeps the existing
// synchronous selectors available to the rest of Academy.

import { nextPaymentDateAfterToday, type ProductId, type AccessPlanId } from "./student-model";
import { logPayment, expectedAmountForGroup, type PaymentDetailFields } from "./payments-log";
import { hydrateStudents } from "./students-store";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync, invalidateUserIdBridge } from "./user-id-bridge";
import { notifyError } from "./notify";
import { withTimeout } from "./net-utils";

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

export const GROUPS_EVENT = "verbo:groups-updated";

// 30-day grace period before auto-archive (see remove flow).
export const GRACE_DAYS = 30;

type GroupRow = Database["public"]["Tables"]["groups"]["Row"];
type MemberRow = Database["public"]["Tables"]["group_members"]["Row"];
let groupsCache: Group[] = [];
let membersCache: GroupMember[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function broadcast() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GROUPS_EVENT));
}

function mapGroup(row: Partial<GroupRow> & { id: number; name: string; max_capacity: number }): Group {
  return {
    id: String(row.id), name: row.name, company_client: row.company_client ?? "",
    max_capacity: row.max_capacity, product_type: "performance",
    product: row.product ?? undefined, focus: row.focus ?? undefined,
    access_plan: row.access_plan ?? undefined,
    contracted_levels: row.contracted_levels ?? undefined,
    current_roadmap_level: row.current_roadmap_level ?? undefined,
    hired_sessions: row.hired_sessions ?? 0, remaining_sessions: row.remaining_sessions ?? 0,
    sessions_per_week: row.sessions_per_week ?? undefined,
    session_duration: row.session_duration ?? undefined,
    reschedule_policy: row.reschedule_policy ?? undefined,
    reschedule_custom_hours: row.reschedule_custom_hours ?? undefined,
    reschedule_custom_pct: row.reschedule_custom_pct ?? undefined,
    payment_day: row.payment_day ?? undefined, cycle_start: row.cycle_start ?? undefined,
    next_payment: row.next_payment ?? undefined, video_call_link: row.video_call_link ?? undefined,
    teacher_id: row.teacher_id ? uuidToLegacySync(row.teacher_id) : undefined,
    addon_insights_per_month: row.addon_insights_per_month ?? undefined,
    addon_bookclubs_per_month: row.addon_bookclubs_per_month ?? undefined,
    addon_spotlight_per_month: row.addon_spotlight_per_month ?? undefined,
    addon_workshops_enabled: row.addon_workshops_enabled ?? undefined,
    created_at: row.created_at ?? "",
  };
}

function mapMember(row: MemberRow): GroupMember {
  const expired = row.status === "pending_removal" && row.removal_started_at &&
    Date.now() - new Date(row.removal_started_at).getTime() >= GRACE_DAYS * 86400_000;
  return {
    student_id: uuidToLegacySync(row.student_id), group_id: String(row.group_id),
    status: expired ? "archived" : row.status, joined_at: row.joined_at,
    removal_started_at: row.removal_started_at ?? undefined,
    archived_at: row.archived_at ?? (expired ? new Date(new Date(row.removal_started_at!).getTime() + GRACE_DAYS * 86400_000).toISOString() : undefined),
    prior_group_id: row.prior_group_id == null ? undefined : String(row.prior_group_id),
  };
}

export async function hydrateGroups(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  if (hydrated && !force) return;
  if (hydratePromise) return hydratePromise;
  const startedGeneration = generation;
  const pending = (async () => {
    await hydrateUserIdBridge();
    const [adminGroups, visibleGroups, members] = await withTimeout(Promise.all([
      supabase.from("groups").select("*"),
      supabase.rpc("group_profile_for_teacher"),
      supabase.from("group_members").select("*"),
    ]), 15000, "groups lookup");
    if (adminGroups.error || visibleGroups.error || members.error) {
      throw adminGroups.error ?? visibleGroups.error ?? members.error;
    }
    if (startedGeneration !== generation) return;
    const byId = new Map<number, Group>();
    for (const row of visibleGroups.data ?? []) byId.set(row.id, mapGroup(row));
    for (const row of adminGroups.data ?? []) byId.set(row.id, mapGroup(row));
    groupsCache = [...byId.values()];
    membersCache = (members.data ?? []).map(mapMember);
    hydrated = true;
    broadcast();
  })();
  hydratePromise = pending;
  try { await pending; }
  finally { if (hydratePromise === pending) hydratePromise = null; }
}

export function loadGroups(): Group[] { return groupsCache; }
export function loadGroupMembers(): GroupMember[] { return membersCache; }

if (typeof window !== "undefined") {
  const reload = (reason?: "auth" | "refresh") => {
    if (reason === "auth") {
      generation += 1;
      groupsCache = []; membersCache = []; broadcast();
    }
    hydrated = false;
    const waiting = hydratePromise;
    void (waiting ? waiting.catch(() => {}).then(() => hydrateGroups(true)) : hydrateGroups(true))
      .catch((error) => console.error("[groups-store] refresh failed", error));
  };
  supabase.channel("academy-groups-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => reload("refresh"))
    .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => reload("refresh"))
    .subscribe();
  registerRehydrate(reload);
  void hydrateGroups().catch((error) => console.error("[groups-store] initial load failed", error));
}

export function subscribeGroups(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
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
export async function updateGroup(id: string, patch: Partial<Group>): Promise<void> {
  const before = groupById(id);
  if (!before || !/^\d+$/.test(id)) throw new Error("Group not found");
    const dbPatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === "id" || key === "created_at") continue;
      dbPatch[key] = value ?? null;
    }
    if ("teacher_id" in patch) {
      const teacherUuid = patch.teacher_id ? await legacyToUuid(patch.teacher_id) : null;
      if (patch.teacher_id && !teacherUuid) throw new Error("No se pudo identificar al maestro");
      dbPatch.teacher_id = teacherUuid;
    }
    const { error } = await supabase.from("groups").update(dbPatch as Database["public"]["Tables"]["groups"]["Update"]).eq("id", Number(id));
    if (error) throw error;
    await hydrateGroups(true);
    hydrateStudents();
}

/** The login gate must read the database, not a possibly cold browser cache. */
export async function isMemberBlockedInDatabase(studentUuid: string): Promise<boolean> {
  const { data, error } = await supabase.from("group_members")
    .select("status").eq("student_id", studentUuid).maybeSingle();
  if (error) throw error;
  return !!data && data.status !== "active";
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
  void updateGroup(id, { next_payment: nextPaymentDateAfterToday(day).toISOString().slice(0, 10) })
    .catch((error) => notifyError(error, { context: "Updating group payment" }));
}

export async function addMember(groupId: string, member: {
  student_id: string; joined_at?: string;
}): Promise<GroupMember | null> {
  const g = groupById(groupId); if (!g) return null;
  if (activeMembersOf(groupId).length >= g.max_capacity) return null;
  if (loadGroupMembers().some((m) => m.student_id === member.student_id)) return null;
  const studentUuid = await legacyToUuid(member.student_id);
  if (!studentUuid) throw new Error("El alumno debe tener una cuenta real de Academy");
  const { error } = await supabase.from("group_members").insert({
    student_id: studentUuid, group_id: Number(groupId),
    joined_at: member.joined_at ?? new Date().toISOString(),
  });
  if (error) throw error;
  await hydrateGroups(true);
  hydrateStudents();
  return loadGroupMembers().find((m) => m.student_id === member.student_id) ?? null;
}

/** Remove flow — enters 30-day grace period, capacity freed immediately. */
export async function removeMember(studentId: string): Promise<void> {
  const uuid = await legacyToUuid(studentId);
  if (!uuid) throw new Error("No se pudo identificar al alumno");
  const { error } = await supabase.from("group_members").update({
    status: "pending_removal", removal_started_at: new Date().toISOString(), archived_at: null,
  }).eq("student_id", uuid).eq("status", "active");
  if (error) throw error;
  await hydrateGroups(true);
}

export async function restoreMember(studentId: string): Promise<{ ok: boolean; reason?: string }> {
  const member = loadGroupMembers().find((m) => m.student_id === studentId);
  if (!member) return { ok: false, reason: "Member not found" };
  const g = groupById(member.group_id);
  if (!g) return { ok: false, reason: "Group not found" };
  if (activeMembersOf(g.id).length >= g.max_capacity) {
    return { ok: false, reason: "No spots left in this group" };
  }
  const uuid = await legacyToUuid(studentId);
  if (!uuid) return { ok: false, reason: "Student account not found" };
  const { error } = await supabase.from("group_members").update({
    status: "active", removal_started_at: null, archived_at: null,
  }).eq("student_id", uuid);
  if (error) return { ok: false, reason: error.message };
  await hydrateGroups(true);
  return { ok: true };
}

export async function archiveMember(studentId: string): Promise<void> {
  const uuid = await legacyToUuid(studentId);
  if (!uuid) throw new Error("No se pudo identificar al alumno");
  const { error } = await supabase.from("group_members").update({
    status: "archived", archived_at: new Date().toISOString(),
  }).eq("student_id", uuid);
  if (error) throw error;
  await hydrateGroups(true);
}

export async function moveMember(studentId: string, targetGroupId: string): Promise<{ ok: boolean; reason?: string }> {
  const member = loadGroupMembers().find((m) => m.student_id === studentId);
  if (!member) return { ok: false, reason: "Member not found" };
  const target = groupById(targetGroupId);
  if (!target) return { ok: false, reason: "Target group not found" };
  const current = groupById(member.group_id);
  if (current && member.status !== "archived" && current.company_client !== target.company_client) {
    return { ok: false, reason: "Groups must belong to the same Company / Client" };
  }
  if (activeMembersOf(target.id).length >= target.max_capacity) {
    return { ok: false, reason: "No spots left in this group" };
  }
  const uuid = await legacyToUuid(studentId);
  if (!uuid) return { ok: false, reason: "Student account not found" };
  const { error } = await supabase.from("group_members").update({
    group_id: Number(targetGroupId), prior_group_id: current ? Number(current.id) : null,
    status: "active", removal_started_at: null, archived_at: null,
    joined_at: new Date().toISOString(),
  }).eq("student_id", uuid);
  if (error) return { ok: false, reason: error.message };
  await hydrateGroups(true);
  hydrateStudents();
  return { ok: true };
}

/** Decrement the group's Remaining Sessions counter by one. Group progress
 *  advances once per session regardless of member count. */
export function decrementGroupRemaining(groupId: string) {
  void adjustRemaining(groupId, -1);
}

/** Symmetric refund helper — bump the shared counter back up by one, capped
 *  at the group's Hired Sessions so a refund can never exceed the contract. */
export function incrementGroupRemaining(groupId: string) {
  void adjustRemaining(groupId, 1);
}

async function adjustRemaining(groupId: string, delta: -1 | 1): Promise<void> {
  const { error } = await supabase.rpc("adjust_group_remaining_sessions", {
    p_group_id: Number(groupId), p_delta: delta,
  });
  if (error) { notifyError(error, { context: "Updating group sessions" }); return; }
  await hydrateGroups(true);
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
export async function registerGroupWithMembers(
  groupData: Omit<Group, "id" | "created_at">,
  members: Array<{ name: string; email: string; password: string; member_since?: string }>,
): Promise<Group> {
  const teacherUuid = groupData.teacher_id ? await legacyToUuid(groupData.teacher_id) : null;
  if (groupData.teacher_id && !teacherUuid) throw new Error("No se pudo identificar al maestro");
  const { data, error } = await supabase.functions.invoke("admin-create-group", {
    body: { group: { ...groupData, teacher_id: teacherUuid }, members },
  });
  const failure = (data as { error?: string } | null)?.error;
  if (error || failure) throw new Error(failure ?? error?.message ?? "No se pudo registrar el grupo");
  invalidateUserIdBridge();
  await hydrateUserIdBridge();
  await hydrateGroups(true);
  const group = groupById(String((data as { groupId: number }).groupId));
  if (!group) throw new Error("El grupo se creó, pero no pudo cargarse. Actualiza la página.");
  return group;
}
