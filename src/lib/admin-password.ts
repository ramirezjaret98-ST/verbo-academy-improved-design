// Admin action: forcibly set/reset another user's login password via the
// `admin-set-password` edge function (service-role — bypasses RLS/Auth's
// normal "you can only change your own password" rule, same trust pattern
// as `admin-create-user`/`admin-delete-user`). Accepts either a real
// `app_users` UUID or a legacy short id ("u1", "u1738...") and resolves it
// through the shared user-id-bridge, so callers don't need to care which
// form of id they have on hand.
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid } from "./user-id-bridge";
import { notifyAccountEvent } from "./account-notify";

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function adminSetPassword(
  userId: string,
  newPassword?: string,
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const uuid = looksLikeUuid(userId) ? userId : (await legacyToUuid(userId)) ?? userId;
  const { data, error } = await supabase.functions.invoke("admin-set-password", {
    body: { uuid, ...(newPassword ? { newPassword } : {}) },
  });
  const invokeError = (data as { error?: string } | null)?.error;
  if (error || invokeError) {
    return { ok: false, error: invokeError || error?.message || "Failed to reset the password — please try again." };
  }
  // 2026-08-20: same "tu contraseña fue actualizada" confirmation the
  // person gets when they reset it themselves (reset-password.tsx) — more
  // important here, since it's not something they initiated. Fire-and-forget.
  notifyAccountEvent(uuid, "password_changed");
  return { ok: true, password: (data as { password: string }).password };
}
