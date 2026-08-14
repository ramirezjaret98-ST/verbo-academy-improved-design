// Read-only view of everything submitted for a session: the teacher's
// Final Session Report (class notes, note for the student, branded PDF),
// the student's rating of the session, and the teacher's skill rating of
// the student (performance_ratings). Shared by Admin > Sessions and the
// Admin > Calendar/Overview event modal so both surfaces render the exact
// same thing instead of drifting apart.
//
// Originally lived only in admin.sessions.tsx (added 2026-08-12 for the
// "Admin can't see session reports" gap) — extracted 2026-08-13 so
// Calendar/Overview can open it too instead of just linking the raw video
// call URL.
import { FileText, Star, GraduationCap } from "lucide-react";
import { userById } from "@/lib/mock-data";
import type { ExtSession } from "@/lib/sessions-store";
import { AccentModal } from "@/components/verbo/ui";
import { getPerformanceSnapshot, performanceKey } from "@/lib/performance-store";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Small 0-5 bar, same scale performance_ratings stores its 4 base skills
 *  in. Kept intentionally plain (no chart lib) — this is a summary view,
 *  Teacher > Mis Alumnos already has the full trend/analytics surface. */
function SkillBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 shrink-0 text-[11px] text-muted-foreground">{label}</div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-[#01304a]" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-8 shrink-0 text-right text-[11px] font-medium text-foreground">{value.toFixed(1)}</div>
    </div>
  );
}

/** True once there is anything worth opening this modal for — used by
 *  callers to decide whether to show a "View Report" action at all. */
export function hasSessionReport(session: Pick<ExtSession, "report_submitted_at">): boolean {
  return Boolean(session.report_submitted_at);
}

export function SessionReportModal({ session, onClose }: { session: ExtSession; onClose: () => void }) {
  const teacher = userById(session.teacher_id);
  const student = userById(session.student_id);
  const dt = new Date(session.date_time);
  const hasWrittenContent = Boolean(session.notes?.trim() || session.report_comments?.trim());
  const perf = getPerformanceSnapshot()[performanceKey(session.id, session.student_id)];

  return (
    <AccentModal
      background="linear-gradient(150deg, #01304a 0%, #02466b 100%)"
      iconTint="#01304a"
      icon={FileText}
      eyebrow="Session Report"
      title={
        <>
          <span>{student?.name ?? "Student"}</span>
          <span className="mt-0.5 block text-sm font-normal text-white/80">
            with {teacher?.name ?? "Teacher"}
          </span>
        </>
      }
      watermark={{ type: "icon", icon: FileText }}
      maxWidth="max-w-lg"
      zClass="z-[70]"
      onClose={onClose}
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto p-6 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            {dt.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </Field>
          <Field label="Attendance">
            <span className="capitalize">{session.status}</span>
            {session.absent_cause && (
              <span className="text-muted-foreground"> · {session.absent_cause === "teacher" ? "Teacher" : "Student"} caused</span>
            )}
          </Field>
        </div>

        {session.notes?.trim() && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Class Notes</div>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-foreground">
              {session.notes}
            </p>
          </div>
        )}

        {session.report_comments?.trim() && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Note for the Student</div>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-foreground">
              {session.report_comments}
            </p>
          </div>
        )}

        {!hasWrittenContent && !session.report_pdf_url && (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-muted-foreground">
            No written report content was saved for this session.
          </div>
        )}

        {session.report_pdf_url && (
          <a
            href={session.report_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#01304a] px-3.5 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <FileText className="h-3.5 w-3.5" /> Open full PDF report
          </a>
        )}

        {typeof session.student_rating === "number" && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Student's Rating of This Session</div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-foreground">
              <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
              <span className="font-medium">{session.student_rating} / 5</span>
              {session.student_comment && <span className="text-muted-foreground">— "{session.student_comment}"</span>}
            </div>
          </div>
        )}

        {perf && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" /> Teacher's Skill Rating of the Student
            </div>
            <div className="space-y-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
              <SkillBar label="Fluency" value={perf.fluency} />
              <SkillBar label="Vocabulary" value={perf.vocabulary} />
              <SkillBar label="Confidence" value={perf.confidence} />
              <SkillBar label="Grammar" value={perf.grammar} />
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Report submitted {session.report_submitted_at ? new Date(session.report_submitted_at).toLocaleString() : "—"}
        </div>
      </div>
    </AccentModal>
  );
}
