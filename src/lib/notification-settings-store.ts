// Admin-configurable recipient list for system notification emails (session
// cancellations/reschedules, session reports) — see notify-session-event
// Edge Function. Backed by `public.notification_settings`, a single-row
// setting exactly like `bonus_threshold_setting` (see teacher-kpis-threshold.ts,
// same shape this module mirrors).
//
// 2026-08-13: added so Jaret isn't stuck with the hardcoded admin@verbo.com
// address he can't change from inside the app — Super Admin can now edit
// this list from Admin > User Management.
import { supabase } from "@/integrations/supabase/client";

export const NOTIFICATION_SETTINGS_EVENT = "verbo:notification-settings-updated";

let cache: string[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(NOTIFICATION_SETTINGS_EVENT));
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase
      .from("notification_settings")
      .select("admin_emails")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      console.error("[notification-settings-store] failed to load", error);
      hydratePromise = null;
      return;
    }
    cache = data?.admin_emails ?? [];
    hydrated = true;
    notify();
  })();
  return hydratePromise;
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("notification-settings-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_settings" },
      () => { hydrated = false; hydratePromise = null; void hydrate(); },
    )
    .subscribe();
}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

/** Synchronous snapshot — may be empty until the initial fetch resolves;
 *  call hydrateNotificationSettings()/subscribe for a live view. */
export function getAdminNotificationEmails(): string[] {
  return cache;
}

export function hydrateNotificationSettings(): void {
  void hydrate();
}

export function subscribeNotificationSettings(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NOTIFICATION_SETTINGS_EVENT, cb);
  return () => window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, cb);
}

/** Super Admin only per RLS (`notification_settings_update_admin`) — every
 *  other role can SELECT but not UPDATE this row. Optimistic like the
 *  bonus-threshold store: cache flips immediately, rolls back on failure. */
export function setAdminNotificationEmails(emails: string[]): void {
  const prev = cache;
  const cleaned = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  cache = cleaned;
  notify();
  void (async () => {
    const { error } = await supabase
      .from("notification_settings")
      .update({ admin_emails: cleaned, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) {
      console.error("[notification-settings-store] failed to save", error);
      cache = prev;
      notify();
    }
  })();
}
