import { useEffect, useState } from "react";
import { Download, BookOpen, Lightbulb, Sparkles } from "lucide-react";
import { GhostButton, PrimaryButton, AccentModalHeader } from "@/components/verbo/ui";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  saveClubReport, type ClubAttendance, type ClubReportEventType,
} from "@/lib/club-reports-store";
import { updateSession } from "@/lib/sessions-store";
import { supabase } from "@/integrations/supabase/client";

export interface ClubReportEventInput {
  id: string;
  type: ClubReportEventType;
  title: string;
  date: string; // ISO
  enrolled_names: string[];
  enrolled_students: { id: string; name: string }[];
}

function typeLabel(t: ClubReportEventType) {
  return t === "book" ? "Book Club" : t === "insight" ? "Insight" : "Spotlight Session";
}

function typeColor(t: ClubReportEventType) {
  // Matches EVENT_KIND_META in src/lib/calendar-events.ts.
  return t === "book" ? "#d97706" : t === "insight" ? "#0ea5e9" : "#06b6d4";
}

/** Same identity calendarEventTheme() paints these events with. */
function typeTheme(t: ClubReportEventType) {
  if (t === "book") return { background: "linear-gradient(135deg, #c2410c 0%, #000000 100%)", solid: "#c2410c", icon: BookOpen };
  if (t === "insight") return { background: "linear-gradient(135deg, #01304a 0%, #05070a 100%)", solid: "#01304a", icon: Lightbulb };
  return { background: "#06b6d4", solid: "#06b6d4", icon: Sparkles };
}

export function ClubReportModal({
  event, teacherId, onClose, onSubmitted,
}: {
  event: ClubReportEventInput;
  teacherId: string;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [attendance, setAttendance] = useState<Record<string, ClubAttendance>>({});
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [guestRoster, setGuestRoster] = useState<{ booking_id: string; guest_name: string }[] | null>(event.type === "spotlight" ? [] : null);
  const [rosterError, setRosterError] = useState("");

  useEffect(() => {
    if (event.type === "spotlight") return;
    let active = true;
    void supabase.rpc("guest_club_roster" as never, { p_club_id: Number(event.id) } as never).then(({ data, error }) => {
      if (!active) return;
      if (error) setRosterError("Could not load the guest roster. Close and retry before submitting.");
      else setGuestRoster((data ?? []) as { booking_id: string; guest_name: string }[]);
    });
    return () => { active = false; };
  }, [event.id, event.type]);

  const attendees = [
    ...event.enrolled_students,
    ...(guestRoster ?? []).map(guest => ({ id: `guest:${guest.booking_id}`, name: `${guest.guest_name} · Guest` })),
  ];

  const fmt = new Date(event.date).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const theme = typeTheme(event.type);

  const toggle = (name: string, value: ClubAttendance) =>
    setAttendance((prev) => ({ ...prev, [name]: value }));

  const submit = async () => {
    if (!guestRoster || Object.keys(attendance).length !== attendees.length) {
      notifyError("Mark every student's and guest's attendance before submitting.", { context: "Submitting club report" });
      return;
    }
    setBusy(true);
    const saved = await saveClubReport({
      event_id: event.id,
      event_type: event.type,
      teacher_id: teacherId,
      attendance,
      comments: comments.trim(),
      submitted_at: new Date().toISOString(),
    });
    setBusy(false);
    if (!saved) { notifyError("Couldn't save the report or attendance. Check the reservations and try again.", { context: "Submitting club report" }); return; }
    if (event.type === "spotlight") {
      updateSession(event.id, { status: "completed" });
    }
    notifySuccess("Report and attendance saved.");
    onSubmitted?.();
    onClose();
  };

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-floating">
        <AccentModalHeader
          background={theme.background}
          iconTint={theme.solid}
          icon={theme.icon}
          eyebrow={`${typeLabel(event.type)} · Club Report`}
          title={<span className="block truncate">{event.title}<span className="mt-0.5 block text-xs font-normal opacity-80">{fmt}</span></span>}
          watermark={{ type: "icon", icon: theme.icon }}
          onClose={onClose}
        />

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attendance</div>
            {rosterError && <p className="mt-2 text-xs text-destructive" role="alert">{rosterError}</p>}
            {!guestRoster && !rosterError && <p className="mt-2 text-xs text-muted-foreground">Loading guest reservations…</p>}
            {attendees.length === 0 ? (
              <p className="mt-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                No reservations on record for this event.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {attendees.map(({ id, name }) => {
                  const val = attendance[id];
                  return (
                    <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0 truncate text-sm text-foreground">{name}</div>
                      <div className="inline-flex overflow-hidden rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => toggle(id, "present")}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors ${val === "present" ? "bg-success text-success-foreground" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(id, "absent")}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-border ${val === "absent" ? "bg-destructive text-destructive-foreground" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                        >
                          Absent
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Mark each reservation as Present or Absent. Your group notes are shared with booked students.
            </p>
          </div>

          <div className="mt-5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comments</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              placeholder="Add any notes about this session (optional)."
              className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/30 px-6 py-4">
          <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <Download className="h-3.5 w-3.5" /> Saved to the club history for attendees to review.
          </div>
          <div className="flex justify-end gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton onClick={submit} disabled={busy || !guestRoster || Object.keys(attendance).length !== attendees.length}>{busy ? "Saving…" : "Submit Report"}</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
