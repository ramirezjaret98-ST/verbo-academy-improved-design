// Thin client-side helper for the `notify-account-event` Edge Function
// (added 2026-08-20 alongside notify-session-event's premium template, for
// account events rather than a specific session — see that function's source
// for the full design). Club confirmations now come from committed bookings.
// Same fire-and-forget,
// best-effort pattern as `notifySessionEvent` in sessions-store.ts: never
// blocks or fails the caller's own action if the email hiccups.
import { supabase } from "@/integrations/supabase/client";

export function notifyAccountEvent(
  userId: string,
  kind: "password_changed",
): void {
  if (!userId) return;
  void supabase.functions.invoke("notify-account-event", { body: { userId, kind } })
    .then(({ error }) => {
      if (error) console.error("[account-notify] notify-account-event failed", error);
    });
}
