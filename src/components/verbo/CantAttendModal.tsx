// Two-step "Can't Attend" flow used by the Teacher Calendar for Performance
// Sessions. Step 1 collects the Reason (and either a required medical note
// or free-text). Step 2 is an in-app warning modal explaining the impact on
// the teacher's Composite Score before the cancellation lands.
//
// The cancellation itself is delegated to strikes-store.cancelSessionByTeacher
// so all downstream effects (session → cancelled, strike ledger, auto-freeze
// at 3 strikes, Needs Substitute flag when <24h) stay in one place.
import { useMemo, useState } from "react";
import { AlertTriangle, NotebookPen } from "lucide-react";
import { GhostButton, PrimaryButton, AccentModalHeader } from "@/components/verbo/ui";
import type { ExtSession } from "@/lib/sessions-store";
import {
  cancelSessionByTeacher, CANCEL_REASON_LABEL, type CancelReason,
} from "@/lib/strikes-store";
import { getCoverageNote, setCoverageNote } from "@/lib/coverage-notes-store";
import { userById } from "@/lib/mock-data";

// Admin is pinged on WhatsApp as part of the confirmation click itself. The
// message is pre-filled with the session details so the teacher only has to
// hit send.
const ADMIN_WA_LINK = "https://wa.link/pqrkgz";

function adminWhatsAppLink(text: string) {
  return `${ADMIN_WA_LINK}?text=${encodeURIComponent(text)}`;
}


export function CantAttendModal({
  session, teacherId, onClose, onDone,
}: {
  session: ExtSession;
  teacherId: string;
  onClose: () => void;
  onDone: (result: { needsSubstitute: boolean }) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Exact (un-rounded) hours until the session starts — 23.6h must stay below
  // the 24h threshold, so never round this value.
  const hoursUntil = useMemo(
    () => (+new Date(session.date_time) - Date.now()) / (60 * 60 * 1000),
    [session.date_time],
  );

  // Coverage Notes — reused from My Students. Required (non-empty) when the
  // cancellation lands ≥24h out (reschedulable → Cancelled cause Teacher),
  // so any substitute picking up the reschedule has context on the student.
  const studentId = session.student_id;
  const requireCoverage = hoursUntil >= 24;
  const [coverage, setCoverage] = useState<string>(
    () => getCoverageNote(teacherId, studentId),
  );
  const coverageValid = !requireCoverage || coverage.trim().length > 0;

  const step1Valid =
    ((reason === "illness" && !!file) ||
      (reason === "other" && note.trim().length > 0) ||
      reason === "personal" ||
      reason === "major_issue") &&
    coverageValid;

  // Alert tone reuses the same red the app already paints "absent" /
  // cancellation states with in status-palette.ts (#dc0000).
  const ALERT_BG = "linear-gradient(135deg, #dc0000 0%, #f38934 100%)";

  const teacherName = userById(teacherId)?.name ?? teacherId;
  const studentName = userById(studentId)?.name ?? studentId;

  const confirmCancel = () => {
    if (!reason) return;
    // Persist coverage note first so it is available to the substitute the
    // moment the cancellation lands (Lesson Plan + Session Details callout).
    if (requireCoverage) setCoverageNote(teacherId, studentId, coverage.trim());
    const { needsSubstitute } = cancelSessionByTeacher({
      sessionId: session.id,
      teacherId,
      reason: reason as CancelReason,
      note: note.trim() || undefined,
      medicalNoteName: file?.name,
    });
    const when = new Date(session.date_time).toLocaleString(undefined, {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const message =
      `Hi Admin — I can't attend a Performance Session.\n` +
      `Teacher: ${teacherName}\n` +
      `Session: ${session.id}\n` +
      `Student: ${studentName}\n` +
      `Date: ${when}\n` +
      `Reason: ${CANCEL_REASON_LABEL[reason as CancelReason]}` +
      (note.trim() ? `\nNote: ${note.trim()}` : "") +
      `\n${needsSubstitute ? "Starts in less than 24h — a substitute is needed." : "Starts in more than 24h — I'd like to propose a reschedule."}`;
    window.open(adminWhatsAppLink(message), "_blank", "noopener,noreferrer");
    onDone({ needsSubstitute });
  };

  return (
    <div
      className="verbo-overlay-in fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating"
      >
        {step === 1 ? (
          <>
            <AccentModalHeader
              background={ALERT_BG}
              iconTint="#dc0000"
              icon={AlertTriangle}
              eyebrow="Performance Session"
              title="Can't Attend"
              watermark={{ type: "icon", icon: AlertTriangle }}
              onClose={onClose}
            />
            <div className="space-y-4 px-5 py-5 text-sm">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as CancelReason)}
                  className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— Select —</option>
                  {(Object.keys(CANCEL_REASON_LABEL) as CancelReason[]).map((r) => (
                    <option key={r} value={r}>{CANCEL_REASON_LABEL[r]}</option>
                  ))}
                </select>
              </div>

              {reason === "illness" && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medical Note (required)</label>
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="mt-1.5 block w-full text-xs file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground hover:file:bg-secondary/70"
                  />
                  {file && <p className="mt-1 text-[11px] text-muted-foreground">{file.name}</p>}
                </div>
              )}
              {reason === "other" && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Please specify</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
              {(reason === "personal" || reason === "major_issue") && (
                <p className="rounded-lg border border-dashed border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
                  Subject to Admin approval. You may add a note.
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Optional note…"
                  />
                </p>
              )}

              {requireCoverage && (
                <div className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                    <NotebookPen className="h-3.5 w-3.5" /> Coverage Notes (required)
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Context for the substitute teacher covering this student: real level,
                    sensitive topics, preferences, what they're working on now. Reused from
                    My Students and auto-cleared once the covered session is completed.
                  </p>
                  <textarea
                    value={coverage}
                    onChange={(e) => setCoverage(e.target.value)}
                    rows={4}
                    placeholder="e.g. Working on past-tense fluency; avoid politics; prefers business scenarios…"
                    className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {!coverage.trim() && (
                    <p className="mt-1.5 text-[11px] font-medium text-destructive">
                      Coverage Notes must be filled in before you can confirm the cancellation.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-secondary/30 px-5 py-3">
              <GhostButton onClick={onClose}>Cancel</GhostButton>
              <PrimaryButton onClick={() => setStep(2)} disabled={!step1Valid}>Confirm</PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <AccentModalHeader
              background={ALERT_BG}
              iconTint="#dc0000"
              icon={AlertTriangle}
              eyebrow="Step 2 of 2"
              title="Confirm Cancellation"
              watermark={{ type: "icon", icon: AlertTriangle }}
              onClose={onClose}
            />
            <div className="space-y-3 px-5 py-5 text-sm text-foreground">
              <p>
                Cancelling this session will count as a <strong>strike</strong> against your
                Cancellations / No-Shows KPI and will affect your Composite Score.
              </p>
              <p className="text-muted-foreground text-xs">
                {hoursUntil >= 24
                  ? "The session starts in more than 24 hours — you can propose a reschedule with Admin."
                  : "The session starts in less than 24 hours — Admin will attempt to find a substitute. If none is found, this hour will not be paid."}
              </p>
              <p className="text-muted-foreground text-xs">
                Reaching 3 unjustified strikes in the last 6 months automatically freezes your account.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-secondary/30 px-5 py-3">
              <GhostButton onClick={() => setStep(1)}>Go Back</GhostButton>
              <button
                onClick={confirmCancel}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Confirm Cancellation
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}