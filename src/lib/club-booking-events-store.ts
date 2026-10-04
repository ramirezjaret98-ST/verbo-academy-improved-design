// Immutable, RLS-scoped reservation events for teacher/admin notifications.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "./auth-rehydrate";
import { hydrateUserIdBridge, uuidToLegacySync } from "./user-id-bridge";

export const CLUB_BOOKING_EVENTS_EVENT = "verbo:club-booking-events-updated";
export interface ClubBookingEvent {
  id: number;
  booking_id: number;
  club_id: number;
  student_id: string;
  teacher_id: string | null;
  club_title: string;
  club_date: string;
  club_type: "book" | "insight";
  created_at: string;
}

let events: ClubBookingEvent[] = [];
let generation = 0;
let pending: Promise<void> | null = null;
let queued = false;
const notify = () => window.dispatchEvent(new CustomEvent(CLUB_BOOKING_EVENTS_EVENT));

async function refresh(): Promise<void> {
  if (pending) { queued = true; return pending; }
  const version = generation;
  pending = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("club_booking_events" as never)
      .select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    if (version !== generation) return;
    events = ((data ?? []) as unknown as ClubBookingEvent[]).map(event => ({
      ...event,
      student_id: uuidToLegacySync(event.student_id),
      teacher_id: event.teacher_id ? uuidToLegacySync(event.teacher_id) : null,
    }));
    notify();
  })().catch(error => console.error("[club-booking-events] refresh unavailable", error))
    .finally(() => { pending = null; if (queued) { queued = false; void refresh(); } });
  return pending;
}

export function loadClubBookingEvents(): ClubBookingEvent[] { return events; }

if (typeof window !== "undefined") {
  registerRehydrate(reason => {
    generation++;
    if (reason === "auth") { events = []; notify(); }
    void refresh();
  }, { critical: true });
  void refresh();
  supabase.channel("club-booking-events")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "club_booking_events" }, () => { void refresh(); })
    .subscribe(status => { if (status === "SUBSCRIBED") void refresh(); });
}
