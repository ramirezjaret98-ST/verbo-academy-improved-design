// Student-facing "your class is ready" modal.
//
// Added 2026-09-08 as part of the notifications improvement request: before
// this, `session_ready_to_prepare` (bell) just routed to the generic
// "/student/sessions" list — the student had to hunt for the right session
// and there was no view anywhere that showed the teacher's PLAN comments
// (`plan.comments`, written before class) or a direct link to the unit's
// material. `EventDetailsModal` in student.sessions.tsx only ever surfaced
// `session.report_comments` (the POST-class report), never the pre-class
// plan comments, and no material link at all.
//
// This is a small, purpose-built modal (not a re-skin of SessionDetailsModal
// / EventDetailsModal, which carry a lot of unrelated status/action logic)
// so it can be opened from exactly two places with nothing but a
// `sessionId`: the notification bell (NotificationsBell.tsx) and the
// `?prep=<sessionId>` deep link the "lesson_plan_ready" email now points to
// (see notify-session-event's new branch + APP_URL/student/sessions?prep=).
//
// Unit-resolution mirrors the pattern already used by SessionDetailsModal's
// `plannedUnitLabel` / student.sessions.tsx's inline lookup (VIP + Tailored
// units live in custom-units-store, syllabus units in product-courses-store)
// but additionally surfaces the material link (`file_url` / `pdf_url`),
// which neither of those existing call sites needed until now.
import { CalendarClock, Clock, FileText, NotebookPen, Video } from "lucide-react";
import { AccentModalHeader, GhostButton } from "@/components/verbo/ui";
import type { ExtSession } from "@/lib/sessions-store";
import type { LessonPlan } from "@/lib/lesson-plans-store";
import { userById } from "@/lib/mock-data";
import { unitsForStudent } from "@/lib/vip-courses-store";
import { tailoredUnitsForStudent } from "@/lib/tailored-content-store";
import { loadCourses, PRODUCT_TO_COURSE } from "@/lib/product-courses-store";

interface ResolvedTopic {
  levelName: string;
  unitTitle: string;
  materialUrl?: string;
}

/** Same three sources SessionDetailsModal/PlanModal read from, extended to
 *  also return the unit's material link so this modal can offer it directly
 *  instead of sending the student off to browse the whole course. */
function resolveTopic(session: ExtSession, plan: LessonPlan): ResolvedTopic | null {
  const student = session.student_id ? userById(session.student_id) : undefined;
  if (plan.vip_unit_id && student) {
    const u = unitsForStudent(student.id).find((x) => x.id === plan.vip_unit_id);
    return u ? { levelName: "VIP Course", unitTitle: u.title, materialUrl: u.file_url || undefined } : null;
  }
  if (plan.tailored_unit_id && student) {
    const u = tailoredUnitsForStudent(student.id).find((x) => x.id === plan.tailored_unit_id);
    return u ? { levelName: "Tailored Content", unitTitle: u.title, materialUrl: u.file_url || undefined } : null;
  }
  if (!plan.unit_id) return null;
  const productId = student?.product ? PRODUCT_TO_COURSE[student.product] : undefined;
  const course = productId ? loadCourses().find((c) => c.product === productId) : undefined;
  for (const level of course?.levels ?? []) {
    const unit = level.units.find((u) => u.id === plan.unit_id);
    if (unit) return { levelName: level.name, unitTitle: unit.title, materialUrl: unit.pdf_url || undefined };
  }
  return null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SessionPrepModal({
  session,
  plan,
  onClose,
}: {
  session: ExtSession;
  plan: LessonPlan;
  onClose: () => void;
}) {
  const teacher = session.teacher_id ? userById(session.teacher_id) : undefined;
  const topic = resolveTopic(session, plan);
  const canJoinNow = Boolean(session.teams_link);

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="verbo-modal-in w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-floating"
      >
        <AccentModalHeader
          background="linear-gradient(135deg, #01304a 0%, #02466b 100%)"
          iconTint="#01304a"
          icon={NotebookPen}
          eyebrow="Your session is ready"
          title={teacher?.name ? `Class with ${teacher.name}` : "Your class is ready"}
          watermark={{ type: "icon", icon: NotebookPen }}
          onClose={onClose}
        />

        <div className="space-y-4 px-6 py-5 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info icon={<CalendarClock className="h-3.5 w-3.5" />} label="Date" value={fmtDate(session.date_time)} />
            <Info
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Time"
              value={`${fmtTime(session.date_time)} · ${session.duration_minutes} min`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info icon={<NotebookPen className="h-3.5 w-3.5" />} label="Session Title" value={plan.title} />
            <Info icon={<NotebookPen className="h-3.5 w-3.5" />} label="Session Type" value={plan.type} />
          </div>

          {topic && (
            <Info
              icon={<NotebookPen className="h-3.5 w-3.5" />}
              label="Topic"
              value={`${topic.levelName} — ${topic.unitTitle}`}
            />
          )}

          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What your teacher planned
            </div>
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-sm text-foreground">
              {plan.comments?.trim() || "Your teacher didn't leave any extra notes for this session."}
            </div>
          </div>

          {topic?.materialUrl && (
            <a
              href={topic.materialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent underline-offset-4 hover:underline"
            >
              <FileText className="h-3.5 w-3.5" /> View material for this unit
            </a>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-secondary/30 px-6 py-4">
          <GhostButton onClick={onClose}>Close</GhostButton>
          {canJoinNow && (
            <a
              href={session.teams_link || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <Video className="h-3.5 w-3.5" /> Join Live Session
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
