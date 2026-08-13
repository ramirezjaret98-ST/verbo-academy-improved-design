// Shared "Can't Attend" / Reschedule flow.
//
// Extracted from student.sessions.tsx so the Student Dashboard and Live
// Sessions run exactly the same real logic:
//   a) inside the notice window  → Late Cancellation Warning (Absent).
//   b) enough notice, quota used → Late Cancellation Warning.
//   c) enough notice + quota OK  → Session Cancellation modal (Reschedule or
//      Cancel Without Rescheduling).
//   d) Groups: per-member statuses via applyGroupMemberCancellation.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { USERS, userById } from "@/lib/mock-data";
import {
  applyGroupMemberCancellation,
  updateSession,
  studentSetSessionStatus,
  loadSessions,
  lastCoveredSummaryFor,
  type ExtSession,
  type ExtSessionStatus,
} from "@/lib/sessions-store";
import {
  addStudentRequest,
  parseReschedulePolicy,
  reschedulesUsedThisMonth,
  rescheduleQuota,
} from "@/lib/student-requests-store";
import { isTeacherAvailableAt, findAvailableStartSlots } from "@/lib/availability-store";
import { GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { X, AlertTriangle, CalendarClock, ArrowLeft } from "lucide-react";

export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 36e5;
}

export function todayYMD(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function fmtSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Can't Attend router — evaluates the 4 branches and shows the right modal.
// ---------------------------------------------------------------------------
export function CantAttendRouter({
  session, user, onClose, onReschedule,
}: {
  session: ExtSession;
  user: { id: string; sessions_per_week?: number; reschedule_policy?: string; reschedule_custom_hours?: number; reschedule_custom_pct?: number };
  onClose: () => void;
  onReschedule: () => void;
}) {
  const policy = parseReschedulePolicy(user);
  const quota = rescheduleQuota(user);
  const used = reschedulesUsedThisMonth(user.id);
  const hours = hoursUntil(session.date_time);
  const insideLateWindow = hours < policy.noticeHours;
  const quotaExhausted = used >= quota;
  const isGroup = Boolean(session.group_id);

  // For groups, "Absent" is recorded per-member (top-level stays scheduled
  // unless the whole roster is out). For 1:1, top-level flips to Absent.
  const confirmAbsent = () => {
    if (isGroup) {
      const nextMemberStatuses = { ...(session.member_statuses ?? {}), [user.id]: "absent" as ExtSessionStatus };
      updateSession(session.id, { member_statuses: nextMemberStatuses });
      toast("You've been marked Absent. The session continues for the other members.");
    } else {
      studentSetSessionStatus(session.id, "absent");
      toast("Session marked as Absent.");
    }
    onClose();
  };
  const confirmCancelNoReschedule = () => {
    if (isGroup) {
      const res = applyGroupMemberCancellation(session.id, user.id, "cancelled");
      toast(
        res.outcome.kind === "unanimous_cancel"
          ? "All members cancelled — the group session has been cancelled."
          : "You've cancelled this group session. Credit forfeited. The class continues for the remaining members.",
      );
    } else {
      studentSetSessionStatus(session.id, "cancelled");
      toast("Session cancelled. Credit forfeited.");
    }
    onClose();
  };

  if (insideLateWindow) {
    return (
      <LateCancellationModal
        firstLine={
          isGroup
            ? "Cancellation received with less than the notice required by your plan. You'll be marked Absent for this group session. The class continues for the remaining members. No reschedule is available."
            : "Cancellation received with less than the notice required by your plan. The session will be marked as Absent and forfeited. No reschedule is available."
        }
        onClose={onClose}
        onConfirm={confirmAbsent}
      />
    );
  }
  if (quotaExhausted) {
    return (
      <LateCancellationModal
        firstLine={
          isGroup
            ? "You've used all the reschedules allowed by your plan this cycle. You'll be marked Absent for this group session. The class continues for the remaining members. No reschedule is available."
            : "You've used all the reschedules allowed by your plan this cycle. The session will be marked as Absent and forfeited. No reschedule is available."
        }
        onClose={onClose}
        onConfirm={confirmAbsent}
      />
    );
  }
  return (
    <SessionCancellationModal
      policy={policy}
      quota={quota}
      used={used}
      isGroup={isGroup}
      onClose={onClose}
      onReschedule={onReschedule}
      onCancelNoReschedule={confirmCancelNoReschedule}
    />
  );
}

function LateCancellationModal({
  firstLine, onClose, onConfirm,
}: { firstLine: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="verbo-overlay-in fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-card p-6 ring-1 ring-red-200"
        style={{ boxShadow: "0 10px 30px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.1)" }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Late Cancellation Warning!</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{firstLine}</p>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="flex-1 cursor-pointer rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90">
            Go Back
          </button>
          <button onClick={onConfirm} className="flex-1 cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-opacity hover:opacity-90">
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionCancellationModal({
  policy, quota, used, isGroup, onClose, onReschedule, onCancelNoReschedule,
}: {
  policy: { noticeHours: number; maxPct: number };
  quota: number;
  used: number;
  isGroup?: boolean;
  onClose: () => void;
  onReschedule: () => void;
  onCancelNoReschedule: () => void;
}) {
  return (
    <div className="verbo-overlay-in fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--navy-100)] text-[#01304a]">
            <CalendarClock className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: "#01304a" }}>Session Cancellation</h3>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--navy-100)] bg-[var(--navy-50)] p-3.5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your membership allows you to cancel or reschedule up to <strong>{policy.maxPct}%</strong> of
            your booked sessions without penalty. You've used <strong>{used} of {quota}</strong> reschedules this cycle.
          </p>
        </div>
        {isGroup && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
            This is a group session. Your decision only affects your seat and counts against your monthly quota — the class will continue for the remaining members unless every member opts out.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onReschedule}
            className="w-full cursor-pointer rounded-lg bg-[#f38934] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={onCancelNoReschedule}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
          >
            Cancel Without Rescheduling
          </button>
          <GhostButton className="w-full justify-center" onClick={onClose}>
            <ArrowLeft className="h-3.5 w-3.5" /> Return
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

/** Grid of valid :00 / :30 start times for the chosen date. Selecting a slot
 *  writes the ISO datetime; students can't type an arbitrary minute. */
export function SlotPickerGrid({
  dateYMD, durationMin, qualifiedTeacherIds, selectedISO, onSelect,
}: {
  dateYMD: string;
  durationMin: number;
  qualifiedTeacherIds: string[];
  selectedISO: string;
  onSelect: (iso: string) => void;
}) {
  const slots = useMemo(
    () => findAvailableStartSlots({ dateYMD, durationMin, qualifiedTeacherIds }),
    [dateYMD, durationMin, qualifiedTeacherIds],
  );
  if (slots.length === 0) {
    return (
      <div className="mt-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-secondary/30 px-4 py-6 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <CalendarClock className="h-4 w-4" />
        </div>
        <p className="text-xs font-medium text-foreground">No available start times on this date</p>
        <p className="text-xs text-muted-foreground">Try another day.</p>
      </div>
    );
  }
  return (
    <div className="mt-2 grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
      {slots.map((iso) => {
        const active = iso === selectedISO;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onSelect(iso)}
            className={`cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium ring-1 transition-colors ${
              active
                ? "bg-[#01304a] text-white ring-[#01304a]"
                : "bg-background text-foreground ring-input hover:bg-secondary"
            }`}
          >
            {fmtSlotTime(iso)}
          </button>
        );
      })}
    </div>
  );
}

