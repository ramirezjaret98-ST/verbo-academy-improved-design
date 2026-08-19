// Permanently deletes a teacher/student/internal-admin account — the
// counterpart to admin-create-user (Lote 12). Until this existed, the Admin
// panel could only "Suspend"/"Freeze"/"Remove access" an account, which just
// flips a status field and never actually removes it from any list. That
// left no way to clean up local-only "ghost" registrations (a registration
// attempt that failed on the Supabase side — e.g. duplicate email, or the
// pre-2026-08-08 CORS bug — still optimistically pushed a fake entry into
// USERS + localStorage, so a few retries in the same browser leave several
// look-alike entries with no real account behind most of them) or a real
// account created by mistake.
import { USERS, hideMockUser, type User } from "./mock-data";
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid, invalidateUserIdBridge } from "./user-id-bridge";
import { STUDENTS_EVENT } from "./students-store";
import { TEACHERS_EVENT } from "./teacher-model";
import { USERS_EVENT } from "./admin-roles";

const REGISTERED_STUDENTS_KEY = "verbo:registered-students";
const REGISTERED_TEACHERS_KEY = "verbo:registered-teachers";
const STUDENT_PROFILE_KEY = "verbo:student-profile-overrides";
const TEACHER_PROFILE_KEY = "verbo:teacher-profile-overrides";
const CREATED_USERS_KEY = "verbo:created-users";
const USER_STATUS_KEY = "verbo:user-status-overrides";

function removeFromListKey(key: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    const list: User[] = JSON.parse(localStorage.getItem(key) || "[]");
    const next = list.filter((u) => u.id !== id);
    if (next.length !== list.length) localStorage.setItem(key, JSON.stringify(next));
  } catch { /* corrupt/absent value — nothing to clean up */ }
}

function removeFromMapKey(key: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    const map: Record<string, unknown> = JSON.parse(localStorage.getItem(key) || "{}");
    if (id in map) {
      delete map[id];
      localStorage.setItem(key, JSON.stringify(map));
    }
  } catch { /* corrupt/absent value — nothing to clean up */ }
}

export interface DeleteUserResult {
  ok: boolean;
  /** User-facing explanation when ok === false — e.g. the account has real
   *  session/payment history the database refuses to silently discard. */
  error?: string;
}

/** Permanently deletes a teacher/student/internal-admin. If the account has
 *  a real Supabase Auth login, this calls the `admin-delete-user` Edge
 *  Function (service_role) to delete it — deleting the `auth.users` row
 *  cascades into `app_users` and every table that references it (sessions,
 *  assignments, payments, reports, etc. all have `ON DELETE CASCADE` back to
 *  `app_users`), so no manual per-table cleanup is needed. A handful of
 *  tables intentionally do NOT cascade (e.g. `sessions.teacher_id` is
 *  `ON DELETE RESTRICT`) so that a teacher/student with real class history
 *  can't be silently erased — deleting one of those returns `ok: false`
 *  with the database's error message instead, and none of the local
 *  bookkeeping below is touched, so the account stays fully visible/usable
 *  (e.g. via Suspend) rather than half-disappearing.
 *
 *  Local-only "ghost" entries (a registration attempt that never got a real
 *  account — no `legacy_id` match in `app_users`) skip the Edge Function
 *  entirely and are just scrubbed from the local caches below. */
export async function deleteUserAccount(user: User): Promise<DeleteUserResult> {
  const uuid = await legacyToUuid(user.id);
  if (uuid) {
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { uuid, confirm: true },
    });
    const invokeError = (data as { error?: string } | null)?.error;
    if (error || invokeError) {
      return { ok: false, error: invokeError || error?.message || "No se pudo eliminar la cuenta." };
    }
    invalidateUserIdBridge();
  }

  const idx = USERS.findIndex((u) => u.id === user.id);
  if (idx >= 0) USERS.splice(idx, 1);
  // Persist the removal so a demo/mock seed entry (no real Supabase account —
  // e.g. one of the hardcoded people in mock-data.ts) doesn't silently come
  // back on the next reload, when USERS reinitializes from its static
  // source. Harmless no-op for a real account (already gone via cascade
  // delete above) or a local-only ghost (already scrubbed below).
  hideMockUser(user.id);

  if (user.role === "student") {
    removeFromListKey(REGISTERED_STUDENTS_KEY, user.id);
    removeFromMapKey(STUDENT_PROFILE_KEY, user.id);
  } else if (user.role === "teacher") {
    removeFromListKey(REGISTERED_TEACHERS_KEY, user.id);
    removeFromMapKey(TEACHER_PROFILE_KEY, user.id);
  } else {
    removeFromListKey(CREATED_USERS_KEY, user.id);
    removeFromMapKey(USER_STATUS_KEY, user.id);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STUDENTS_EVENT));
    window.dispatchEvent(new CustomEvent(TEACHERS_EVENT));
    window.dispatchEvent(new CustomEvent(USERS_EVENT));
  }
  return { ok: true };
}
