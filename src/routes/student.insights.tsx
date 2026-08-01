// Student > Insights — standalone cartelera for students whose product is
// Insights-only (no 1:1 sessions, no Learning Path). Reuses CalendarView
// pinned to `insight` events, driven by the shared clubs-store. Clicking an
// event opens the ClubReservationModal (<24h cutoff, X/month cap).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { loadClubs, subscribeClubs, type Club } from "@/lib/clubs-store";
import { CalendarView } from "@/components/verbo/CalendarView";
import { Card } from "@/components/verbo/ui";
import { ClubReservationModal } from "@/components/verbo/ClubReservationModal";
import type { CalendarEvent, CalendarEventKind } from "@/lib/calendar-events";
import { isBooked, monthlyCap, bookingsThisMonth, useBookings } from "@/lib/club-bookings-store";
import { useCoreFreemiumGate } from "@/components/verbo/CoreFreemiumFlow";



export const Route = createFileRoute("/student/insights")({ component: Page });

const KINDS: CalendarEventKind[] = ["insight"];

function clubToEvent(c: Club, studentId: string): CalendarEvent {
  return {
    id: c.id,
    kind: "insight",
    date: c.date,
    duration_minutes: c.duration_minutes,
    title: c.title,
    subtitle: "Insight",
    status: c.status,
    spots_taken: c.spots_taken,
    spots_total: c.spots_total,
    booked: isBooked(studentId, c.id),
    club: c,
  };
}


function Page() {
  const { user } = useAuth();
  const [, tick] = useState(0);
  useEffect(() => subscribeClubs(() => tick((n) => n + 1)), []);
  useBookings(); // re-render on booking changes

  const [selected, setSelected] = useState<Club | null>(null);
  const freemium = useCoreFreemiumGate(user);

  const events = useMemo<CalendarEvent[]>(() => {
    if (!user) return [];
    return loadClubs()
      .filter((c) => c.type === "insight" && c.status !== "cancelled")
      .map((c) => clubToEvent(c, user.id));
  }, [user]);


  if (!user) return null;

  const isSignature = user.access_plan === "Signature";


  const used = bookingsThisMonth(user.id, "insight");
  const capNum = monthlyCap(user.id, "insight");
  const capDisplay = isSignature ? "∞" : String(capNum);
  const bookedCount = loadClubs().filter((c) => c.type === "insight" && isBooked(user.id, c.id)).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Insights</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Live micro-workshops on grammar, vocabulary, pronunciation and culture. Reserve your seat
            up to 24h before start — {isSignature ? "you have unlimited Insights every month." : `you can book up to ${capDisplay} per month.`}
          </p>

        </div>
      </div>

      <Card>
        <CalendarView
          events={events}
          availableKinds={KINDS}
          onEventClick={(ev) => ev.club && freemium.tryOpen("insight", () => setSelected(ev.club!))}
        />
      </Card>

      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="text-muted-foreground">
            {isSignature
              ? <>You have <span className="font-semibold text-foreground">unlimited</span> Insights this month.</>
              : <>You've used <span className="font-semibold text-foreground">{used} of your {capDisplay}</span> Insights this month.</>}
          </div>
          <div className="text-muted-foreground">
            Currently reserved: <span className="font-semibold text-foreground">{bookedCount}</span>
          </div>
        </div>

      </Card>

      {selected && (
        <ClubReservationModal
          club={selected}
          studentId={user.id}
          onClose={() => setSelected(null)}
        />
      )}

      {freemium.node}
    </div>

  );
}
