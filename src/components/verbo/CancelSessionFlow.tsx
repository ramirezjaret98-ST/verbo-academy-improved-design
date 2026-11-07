import { academyToday, academyTime, ACADEMY_TIME_ZONE } from "@/lib/academy-time";
import {
  rescheduleSlots,
  requestSessionReschedule,
  refreshStudentRequests,
} from "@/lib/student-requests-store";
// Shared "Can't Attend" / Reschedule flow.
//
// Extracted from student.sessions.tsx so the Student Dashboard and Live
// Sessions run exactly the same real logic:
//   a) inside the notice window  → Late Cancellation Warning (Absent).
//   b) enough notice, quota used → Late Cancellation Warning.
//   c) enough notice + quota OK  → Session Cancellation modal (Reschedule or
//      Cancel Without Rescheduling).
//   d) Groups: per-member statuses via applyGroupMemberCancellation.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { USERS, userById } from "@/lib/mock-data";
import {
  applyGroupMemberCancellation,
  studentSetSessionStatus,
  loadSessions,
  lastCoveredSummaryFor,
  type ExtSession,
} from "@/lib/sessions-store";
import {
  parseReschedulePolicy,
  reschedulesUsedThisMonth,
  rescheduleQuota,
} from "@/lib/student-requests-store";
import { isTeacherAvailableAt, findAvailableStartSlots } from "@/lib/availability-store";
import { hydrateTeachers, subscribeTeachers } from "@/lib/teacher-model";
import { AccentModalHeader, GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { AlertTriangle, CalendarClock, ArrowDown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
const SESSION_HEADER = "linear-gradient(135deg, #01304a, #024b69)";
function sessionDate(iso: string) {
  return (
    new Date(iso).toLocaleDateString("en-US", {
      timeZone: ACADEMY_TIME_ZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
    }) +
    " · " +
    fmtSlotTime(iso)
  );
}
function SessionSummary({ session }: { session: ExtSession }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm">
      <p className="font-semibold">{sessionDate(session.date_time)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {userById(session.teacher_id)?.name ?? "Your teacher"} · {session.duration_minutes ?? 60}{" "}
        min · Mexico City time
      </p>
    </div>
  );
}
function SessionActionDialog({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-2xl p-0 [&>button]:hidden"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogTitle asChild>
          <span className="sr-only">{title}</span>
        </DialogTitle>
        <DialogDescription className="sr-only">
          Manage this session using your current plan rules. All times are Mexico City time.
        </DialogDescription>
        <AccentModalHeader
          background={SESSION_HEADER}
          iconTint="#01304a"
          icon={CalendarClock}
          eyebrow="PERFORMANCE SESSION"
          title={title}
          watermark={{ type: "icon", icon: CalendarClock }}
          onClose={() => {
            if (!busy) onClose();
          }}
        />
        <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 36e5;
}

export function todayYMD(): string {
  return academyToday();
}
export function fmtSlotTime(iso: string): string {
  return academyTime(iso);
}

// ---------------------------------------------------------------------------
// Can't Attend router — evaluates the 4 branches and shows the right modal.
// ---------------------------------------------------------------------------
export function CantAttendRouter({
  session,
  user,
  onClose,
}: {
  session: ExtSession;
  user: {
    id: string;
    sessions_per_week?: number;
    reschedule_policy?: string;
    reschedule_custom_hours?: number;
    reschedule_custom_pct?: number;
  };
  onClose: () => void;
  onReschedule: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const policy = parseReschedulePolicy(user);
  const quota = rescheduleQuota(user);
  const used = reschedulesUsedThisMonth(user.id);
  const hours = hoursUntil(session.date_time);
  const insideLateWindow = hours < policy.noticeHours;
  const quotaExhausted = used >= quota || !!session.student_reschedule_used;
  const isGroup = Boolean(session.group_id);

  // For groups, "Absent" is recorded per-member (top-level stays scheduled
  // unless the whole roster is out). For 1:1, top-level flips to Absent.
  const confirmAbsent = async () => {
    if (isGroup) {
      if (!(await applyGroupMemberCancellation(session.id, user.id, "absent"))) return false;
      toast("You've been marked Absent. The session continues for the other members.");
    } else {
      if (!(await studentSetSessionStatus(session.id, "absent"))) return false;
      toast("Session marked as Absent.");
    }
    onClose();
    return true;
  };
  const confirmCancelNoReschedule = async () => {
    if (isGroup) {
      const res = await applyGroupMemberCancellation(session.id, user.id, "cancelled");
      if (!res) return false;
      toast(
        res.outcome.kind === "unanimous_cancel"
          ? "All members cancelled — the group session has been cancelled."
          : "You've cancelled this group session. Credit forfeited. The class continues for the remaining members.",
      );
    } else {
      if (!(await studentSetSessionStatus(session.id, "cancelled"))) return false;
      toast("Session cancelled. Credit forfeited.");
    }
    onClose();
    return true;
  };

  if (insideLateWindow) {
    return (
      <LateCancellationModal
        session={session}
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
        session={session}
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
  if (!cancelling)
    return (
      <RescheduleRequestModal
        session={session}
        onClose={onClose}
        onCancelInstead={() => setCancelling(true)}
      />
    );
  return (
    <SessionCancellationModal
      session={session}
      isGroup={isGroup}
      onClose={onClose}
      onReschedule={() => setCancelling(false)}
      onCancelNoReschedule={confirmCancelNoReschedule}
    />
  );
}

function LateCancellationModal({
  session,
  firstLine,
  onClose,
  onConfirm,
}: {
  session: ExtSession;
  firstLine: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  return (
    <CancellationConfirmation
      session={session}
      message={firstLine}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function CancellationConfirmation({
  session,
  message,
  onClose,
  onConfirm,
  onReschedule,
}: {
  session: ExtSession;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  onReschedule?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const confirm = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await onConfirm())) setError("Your cancellation was not saved. Please try again.");
    } catch {
      setError("Your cancellation was not saved. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <SessionActionDialog title="Cancel this session?" onClose={onClose} busy={busy}>
      <SessionSummary session={session} />
      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Before you confirm</p>
        <p className="mt-1 leading-relaxed">{message}</p>
      </div>
      {onReschedule && (
        <button
          type="button"
          disabled={busy}
          onClick={onReschedule}
          className="mt-4 text-sm font-semibold text-foreground underline"
        >
          Change the time instead
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton disabled={busy} onClick={onClose}>
          Keep my session
        </PrimaryButton>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="rounded-full border border-destructive px-4 py-2.5 text-sm font-semibold text-destructive disabled:opacity-50"
        >
          {busy ? "Saving…" : "Confirm cancellation"}
        </button>
      </div>
    </SessionActionDialog>
  );
}

function SessionCancellationModal({
  session,
  isGroup,
  onClose,
  onReschedule,
  onCancelNoReschedule,
}: {
  session: ExtSession;
  isGroup?: boolean;
  onClose: () => void;
  onReschedule: () => void;
  onCancelNoReschedule: () => Promise<boolean>;
}) {
  return (
    <>
      <CancellationConfirmation
        session={session}
        message={
          isGroup
            ? "Your place will be cancelled and its credit forfeited. The class continues for the remaining members unless everyone opts out."
            : "This session will be cancelled and its credit forfeited."
        }
        onClose={onClose}
        onConfirm={onCancelNoReschedule}
        onReschedule={onReschedule}
      />
    </>
  );
}

/** Grid of valid :00 / :30 start times for the chosen date. Selecting a slot
 *  writes the ISO datetime; students can't type an arbitrary minute. */
export function SlotPickerGrid({
  dateYMD,
  durationMin,
  qualifiedTeacherIds,
  selectedISO,
  onSelect,
}: {
  dateYMD: string;
  durationMin: number;
  qualifiedTeacherIds: string[];
  selectedISO: string;
  onSelect: (iso: string) => void;
}) {
  const { user } = useAuth();
  const demoStudentId = user?.is_sales_demo ? user.id : undefined;
  const slots = useMemo(
    () => findAvailableStartSlots({ dateYMD, durationMin, qualifiedTeacherIds, demoStudentId }),
    [dateYMD, durationMin, qualifiedTeacherIds, demoStudentId],
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

export function RescheduleRequestModal({
  session,
  onClose,
  onCancelInstead,
}: {
  session: ExtSession;
  onClose: () => void;
  onCancelInstead?: () => void;
}) {
  const { user } = useAuth();
  const [dateYMD, setDateYMD] = useState<string>(todayYMD());
  const [slotISO, setSlotISO] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [serverSlots, setServerSlots] = useState<{ date_time: string; available: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 2026-09-17 fix: qualifiedTeachers below used to be memoized on
  // `[product]` alone, so it snapshotted USERS the instant this modal
  // mounted. Real teacher profiles (teacher_status/qualified_products)
  // load asynchronously via hydrateTeachers() — every other page that
  // reads USERS for teacher data subscribes to re-tick when that finishes
  // (see admin.calendar.tsx, student.sessions.tsx, etc.), but this modal
  // never did, so a teacher who hadn't finished loading into USERS yet
  // (e.g. student clicks through Cant Attend -> Reschedule quickly after
  // page load) was permanently excluded from qualifiedTeachers for the
  // life of this modal instance, even once the real data arrived — no
  // slot on any date would ever show as available for that teacher.
  const [teachersTick, setTeachersTick] = useState(0);
  useEffect(() => {
    hydrateTeachers();
    return subscribeTeachers(() => setTeachersTick((n) => n + 1));
  }, []);
  const isGroup = Boolean(session.group_id);
  const actingStudentId = isGroup && user ? user.id : session.student_id;
  const studentUser = userById(actingStudentId);
  const product = studentUser?.product;
  // Duration for the reschedule ALWAYS inherits from the student's profile
  // (Access Plan defines the allowed values; Admin fixed one on registration).
  const durationMin = session.duration_minutes ?? 60;
  const noticeHours = parseReschedulePolicy(studentUser ?? {}).noticeHours;
  useEffect(() => {
    if (isGroup) return;
    let active = true;
    setLoadingSlots(true);
    setServerSlots([]);
    setError(null);
    rescheduleSlots(session.id, dateYMD)
      .then((slots) => {
        if (active) setServerSlots(slots);
      })
      .catch(() => {
        if (active) setError("Could not load times. Choose the date again or reopen this window.");
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [session.id, dateYMD, isGroup]);

  const qualifiedTeachers = useMemo(() => {
    return USERS.filter(
      (u) =>
        u.role === "teacher" &&
        u.teacher_status === "active" &&
        (!product || (u.qualified_products ?? []).includes(product)),
    );
  }, [product, teachersTick]);
  const qualifiedIds = useMemo(() => qualifiedTeachers.map((t) => t.id), [qualifiedTeachers]);

  const doSubmit = async () => {
    if (busy) return;
    if (!slotISO) {
      setError("Pick one of the available start times.");
      return;
    }
    if (!isGroup) {
      setBusy(true);
      const outcome = await requestSessionReschedule(session.id, slotISO);
      setBusy(false);
      if (!outcome) {
        setError("Your change was not confirmed. Check the message and try again.");
        return;
      }
      toast.success(
        outcome === "confirmed"
          ? "Session rescheduled. Confirmation emails are queued."
          : "Request saved for review. Your original time remains reserved; no confirmed reschedule has been used.",
      );
      onClose();
      return;
    }
    const stillOk = qualifiedIds.some((tid) => isTeacherAvailableAt(tid, slotISO, durationMin));
    if (!stillOk) {
      setError("That slot is no longer available. Please pick another.");
      return;
    }
    if (isGroup) {
      setBusy(true);
      const res = await applyGroupMemberCancellation(
        session.id,
        actingStudentId,
        "pending_reschedule",
        slotISO,
        lastCoveredSummaryFor(loadSessions(), actingStudentId),
      );
      if (!res) {
        setBusy(false);
        setError("Your request was not saved. Please try again.");
        return;
      }
      await refreshStudentRequests();
      setBusy(false);
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

  const saving = useRef(false);
  const submit = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      await doSubmit();
    } catch {
      setError("Your change was not saved. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const selected = serverSlots.find((slot) => slot.date_time === slotISO);
  const needsReview = isGroup || !selected?.available;
  const profile = studentUser ?? {};
  const policy = parseReschedulePolicy(profile);
  const quota = rescheduleQuota(profile);
  const used = reschedulesUsedThisMonth(actingStudentId);
  return (
    <SessionActionDialog title="Change your time" onClose={onClose} busy={busy}>
      <SessionSummary session={session} />
      <div
        className="mt-3 rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground"
        data-tour="reschedule-policy"
      >
        <strong className="text-foreground">
          {Math.max(0, quota - used)} of {quota} changes remaining this cycle
        </strong>{" "}
        · {noticeHours}h notice
        <details className="mt-2">
          <summary className="cursor-pointer">Your reschedule policy</summary>
          <p className="mt-2">
            Up to {policy.maxPct}% of monthly sessions. This session keeps its {durationMin}-minute
            duration. Your plan and availability are checked when you submit.
          </p>
        </details>
      </div>
      {isGroup && (
        <p className="mt-3 text-xs text-muted-foreground">
          Your request affects your place. The group class continues unless all members request a
          change.
        </p>
      )}
      <div className="mt-4">
        <label htmlFor="reschedule-date" className="text-xs font-semibold">
          Choose a date
        </label>
        <input
          id="reschedule-date"
          type="date"
          value={dateYMD}
          min={todayYMD()}
          disabled={busy}
          onChange={(e) => {
            setDateYMD(e.target.value);
            setSlotISO("");
            setError(null);
          }}
          className="mt-1.5 w-full rounded-xl border border-input bg-background p-3 text-sm text-foreground"
        />
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold">Available start times · Mexico City</p>
        {isGroup ? (
          <SlotPickerGrid
            dateYMD={dateYMD}
            durationMin={durationMin}
            qualifiedTeacherIds={qualifiedIds}
            selectedISO={slotISO}
            onSelect={(iso) => {
              if (!busy) {
                setSlotISO(iso);
                setError(null);
              }
            }}
          />
        ) : loadingSlots ? (
          <p role="status" className="py-5 text-sm text-muted-foreground">
            Loading times…
          </p>
        ) : (
          <div className="mt-2 grid max-h-52 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {serverSlots.map((slot) => (
              <button
                type="button"
                key={slot.date_time}
                disabled={busy}
                aria-pressed={slotISO === slot.date_time}
                onClick={() => {
                  setSlotISO(slot.date_time);
                  setError(null);
                }}
                className={
                  "rounded-xl border p-3 text-sm transition-colors " +
                  (slotISO === slot.date_time
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-secondary")
                }
              >
                <strong>{fmtSlotTime(slot.date_time)}</strong>
                <span className="mt-1 block text-[10px]">
                  {slot.available ? "With your teacher" : "Requires review"}
                </span>
              </button>
            ))}
            {!serverSlots.length && (
              <p className="col-span-full py-4 text-sm text-muted-foreground">
                No times meet your plan's notice window on this date. Try another day.
              </p>
            )}
          </div>
        )}
      </div>
      {slotISO && (
        <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
          <span className="text-[10px] font-semibold text-muted-foreground">FROM</span>
          <p>{sessionDate(session.date_time)}</p>
          <ArrowDown size={16} className="my-2 text-muted-foreground" aria-hidden />
          <span className="text-[10px] font-semibold text-muted-foreground">TO</span>
          <p className="font-semibold">{sessionDate(slotISO)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {needsReview
              ? isGroup
                ? "This submits your group reschedule request for review."
                : "Your original time remains reserved while this request is reviewed."
              : "This time is available with your assigned teacher. Availability is checked again when you confirm."}
          </p>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton disabled={busy || loadingSlots || !slotISO} onClick={() => void submit()}>
          {busy ? "Saving…" : needsReview ? "Send request" : "Confirm new time"}
        </PrimaryButton>
        <GhostButton disabled={busy} onClick={onClose}>
          Keep my session
        </GhostButton>
        {onCancelInstead && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancelInstead}
            className="mt-1 text-xs text-muted-foreground underline"
          >
            Cancel without rescheduling
          </button>
        )}
      </div>
    </SessionActionDialog>
  );
}
