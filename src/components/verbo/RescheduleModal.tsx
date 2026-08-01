import { useMemo, useState } from "react";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { AccentModal, AccentModalFooter, GhostButton, PrimaryButton } from "./ui";
import { updateSession, type ExtSession } from "@/lib/sessions-store";
import { isTeacherAvailableAt } from "@/lib/availability-store";

const HEADER_BG = "linear-gradient(135deg, #01304a 0%, #02466b 100%)";

export function RescheduleModal({
  session,
  kind,
  onClose,
}: {
  session: ExtSession;
  kind: "individual" | "group";
  onClose: () => void;
}) {
  const [agreed, setAgreed] = useState(kind === "individual");
  const currentDT = useMemo(() => {
    const d = new Date(session.date_time);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [session.date_time]);
  const [nextDT, setNextDT] = useState(currentDT);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (kind === "group" && !agreed) {
      setError("All members must agree before rescheduling.");
      return;
    }
    const iso = new Date(nextDT).toISOString();
    if (!isTeacherAvailableAt(session.teacher_id, iso, session.duration_minutes ?? 60)) {
      setError("The assigned teacher is not available at that time (outside their schedule or overlaps another session).");
      return;
    }
    updateSession(session.id, { date_time: iso, status: "rescheduled" });
    // Ping Admin on WhatsApp as part of the same confirmation click.
    window.open("https://wa.link/pqrkgz", "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <AccentModal
      background={HEADER_BG}
      iconTint="#ffffff"
      icon={CalendarClock}
      eyebrow="Request Reschedule"
      title="New date & time"
      watermark={{ type: "icon", icon: CalendarClock }}
      maxWidth="max-w-md"
      onClose={onClose}
    >
      <div className="p-6">
        <p className="text-xs text-muted-foreground">
          Filtered to slots within the assigned teacher's availability.
        </p>

        {kind === "group" && (
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-foreground">All members have agreed to reschedule</span>
          </label>
        )}

        <div className="mt-4">
          <label className="text-xs font-medium text-foreground">New date &amp; time</label>
          <input
            type="datetime-local"
            value={nextDT}
            onChange={(e) => { setNextDT(e.target.value); setError(null); }}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">All times shown in Mexico City time (GMT-6).</p>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <AccentModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={submit} accentColor="#f38934">Confirm Reschedule</PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}
