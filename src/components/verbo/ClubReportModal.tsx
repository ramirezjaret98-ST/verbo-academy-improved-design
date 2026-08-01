import { useState } from "react";
import { Download, BookOpen, Lightbulb, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { GhostButton, PrimaryButton, AccentModalHeader } from "@/components/verbo/ui";
import {
  saveClubReport, type ClubAttendance, type ClubReportEventType,
} from "@/lib/club-reports-store";
import { updateClub } from "@/lib/clubs-store";
import { updateSession } from "@/lib/sessions-store";

export interface ClubReportEventInput {
  id: string;
  type: ClubReportEventType;
  title: string;
  date: string; // ISO
  enrolled_names: string[];
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
  const initial: Record<string, ClubAttendance> = Object.fromEntries(
    event.enrolled_names.map((n) => [n, "present" as ClubAttendance]),
  );
  const [attendance, setAttendance] = useState<Record<string, ClubAttendance>>(initial);
  const [comments, setComments] = useState("");

  const fmt = new Date(event.date).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const theme = typeTheme(event.type);

  const toggle = (name: string, value: ClubAttendance) =>
    setAttendance((prev) => ({ ...prev, [name]: value }));

  const submit = () => {
    saveClubReport({
      event_id: event.id,
      event_type: event.type,
      teacher_id: teacherId,
      attendance,
      comments: comments.trim(),
      submitted_at: new Date().toISOString(),
    });
    // Book Clubs & Insights live in clubs-store — mark them completed so
    // Calendar and Manage Clubs reflect immediately. Spotlight events don't
    // yet have a cross-app store; the club-reports entry alone tracks them.
    if (event.type === "book" || event.type === "insight") {
      updateClub(event.id, { status: "completed" });
    } else if (event.type === "spotlight") {
      updateSession(event.id, { status: "completed" });
    }
    toast.success("Club Report submitted. It will be saved to the club history and visible to attendees.");
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
            {event.enrolled_names.length === 0 ? (
              <p className="mt-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                No enrolled students on record for this event.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {event.enrolled_names.map((name) => {
                  const val = attendance[name] ?? "present";
                  return (
                    <li key={name} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0 truncate text-sm text-foreground">{name}</div>
                      <div className="inline-flex overflow-hidden rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => toggle(name, "present")}
                          className={`px-2.5 py-1 text-xs font-medium transition-colors ${val === "present" ? "bg-success text-success-foreground" : "bg-background text-muted-foreground hover:bg-secondary"}`}
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(name, "absent")}
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
              Marking Absent here is informational only — it does not trigger strikes or affect the student's monthly quota.
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
            <PrimaryButton onClick={submit}>Submit Report</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}