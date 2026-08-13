import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { USERS, userById } from "@/lib/mock-data";
import { assignedTeacherIdFor } from "@/lib/assignments-store";
import {
  loadSessions,
  createSession,
  updateSession,
  subscribeSessions,
  WORKSHOP_STATUS_META,
  type ExtSession,

  type ExtSessionStatus,
} from "@/lib/sessions-store";
import {
  hydrateStudents,
  getStudentVideoLink,
  setStudentVideoLink,
  subscribeStudents,
} from "@/lib/students-store";
import { Card, Pill, PrimaryButton, GhostButton, SectionTitle, AccentModal } from "@/components/verbo/ui";
import type { LucideIcon } from "lucide-react";
import { CalendarPlus, ChevronDown, ChevronUp, X, Pencil, AlertTriangle, Users, Building2, UserCheck, CalendarClock, FileText, Star } from "lucide-react";
import { effectiveSessionCounts } from "@/lib/groups-store";
import { CandidatesModal } from "@/components/verbo/CandidatesModal";
import { RescheduleModal } from "@/components/verbo/RescheduleModal";
import { loadHolidays } from "@/lib/holidays-store";
import { computeCurrentProgress } from "@/lib/product-courses-store";


// Status → dropdown options + badge colors. Colors come from the single
// source of truth in calendar-events.ts / status-palette.ts.
const STATUS_META: Record<ExtSessionStatus, { label: string; bg: string; color: string }> = WORKSHOP_STATUS_META;


// The 7 statuses offered in the edit dropdown.
const STATUS_OPTIONS: ExtSessionStatus[] = [
  "scheduled", "ready", "completed", "absent", "cancelled", "pending_reschedule", "no_show",
];

export const Route = createFileRoute("/admin/sessions")({ component: Page });

const BRAND = "#01304a";
const ORANGE = "#f38934";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_INDEX = [1, 2, 3, 4, 5, 6]; // JS getDay()