export function RescheduleRequestModal({ session, onClose }: { session: ExtSession; onClose: () => void }) {
  const { user } = useAuth();
  const [dateYMD, setDateYMD] = useState<string>(todayYMD());
  const [slotISO, setSlotISO] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const isGroup = Boolean(session.group_id);
  const actingStudentId = isGroup && user ? user.id : session.student_id;
  const studentUser = userById(actingStudentId);
  const product = studentUser?.product;
  // Duration for the reschedule ALWAYS inherits from the student's profile
  // (Access Plan defines the allowed values; Admin fixed one on registration).
  const durationMin = studentUser?.session_duration ?? session.duration_minutes ?? 60;

  const qualifiedTeachers = useMemo(() => {
    return USERS.filter((u) => u.role === "teacher" && u.teacher_status === "active"
      && (!product || (u.qualified_products ?? []).includes(product)));
  }, [product]);
  const qualifiedIds = useMemo(() => qualifiedTeachers.map((t) => t.id), [qualifiedTeachers]);

  const submit = () => {
    if (!slotISO) { setError("Pick one of the available start times."); return; }
    const stillOk = qualifiedIds.some((tid) => isTeacherAvailableAt(tid, slotISO, durationMin));
    if (!stillOk) { setError("That slot is no longer available. Please pick another."); return; }
    addStudentRequest({
      kind: "reschedule",
      student_id: actingStudentId,
      assigned_teacher_id: session.teacher_id,
      origin_session_id: session.id,
      proposed_datetime: slotISO,
      duration_minutes: durationMin,
      last_report_summary: lastCoveredSummaryFor(loadSessions(), actingStudentId),
    });
    if (isGroup) {
      const res = applyGroupMemberCancellation(session.id, actingStudentId, "pending_reschedule");
      toast.success(
        res.outcome.kind === "unanimous_reschedule"
          ? "All members requested a reschedule — the group session will be moved."
          : "Reschedule Request published. The group session continues for the remaining members.",
      );
    } else {
      studentSetSessionStatus(session.id, "pending_reschedule");
      toast.success("Reschedule Request published. Teachers have been notified.");
    }
    onClose();
  };

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-accent" />
          <h3 className="text-base font-semibold text-foreground">Reschedule Request</h3>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pick one of the available start times. Duration is fixed at <strong>{durationMin} min</strong> (from your plan). Start times are on the hour or half hour, and require at least 24h notice.
        </p>
        <div className="mt-4">
          <label className="text-xs font-medium text-foreground">Date</label>
          <input
            type="date"
            value={dateYMD}
            min={todayYMD()}
            onChange={(e) => { setDateYMD(e.target.value); setSlotISO(""); setError(null); }}
            className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium text-foreground">Available start times</label>
          <SlotPickerGrid
            dateYMD={dateYMD}
            durationMin={durationMin}
            qualifiedTeacherIds={qualifiedIds}
            selectedISO={slotISO}
            onSelect={(iso) => { setSlotISO(iso); setError(null); }}
          />
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose}>Return</GhostButton>
          <PrimaryButton onClick={submit}>Publish Request</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