function Page() {
  // Ensure the USERS singleton has persisted profile overrides applied so the
  // Video Call Link matches the Students view even if that page wasn't visited.
  const [, forceTick] = useState(0);
  const students = USERS.filter((u) => u.role === "student");
  const teachers = USERS.filter((u) => u.role === "teacher");
  const [sessions, setSessions] = useState<ExtSession[]>(() => loadSessions());

  useEffect(() => {
    hydrateStudents();
    forceTick((n) => n + 1);
  }, []);
  useEffect(() => subscribeSessions(() => setSessions(loadSessions())), []);
  useEffect(() => subscribeStudents(() => forceTick((n) => n + 1)), []);

  // Replaces the old localStorage-era "compute the full array, replace the
  // whole table" pattern: the store's own Realtime subscription (above)
  // already keeps `sessions` in sync, so these just dispatch the real
  // per-row writes. `batch` entries carry a throwaway client-side `id`
  // (ignored — createSession assigns the real one).
  const createBatch = (batch: ExtSession[]) => {
    for (const s of batch) {
      createSession({
        student_id: s.student_id,
        teacher_id: s.teacher_id,
        date_time: s.date_time,
        duration_minutes: s.duration_minutes,
        teams_link: s.teams_link,
        status: s.status,
        attendance_sub_status: s.attendance_sub_status,
        holiday_makeup: s.holiday_makeup,
      });
    }
  };

  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(true);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bulk-schedule live classes and manage each student's calendar from a single executive view.
        </p>
      </div>

      <UnclaimedRequestsBanner />


      {/* Bulk schedule panel */}
      <Card className="!p-0 overflow-hidden border-l-4 border-l-[#f38934]">
        <button
          onClick={() => setBulkOpen((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-secondary/40"
        >
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 place-items-center rounded-lg text-white"
              style={{ backgroundColor: ORANGE }}
            >
              <CalendarPlus className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Bulk Schedule Live Classes</div>
              <div className="text-xs text-muted-foreground">
                Generate a recurring batch across a date range in one click.
              </div>
            </div>
          </div>
          {bulkOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {bulkOpen && (
          <div className="border-t border-border px-6 py-6">
            <BulkScheduler
              students={students}
              teachers={teachers}
              existing={sessions}
              onCreate={createBatch}
            />
          </div>
        )}
      </Card>

      {/* Student cards grid */}
      <div>
        <SectionTitle>Students</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => {
            const scheduled = sessions.filter((x) => {
              const belongs = x.student_id === s.id
                || (!!x.member_statuses && Object.prototype.hasOwnProperty.call(x.member_statuses, s.id));
              if (!belongs) return false;
              // For group sessions look at THIS student's per-member status
              // when it exists; fall back to the top-level status otherwise.
              const status = x.member_statuses?.[s.id] ?? x.status;
              return !["completed", "absent"].includes(status);
            }).length;
            const counts = effectiveSessionCounts(s.id, { hired: s.hired_sessions, remaining: s.remaining_sessions });
            const hired = counts.hired;
            const remaining = counts.remaining;
            const pct = hired ? Math.min(100, (scheduled / hired) * 100) : 0;
            const urgency =
              remaining === 0
                ? "urgent"
                : remaining <= 2 || (hired > 0 && remaining / hired <= 0.15)
                ? "warning"
                : "neutral";
            const urgencyBorder =
              urgency === "urgent"
                ? "border-l-4 border-l-[#b52904]"
                : urgency === "warning"
                ? "border-l-4 border-l-[#b45309]"
                : "border-l-4 border-l-[#01304a]";
            const urgencyShadow =
              urgency === "urgent"
                ? "0 0 0 1px rgba(181,41,4,0.05), 0 8px 22px -6px rgba(181,41,4,0.18)"
                : undefined;
            return (
              <button
                key={s.id}
                onClick={() => setOpenStudent(s.id)}
                className={`group rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-floating ${urgencyBorder}`}
                style={urgencyShadow ? { boxShadow: urgencyShadow } : undefined}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold text-foreground">{s.name}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {s.company ?? "—"}
                    </div>
                  </div>
                  {(() => {
                    const lv = computeCurrentProgress(s.id, s.product, s.contracted_levels ?? [], 0)?.levelName;
                    return <Pill tone="muted">{lv ?? "—"}</Pill>;
                  })()}
                </div>

                <div className="mt-5 rounded-xl border border-border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col items-start gap-1">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Scheduled</div>
                      <div className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-base font-semibold" style={{ backgroundColor: `${BRAND}15`, color: BRAND }}>
                        {scheduled}
                        <span className="text-xs opacity-70">/ {hired}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Remaining</div>
                      <div
                        className="inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-base font-semibold"
                        style={{
                          backgroundColor: remaining === 0 ? "rgba(220,38,38,0.12)" : "rgba(243,137,52,0.14)",
                          color: remaining === 0 ? "#dc2626" : ORANGE,
                        }}
                      >
                        {remaining}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ORANGE }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {openStudent && (
        <StudentSessionsModal
          studentId={openStudent}
          sessions={sessions}
          teachers={teachers}
          onClose={() => setOpenStudent(null)}
          onSave={updateSession}
        />
      )}
    </div>
  );
}

// ============== Bulk scheduler ==============
function BulkScheduler({
  students,
  teachers,
  existing,
  onCreate,
}: {
  students: ReturnType<typeof USERS.filter>;
  teachers: ReturnType<typeof USERS.filter>;
  existing: ExtSession[];
  onCreate: (batch: ExtSession[]) => void;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const defaultTeacher = useMemo(
    () => assignedTeacherIdFor(studentId) ?? teachers[0]?.id ?? "",
    [studentId, teachers],
  );
  const [teacherId, setTeacherId] = useState(defaultTeacher);
  useEffect(() => setTeacherId(defaultTeacher), [defaultTeacher]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [days, setDays] = useState<number[]>([1, 3]); // Mon, Wed

  const student = students.find((s) => s.id === studentId);
  // Shared source of truth: the student's Video Call Link (Students profile).
  const teamsLink = student
    ? (getStudentVideoLink(student.id) || `https://teams.microsoft.com/l/meetup/${student.id}`)
    : "";

  const scheduledForStudent = existing.filter(
    (x) => x.student_id === studentId && !["completed", "absent"].includes(x.status),
  ).length;
  const hiredForStudent = student
    ? effectiveSessionCounts(student.id, { hired: student.hired_sessions }).hired
    : 0;
  const remaining = Math.max(0, hiredForStudent - scheduledForStudent);

  type GenSlot = { date: Date; holiday: boolean; makeup: boolean };
  const generated = useMemo<GenSlot[]>(() => {
    if (!startDate || !endDate || days.length === 0) return [];
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    if (end < start) return [];

    const holidaySet = new Set(loadHolidays().map((h) => h.date));
    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const out: GenSlot[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (days.includes(d.getDay())) {
        const dt = new Date(d);
        dt.setHours(hh, mm, 0, 0);
        out.push({ date: dt, holiday: holidaySet.has(localKey(dt)), makeup: false });
      }
    }

    // Append one make-up date past endDate for every holiday hit, cascading
    // if the make-up itself lands on another holiday.
    let pending = out.filter((x) => x.holiday).length;
    let cursor = out.length > 0 ? new Date(out[out.length - 1].date) : new Date(end);
    let safety = 0;
    while (pending > 0 && safety < 366) {
      cursor = new Date(cursor);
      do {
        cursor.setDate(cursor.getDate() + 1);
      } while (!days.includes(cursor.getDay()));
      const dt = new Date(cursor);
      dt.setHours(hh, mm, 0, 0);
      const isHol = holidaySet.has(localKey(dt));
      out.push({ date: dt, holiday: isHol, makeup: !isHol });
      if (isHol) pending += 1; // cascade
      pending -= 1;
      safety += 1;
    }
    return out;
  }, [startDate, endDate, days, time]);

  const holidayHits = generated.filter((g) => g.holiday).length;
  const makeupCount = generated.filter((g) => g.makeup).length;
  const consumingCount = generated.length - holidayHits;
  const overLimit = consumingCount > remaining;

  // Summary of dates skipped on the last Assign because the teacher was already
  // booked with another student at that exact date/time.
  const [conflictSummary, setConflictSummary] = useState<Date[]>([]);
  useEffect(() => { setConflictSummary([]); }, [startDate, endDate, time, days, teacherId, studentId]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const assign = () => {
    if (!studentId || !teacherId || generated.length === 0 || overLimit) return;

    // Respect the student's contracted session length (same rule the group
    // bulk scheduler follows); fall back to 60 min when it isn't set.
    const duration = student?.session_duration ?? 60;

    const isBlocking = (st: ExtSessionStatus) =>
      !["completed", "absent", "cancelled", "no_show"].includes(st);
    const conflicts: Date[] = [];
    const batch: ExtSession[] = [];
    generated.forEach((slot, i) => {
      if (slot.holiday) {
        // Auto-cancelled holiday session — never a real conflict.
        batch.push({
          id: `bulk-${Date.now()}-${i}`,
          student_id: studentId,
          teacher_id: teacherId,
          date_time: slot.date.toISOString(),
          duration_minutes: duration,
          teams_link: teamsLink,
          status: "cancelled",
          attendance_sub_status: "cancelled_holiday",
        });
        return;
      }
      const clash = existing.some(
        (x) =>
          x.teacher_id === teacherId &&
          x.student_id !== studentId &&
          isBlocking(x.status) &&
          new Date(x.date_time).getTime() === slot.date.getTime(),
      );
      if (clash) { conflicts.push(slot.date); return; }
      batch.push({
        id: `bulk-${Date.now()}-${i}`,
        student_id: studentId,
        teacher_id: teacherId,
        date_time: slot.date.toISOString(),
        duration_minutes: duration,
        teams_link: teamsLink,
        status: "scheduled",
        ...(slot.makeup ? { holiday_makeup: true } : {}),
      });
    });

    if (batch.length > 0) onCreate(batch);
    setConflictSummary(conflicts);
    if (conflicts.length === 0) { setStartDate(""); setEndDate(""); }
  };



  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Student">
          <select className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.company}</option>)}
          </select>
        </Field>
        <Field label="Teacher">
          <select className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="MS Teams link (auto)">
          <input className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" value={teamsLink} readOnly />
        </Field>
        <Field label="Start date">
          <input type="date" className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="End date">
          <input type="date" className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Session start time">
          <input type="time" className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      <Field label="Frequency (days of week)">
        <div className="mt-1 flex flex-wrap gap-2">
          {DAY_LABELS.map((lbl, i) => {
            const v = DAY_INDEX[i];
            const active = days.includes(v);
            return (
              <button
                key={v}
                onClick={() => toggleDay(v)}
                className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                style={
                  active
                    ? { backgroundColor: BRAND, color: "white", borderColor: BRAND }
                    : { backgroundColor: "transparent", color: "var(--foreground)", borderColor: "var(--border)" }
                }
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </Field>

      {generated.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={
            overLimit
              ? { backgroundColor: "#fff4e6", borderColor: ORANGE, color: "#7a3d00" }
              : { backgroundColor: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }
          }
        >
          {overLimit ? <AlertTriangle className="mt-0.5 h-4 w-4" style={{ color: ORANGE }} /> : <Users className="mt-0.5 h-4 w-4" />}
          <div>
            {overLimit ? (
              <>
                <div className="font-semibold">Attention: This range generates {consumingCount} plan sessions, but the student only has {remaining} hours remaining.</div>
                <div className="mt-0.5 text-xs">Please adjust the range to fit within the contracted plan.</div>
              </>
            ) : (
              <div>This range will generate <span className="font-semibold">{consumingCount}</span> sessions that count toward the plan. Student has <span className="font-semibold">{remaining}</span> hours remaining.</div>
            )}
            {holidayHits > 0 && (
              <div className="mt-1 text-xs">
                {holidayHits} session{holidayHits === 1 ? "" : "s"} fall on a holiday and will be auto-cancelled; {makeupCount} replacement session{makeupCount === 1 ? "" : "s"} were added at the end of the range.
              </div>
            )}

          </div>
        </div>
      )}

      {conflictSummary.length > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={{ backgroundColor: "#fef2f2", borderColor: "#dc2626", color: "#7f1d1d" }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4" style={{ color: "#dc2626" }} />
          <div>
            <div className="font-semibold">
              {conflictSummary.length} session{conflictSummary.length === 1 ? "" : "s"} could not be created — the teacher is already booked at that time.
            </div>
            <div className="mt-1 text-xs">
              Conflicting slots: {conflictSummary
                .map((d) => d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }))
                .join(" · ")}
            </div>
            <div className="mt-0.5 text-xs">All other dates were scheduled. Change the teacher or time to resolve these, or handle them manually.</div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={assign}
          disabled={overLimit || generated.length === 0 || !studentId || !teacherId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: "#5fca16" }}
        >
          <CalendarPlus className="h-4 w-4" /> Assign {generated.length > 0 ? `(${consumingCount}${holidayHits > 0 ? ` +${holidayHits} holiday` : ""})` : ""}
        </button>
      </div>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

// ============== Per-student modal ==============
function StudentSessionsModal({
  studentId,
  sessions,
  teachers,
  onClose,
  onSave,
}: {
  studentId: string;
  sessions: ExtSession[];
  teachers: ReturnType<typeof USERS.filter>;
  onClose: () => void;
  onSave: (id: string, patch: Partial<ExtSession>) => void;
}) {
  const student = userById(studentId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const studentSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.student_id === studentId)
        .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time))
        .slice(0, 10),
    [sessions, studentId],
  );

  // Shared source of truth: the student's Video Call Link (Students profile).
  const currentTeamsLink = getStudentVideoLink(studentId) || `https://teams.microsoft.com/l/meetup/${studentId}`;

  const applySessionEdit = (id: string, patch: Partial<ExtSession>, rescheduleApplied = false) => {
    const s = sessions.find((x) => x.id === id);
    const finalPatch: Partial<ExtSession> = { ...patch };
    if (rescheduleApplied && s) {
      if (s.status === "scheduled" || s.status === "rescheduled") finalPatch.status = "rescheduled";
      else if (s.status === "ready" || s.status === "rearranged") finalPatch.status = "rescheduled";
    }
    onSave(id, finalPatch);
  };


  const applyBulk = (opts: { teamsLink: string; teacherId: string; time: string; days: number[] }) => {
    // Sync the link back to the student's shared Video Call Link field.
    setStudentVideoLink(studentId, opts.teamsLink);
    const [hh, mm] = opts.time.split(":").map(Number);
    for (const s of sessions) {
      if (s.student_id !== studentId) continue;
      if (["completed", "absent"].includes(s.status)) continue;
      const patch: Partial<ExtSession> = { teams_link: opts.teamsLink, teacher_id: opts.teacherId };
      const dt = new Date(s.date_time);
      dt.setHours(hh, mm, 0, 0);
      if (opts.days.length > 0 && !opts.days.includes(dt.getDay())) {
        for (let i = 1; i <= 7; i++) {
          const d = new Date(dt); d.setDate(d.getDate() + i);
          if (opts.days.includes(d.getDay())) { dt.setDate(dt.getDate() + i); break; }
        }
      }
      patch.date_time = dt.toISOString();
      if (s.status === "scheduled" || s.status === "rescheduled") patch.status = "rescheduled";
      else if (s.status === "ready" || s.status === "rearranged") patch.status = "rescheduled";
      onSave(s.id, patch);
    }
    setBulkOpen(false);
  };

  return (
    <AccentModal
      background="linear-gradient(150deg, var(--orange-400) 0%, var(--orange-500) 55%, var(--orange-600) 100%)"
      iconTint="#f38934"
      icon={CalendarClock}
      eyebrow="Student Calendar"
      title={
        <>
          <span>{student?.name}</span>
          <span className="mt-0.5 block text-sm font-normal text-white/80">
            {student?.company} · {student?.hired_plan}
          </span>
        </>
      }
      watermark={{ type: "text", value: "SESSIONS" }}
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      <div className="max-h-[75vh] overflow-y-auto p-6">
        <div className="mb-5 flex justify-end">
          <button
            onClick={() => setBulkOpen((v) => !v)}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              bulkOpen
                ? "bg-[#f38934] text-white hover:bg-[#e07c2b]"
                : "bg-white text-[#b45309] shadow-soft ring-1 ring-[#f38934]/40 hover:bg-[#fff5ec]"
            }`}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Bulk Schedule / Link
          </button>
        </div>


        {bulkOpen && (
          <BulkEditForm
            teachers={teachers}
            currentTeamsLink={currentTeamsLink}
            currentTeacherId={studentSessions.find((s) => !["completed","absent"].includes(s.status))?.teacher_id ?? teachers[0]?.id ?? ""}
            onCancel={() => setBulkOpen(false)}
            onApply={applyBulk}
          />
        )}

        <div className="mt-5 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Teacher</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {studentSessions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No scheduled sessions yet.</td></tr>
              )}
              {studentSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  teachers={teachers}
                  editing={editingId === s.id}
                  onEdit={() => setEditingId(s.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSubmit={(patch, rescheduled) => {
                    applySessionEdit(s.id, patch, rescheduled);
                    setEditingId(null);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AccentModal>

  );
}

function SessionRow({
  session,
  teachers,
  editing,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  session: ExtSession;
  teachers: ReturnType<typeof USERS.filter>;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (patch: Partial<ExtSession>, rescheduled: boolean) => void;
}) {
  const teacher = userById(session.teacher_id);
  const dt = new Date(session.date_time);
  const dateInput = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}T${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;

  const [date, setDate] = useState(dateInput);
  const [teacherId, setTeacherId] = useState(session.teacher_id);
  const [status, setStatus] = useState<ExtSessionStatus>(session.status);
  const [absentCause, setAbsentCause] = useState<"student" | "teacher">(session.absent_cause ?? "student");
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const renderStatus = (s: ExtSessionStatus) => {
    const meta = STATUS_META[s] ?? STATUS_META.scheduled;
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
        style={{ backgroundColor: meta.bg, color: meta.color }}
      >
        {meta.label}
      </span>
    );
  };

  if (!editing) {
    return (
      <tr className="border-t border-border">
        <td className="px-4 py-3 text-foreground">{dt.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
        <td className="px-4 py-3 text-muted-foreground">{teacher?.name}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {renderStatus(session.status)}
            {session.status === "absent" && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {(session.absent_cause ?? "student") === "teacher" ? "· Teacher" : "· Student"}
              </span>
            )}
            {session.holiday_makeup && (
              <span
                className="inline-flex items-center rounded-full bg-[#92400e] px-2 py-0.5 text-[10px] font-semibold text-white"
                title="Replacement for a session that fell on a holiday"
              >
                Holiday Makeup
              </span>
            )}

            {session.needs_substitute && (
              <span className="rounded-full bg-[#b45309] px-1.5 py-0.5 text-[10px] font-semibold text-white">Needs Substitute</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex justify-end gap-1.5">
            {session.report_submitted_at && (
              <button
                onClick={() => setReportOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#01304a] px-2 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                title="View Session Report"
              >
                <FileText className="h-3 w-3" /> View Report
              </button>
            )}
            {session.needs_substitute && (
              <button
                onClick={() => setCandidatesOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#b45309] px-2 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                title="View Candidates"
              >
                <UserCheck className="h-3 w-3" /> View Candidates
              </button>
            )}
            <button
              onClick={() => setRescheduleOpen(true)}
              className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Request Reschedule"
            >
              <CalendarClock className="h-3.5 w-3.5" />
            </button>
            <button onClick={onEdit} className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {reportOpen && (
              <SessionReportModal session={session} onClose={() => setReportOpen(false)} />
            )}
            {candidatesOpen && (
              <CandidatesModal sessionId={session.id} onClose={() => setCandidatesOpen(false)} />
            )}
            {rescheduleOpen && (
              <RescheduleModal
                session={session}
                kind={session.group_id ? "group" : "individual"}
                onClose={() => setRescheduleOpen(false)}
              />
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border bg-secondary/30">
      <td className="px-4 py-3">
        <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
      </td>
      <td className="px-4 py-3">
        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="w-full cursor-pointer rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <select value={status} onChange={(e) => setStatus(e.target.value as ExtSessionStatus)} className="w-full cursor-pointer rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        {status === "absent" && (
          <div className="mt-2">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Caused by <span className="text-destructive">*</span></label>
            <select value={absentCause} onChange={(e) => setAbsentCause(e.target.value as "student" | "teacher")} className="w-full cursor-pointer rounded-md border border-input bg-background px-2 py-1.5 text-xs">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
            <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
              Mark <span className="font-medium">Teacher</span> only if the teacher didn't connect or cancelled without notice — this feeds the teacher's reliability KPIs.
            </p>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <GhostButton onClick={onCancelEdit} className="!px-3 !py-1 text-xs">Cancel</GhostButton>
          <PrimaryButton
            onClick={() => {
              const newIso = new Date(date).toISOString();
              const dateChanged = newIso !== session.date_time;
              // Manual status choice wins; only auto-mark rescheduled when the
              // admin left the status untouched but moved the date.
              const statusChanged = status !== session.status;
              onSubmit(
                {
                  date_time: newIso,
                  teacher_id: teacherId,
                  status,
                  absent_cause: status === "absent" ? absentCause : undefined,
                },
                dateChanged && !statusChanged,
              );
            }}
            className="!px-3 !py-1 text-xs"
            style={{ backgroundColor: "#5fca16" }}
          >
            Save
          </PrimaryButton>
        </div>
      </td>
    </tr>
  );
}

/** Read-only view of everything a teacher submitted for a session's report —
 *  previously Admin had no screen for this at all (bug reported 2026-08-12).
 *  Class Notes / the Note for the Student are the queryable columns; the PDF
 *  link opens the same branded report the teacher generated at submit time
 *  (has the full pedagogical write-up + entries even for older sessions
 *  submitted before Class Notes started being saved as text). */
function SessionReportModal({ session, onClose }: { session: ExtSession; onClose: () => void }) {
  const teacher = userById(session.teacher_id);
  const student = userById(session.student_id);
  const dt = new Date(session.date_time);
  const hasWrittenContent = Boolean(session.notes?.trim() || session.report_comments?.trim());

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

        <div className="text-xs text-muted-foreground">
          Report submitted {session.report_submitted_at ? new Date(session.report_submitted_at).toLocaleString() : "—"}
        </div>
      </div>
    </AccentModal>
  );
}

/** Solid section banner, same pattern as the Teacher/Group modals. */
function SectionBanner({ icon: Icon, label, color }: { icon: LucideIcon; label: string; color: string }) {
  return (
    <div
      className="mb-4 flex items-center gap-2 rounded-lg px-3 py-1.5"
      style={{ backgroundColor: color }}
    >
      <Icon className="h-3.5 w-3.5 text-white" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white">{label}</span>
    </div>
  );
}

// ============== Bulk edit form (inside student modal) ==============
function BulkEditForm({
  teachers,
  currentTeamsLink,
  currentTeacherId,
  onCancel,
  onApply,
}: {
  teachers: ReturnType<typeof USERS.filter>;
  currentTeamsLink: string;
  currentTeacherId: string;
  onCancel: () => void;
  onApply: (opts: { teamsLink: string; teacherId: string; time: string; days: number[] }) => void;
}) {
  const [teamsLink, setTeamsLink] = useState(currentTeamsLink);
  const [teacherId, setTeacherId] = useState(currentTeacherId);
  const [time, setTime] = useState("19:00");
  const [days, setDays] = useState<number[]>([]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <div className="mb-5 rounded-xl border p-5" style={{ borderColor: BRAND, backgroundColor: "#f5f8fa" }}>
      <SectionBanner icon={Pencil} label="Bulk Edit · Future sessions only" color="#f38934" />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="MS Teams Link (applied to all future sessions)">
          <input
            value={teamsLink}
            onChange={(e) => setTeamsLink(e.target.value)}
            className="mt-1.5 w-full cursor-text rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Update Teacher">
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="New Time Slot">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
        <Field label="Change Frequency (optional)">
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DAY_LABELS.map((lbl, i) => {
              const v = DAY_INDEX[i];
              const active = days.includes(v);
              return (
                <button
                  key={v}
                  onClick={() => toggleDay(v)}
                  className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={
                    active
                      ? { backgroundColor: BRAND, color: "white", borderColor: BRAND }
                      : { backgroundColor: "transparent", color: "var(--foreground)", borderColor: "var(--border)" }
                  }
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <GhostButton onClick={onCancel} className="!px-4 !py-2 text-xs">Cancel</GhostButton>
        <button
          onClick={() => onApply({ teamsLink, teacherId, time, days })}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-white shadow-soft transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#5fca16" }}
        >
          Apply Bulk Changes
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unclaimed Requests — student-originated Reschedule / Spotlight requests
// that no qualified teacher picked up within 8h. Admin manually assigns using
// the fair-rotation candidate list (fewest requests handled this month).
// ---------------------------------------------------------------------------
import {
  loadStudentRequests, subscribeStudentRequests, adminAssignRequest,
  fairRotationCandidates, type StudentRequest,
} from "@/lib/student-requests-store";

function UnclaimedRequestsBanner() {
  const [list, setList] = useState<StudentRequest[]>(() => loadStudentRequests());
  const [assigning, setAssigning] = useState<StudentRequest | null>(null);
  useEffect(() => subscribeStudentRequests(() => setList(loadStudentRequests())), []);
  const escalated = list.filter((r) => r.status === "escalated");
  if (escalated.length === 0) return null;
  return (
    <Card
      className="card-gradient-crimson verbo-focus-pulse [--verbo-focus-pulse-color:#b52904] !border-transparent"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 text-white">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Unclaimed Request queue</div>
            <div className="text-xs text-white/80">
              {escalated.length} student request{escalated.length === 1 ? "" : "s"} went 8h+ without being claimed and need manual assignment.
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {escalated.map((r) => {
          const student = userById(r.student_id);
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs">
              <div>
                <div className="font-semibold text-foreground">
                  {r.kind === "spotlight" ? "Spotlight" : "Reschedule"} · {student?.name ?? "Student"}
                </div>
                <div className="text-muted-foreground">
                  {new Date(r.proposed_datetime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {r.duration_minutes} min
                </div>
              </div>
              <GhostButton onClick={() => setAssigning(r)}>Assign teacher</GhostButton>
            </div>
          );
        })}
      </div>
      {assigning && (
        <AssignTeacherModal
          request={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => setAssigning(null)}
        />
      )}
    </Card>
  );
}

function AssignTeacherModal({ request, onClose, onAssigned }: {
  request: StudentRequest;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const student = userById(request.student_id);
  const qualified = USERS.filter((u) =>
    u.role === "teacher" && u.teacher_status === "active"
    && (!student?.product || (u.qualified_products ?? []).includes(student.product))
  ).map((t) => t.id);
  const ranked = fairRotationCandidates(qualified);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Assign teacher</h3>
            <p className="mt-1 text-xs text-muted-foreground">Ranked by fewest Reschedule / Spotlight Requests handled this month.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 space-y-2">
          {ranked.length === 0 && <p className="text-xs text-muted-foreground">No qualified active teachers available.</p>}
          {ranked.map((c, i) => {
            const t = userById(c.teacherId);
            return (
              <div key={c.teacherId} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-foreground">
                    {t?.name ?? c.teacherId}
                    {i === 0 && <span className="ml-2 rounded-full bg-[#5fca16] px-2 py-0.5 text-[10px] font-semibold text-white">Suggested</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{c.load} request{c.load === 1 ? "" : "s"} this month</div>
                </div>
                <PrimaryButton onClick={() => {
                  adminAssignRequest(request.id, c.teacherId);
                  onAssigned();
                }}>
                  Assign
                </PrimaryButton>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
