// ============================================================================
// Internal notifications (bell) — DERIVED from existing stores.
//
// This module does NOT own its own event log. Instead, it computes the current
// notification list on demand from the events already persisted by other
// stores (sessions, clubs, availability, strikes, KPIs, announcements). The
// only thing we persist here is the per-user READ state so the badge counter
// stays accurate across reloads.
//
// Adding a new notification kind = adding a derivation branch below.
// Do NOT build a parallel event log — reuse the source of truth.
// ============================================================================
import { useSyncExternalStore } from "react";
import { USERS, type Role, type User } from "./mock-data";
import { loadSessions, SESSIONS_EVENT } from "./sessions-store";
import {
  loadClubs, loadReleaseRequests,
  CLUBS_EVENT, RELEASE_REQUESTS_EVENT,
} from "./clubs-store";
import {
  listChangeRequests, AVAIL_EVENT,
} from "./availability-store";
import { loadStrikes, STRIKES_EVENT, activeStrikeCount } from "./strikes-store";
import { computeTeacherKpis } from "./teacher-kpis";
import { teacherStatus } from "./teacher-model";
import { teacherTier } from "./teacher-tiers";
import { activeAnnouncements, ANN_EVENT } from "./announcements-store";
import { loadFinancialIssues, FIN_ISSUES_EVENT } from "./financial-issues-store";
import { REPORTS_EVENT, loadStudentReports } from "./student-reports-store";
import {
  loadConductReports, CONDUCT_REPORTS_EVENT,
} from "./conduct-reports-store";
import {
  loadContentIssueReports, CONTENT_ISSUE_EVENT,
} from "./content-issue-reports-store";
import { assignedStudentIdsFor } from "./assignments-store";
import { loadChallenges, CHALLENGES_EVENT, challengeProductsFor } from "./challenges-store";
import { STUDENTS_EVENT } from "./students-store";
import {
  loadStudentRequests, REQUESTS_EVENT,
} from "./student-requests-store";
import { loadVipUnits, VIP_UNITS_EVENT } from "./vip-courses-store";
import {
  loadTailoredUnits, TAILORED_UNITS_EVENT,
} from "./tailored-content-store";
import { loadEvents, EVENT as LP_EVENT } from "./learning-path-events";
import { loadLessonPlans, LESSON_PLANS_EVENT } from "./lesson-plans-store";
import {
  resolvedRemainingSeats, type AccessKind,
} from "./club-bookings-store";
import { groupsByStudentId } from "./groups-store";
import { computeAllEarnedBadges } from "./badge-unlock";
import { hasSeenBadgeUnlock, BADGE_UNLOCK_SEEN_EVENT } from "./badge-unlock-seen-store";
import { BADGES_EVENT as CHALLENGE_BADGES_EVENT } from "./badges-store";
import { BADGES_EVENT as PROFILE_BADGES_EVENT } from "./profile-badges-store";
import { SEASONS_EVENT, loadFlashChallenges, FLASH_EVENT } from "./flash-challenges-store";



export type NotificationKind =
  // teacher-facing
  | "session_assigned"
  | "club_substitute_match"
  | "avail_request_approved"
  | "avail_request_rejected"
  | "club_claim_confirmed"
  | "club_released"
  | "freeze_applied"
  | "kpi_below_threshold"
  | "bonus_eligible"
  | "tier_upgraded"
  | "announcement"
  | "student_challenge_selected"
  | "student_shared_challenge_result"
  | "spotlight_cancelled"
  | "challenge_pending_review"
  // teacher + admin facing — a student cancelled or was marked Absent on a
  // regular (non-Spotlight) 1:1 session. 2026-08-14: this had NO in-app
  // signal at all before this fix (only the email from notify-session-event,
  // which can land in spam / fail silently if RESEND_API_KEY isn't set) — a
  // same-day cancellation went unnoticed. See student_cancelled_session.
  | "student_cancelled_session"
  // admin-facing
  | "needs_substitute"
  | "release_request"
  | "avail_change_request"
  | "teacher_three_strikes"
  | "student_report_filed"
  | "conduct_report_filed"
  | "content_issue_reported"
  | "financial_issue_reported"
  | "challenge_flagged"
  // student-facing
  | "reschedule_request_updated"
  | "personalized_content_added"
  | "conduct_report_reviewed"
  | "learning_path_milestone"
  | "session_ready_to_prepare"
  | "session_changed"
  | "club_opened"
  | "payment_or_sessions_ending_soon"
  | "new_challenge_available"
  | "badge_unlocked"
  | "challenge_needs_resubmission"
  | "challenge_submission_approved"
  | "challenge_submission_rejected";


export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** ISO timestamp used for sorting and "time ago" formatting. */
  createdAt: string;
  /** Route to navigate to when the user clicks the notification. Reuses
   *  existing panels — the bell never creates new pages. */
  to: string;
  read: boolean;
  /** Optional payload used by handlers that open a modal instead of routing
   *  (e.g. student_shared_challenge_result). */
  data?: { studentId?: string; challengeId?: string; badgeStorageId?: string };
}

// ---------------------------------------------------------------------------
// Read-state persistence (per user)
// ---------------------------------------------------------------------------
const READ_KEY = "verbo:notifications-read";
export const NOTIF_EVENT = "verbo:notifications-updated";

type ReadMap = Record<string, Record<string, true>>; // userId -> notifId -> true

function readAllRead(): ReadMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(READ_KEY) || "{}"); } catch { return {}; }
}
function writeAllRead(map: ReadMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(NOTIF_EVENT));
  } catch { /* noop */ }
}

function readSetFor(userId: string): Record<string, true> {
  return readAllRead()[userId] ?? {};
}

export function markNotificationRead(userId: string, id: string) {
  const map = readAllRead();
  const set = { ...(map[userId] ?? {}) };
  set[id] = true;
  map[userId] = set;
  writeAllRead(map);
}

export function markAllNotificationsRead(userId: string, ids: string[]) {
  const map = readAllRead();
  const set = { ...(map[userId] ?? {}) };
  for (const id of ids) set[id] = true;
  map[userId] = set;
  writeAllRead(map);
}

// ---------------------------------------------------------------------------
// Derivation — Teacher
// ---------------------------------------------------------------------------
/** Title of any challenge id, from the regular bank or the Verbo Flash bank. */
function challengeTitle(challengeId: string): string {
  return (
    loadChallenges().find((c) => c.id === challengeId)?.title ??
    loadFlashChallenges().find((c) => c.id === challengeId)?.title ??
    "Challenge"
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function teacherNotifications(teacherId: string): Notification[] {
  const out: Notification[] = [];
  const now = Date.now();

  // ---- New sessions assigned (Scheduled / Ready in the future) -----------
  for (const s of loadSessions()) {
    if (s.teacher_id !== teacherId) continue;
    if (s.status !== "scheduled" && s.status !== "ready" && s.status !== "rescheduled") continue;
    if (+new Date(s.date_time) < now) continue;
    out.push({
      id: `session-assigned:${s.id}`,
      kind: "session_assigned",
      title: "New session assigned",
      body: `${fmtDate(s.date_time)} · ${s.duration_minutes} min`,
      createdAt: s.date_time, // no created_at in mock — use scheduled time
      to: "/teacher/calendar",
      read: false,
    });
  }

  // ---- Spotlight Sessions cancelled by the student -----------------------
  for (const s of loadSessions()) {
    if (s.teacher_id !== teacherId) continue;
    if (s.origin !== "spotlight") continue;
    if (s.status !== "cancelled") continue;
    out.push({
      id: "spotlight-cancelled:" + s.id,
      kind: "spotlight_cancelled",
      title: "Spotlight Session cancelled by student",
      body: s.cancellation_note || "The student cancelled this Spotlight Session.",
      createdAt: s.date_time,
      to: "/teacher/calendar",
      read: false,
    });
  }


  // ---- Regular (non-Spotlight) session cancelled/marked Absent by the ----
  // student — broadens the Spotlight-only block above. Excludes sessions the
  // TEACHER themselves cancelled (absent_cause === "teacher", set by
  // cancelSessionByTeacher) so a teacher never gets pinged about their own
  // action, and excludes group/workshop sessions (different flow, per-member
  // statuses live outside the top-level status this reads).
  for (const s of loadSessions()) {
    if (s.teacher_id !== teacherId) continue;
    if (s.origin === "spotlight") continue; // already covered above
    if (s.origin === "workshop") continue;
    if (s.group_id) continue;
    if (s.status !== "cancelled" && s.status !== "absent") continue;
    if (s.absent_cause === "teacher") continue;
    out.push({
      id: `student-session-cancelled:${s.id}`,
      kind: "student_cancelled_session",
      title: s.status === "absent" ? "Student marked Absent (late cancellation)" : "Student cancelled a session",
      body: `${fmtDate(s.date_time)}${s.cancellation_note ? ` — "${s.cancellation_note}"` : ""}`,
      createdAt: s.date_time,
      to: "/teacher/calendar",
      read: false,
    });
  }

  // ---- Club "Needs Substitute" that matches this teacher -----------------
  // A Created (no teacher_id) upcoming club is treated as an open substitute
  // opportunity every active teacher qualifies for in the mock model.
  const u = USERS.find((x) => x.id === teacherId);
  const isActive = u ? teacherStatus(u) === "active" : false;
  if (isActive) {
    for (const c of loadClubs()) {
      if (c.teacher_id) continue;
      if (c.status !== "upcoming") continue;
      out.push({
        id: `club-match:${c.id}`,
        kind: "club_substitute_match",
        title: "Club needs a substitute — you qualify",
        body: `${c.title} · ${fmtDate(c.date)}`,
        createdAt: c.date,
        to: "/teacher/clubs",
        read: false,
      });
    }
  }

  // ---- Availability change requests: approved / rejected -----------------
  for (const r of listChangeRequests()) {
    if (r.teacherId !== teacherId) continue;
    if (r.status === "approved" && r.resolvedAt) {
      out.push({
        id: `avail-approved:${r.id}`,
        kind: "avail_request_approved",
        title: "Availability change approved",
        body: r.reason || "Your new weekly availability is now active.",
        createdAt: r.resolvedAt,
        to: "/teacher/availability",
        read: false,
      });
    } else if (r.status === "rejected" && r.resolvedAt) {
      out.push({
        id: `avail-rejected:${r.id}`,
        kind: "avail_request_rejected",
        title: "Availability change rejected",
        body: r.reason || "Your previous availability remains in effect.",
        createdAt: r.resolvedAt,
        to: "/teacher/availability",
        read: false,
      });
    }
  }

  // ---- Club claim confirmed / released (release requests approved) -------
  // Claim confirmation: any club currently assigned to this teacher whose
  // claimed_at timestamp is known — treat as a confirmation notification.
  for (const c of loadClubs()) {
    if (c.teacher_id === teacherId && c.claimed_at) {
      out.push({
        id: `club-claim:${c.id}:${c.claimed_at}`,
        kind: "club_claim_confirmed",
        title: "Club assignment confirmed",
        body: `${c.title} · ${fmtDate(c.date)}`,
        createdAt: c.claimed_at,
        to: "/teacher/clubs",
        read: false,
      });
    }
  }
  // Release: any pending release request this teacher opened.
  for (const r of loadReleaseRequests()) {
    if (r.teacher_id !== teacherId) continue;
    out.push({
      id: `club-release:${r.id}`,
      kind: "club_released",
      title: "Club release request submitted",
      body: r.reason || "Awaiting Admin review.",
      createdAt: r.requested_at,
      to: "/teacher/clubs",
      read: false,
    });
  }

  // ---- Freeze applied ----------------------------------------------------
  if (u && teacherStatus(u) === "frozen") {
    // Anchor createdAt to the most recent strike so the notification is stable
    // across renders (not `Date.now()` — that would keep re-marking as unread).
    const strikes = loadStrikes()
      .filter((s) => s.teacher_id === teacherId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const anchor = strikes[0]?.created_at ?? new Date().toISOString();
    out.push({
      id: `freeze:${teacherId}:${anchor}`,
      kind: "freeze_applied",
      title: "Your account was frozen",
      body: "Reached 3 unjustified cancellations in the last 6 months.",
      createdAt: anchor,
      to: "/teacher",
      read: false,
    });
  }

  // ---- KPI below threshold / Bonus eligible ------------------------------
  if (u && u.role === "teacher") {
    const k = computeTeacherKpis(u);
    // "Below threshold" uses a fixed operational threshold (70) so the bell
    // doesn't flood every teacher that isn't bonus-eligible.
    const monthKey = new Date().toISOString().slice(0, 7);
    if (k.composite < 70) {
      out.push({
        id: `kpi-below:${teacherId}:${monthKey}`,
        kind: "kpi_below_threshold",
        title: "A KPI dropped below its threshold",
        body: `Composite Score: ${k.composite} / 100.`,
        createdAt: new Date().toISOString(),
        to: "/teacher",
        read: false,
      });
    }
    if (k.bonusEligible) {
      out.push({
        id: `bonus:${teacherId}:${monthKey}`,
        kind: "bonus_eligible",
        title: "Bonus Eligible reached",
        body: `Composite Score: ${k.composite} / 100.`,
        createdAt: new Date().toISOString(),
        to: "/teacher/financial",
        read: false,
      });
    }

    // ---- Tier upgraded (>= tier 2) ---------------------------------------
    const tier = teacherTier(u);
    if (tier.id > 1) {
      out.push({
        id: `tier:${teacherId}:${tier.id}`,
        kind: "tier_upgraded",
        title: `You reached the ${tier.name} tier`,
        body: `Your hourly rate is now $${tier.rate} MXN/h.`,
        createdAt: new Date().toISOString(),
        to: "/teacher/financial",
        read: false,
      });
    }
  }

  // ---- Announcements (teacher / all audiences) ---------------------------
  for (const a of activeAnnouncements()) {
    if (a.audience !== "all" && a.audience !== "teachers") continue;
    out.push({
      id: `ann:${a.id}`,
      kind: "announcement",
      title: "New announcement",
      body: a.message,
      createdAt: a.published_at,
      to: "/teacher",
      read: false,
    });
  }

  // ---- Students on this teacher's roster picked a Challenge --------------
  // Reuses the assignments table (same source used by session_assigned) —
  // no new "assigned teacher" field needed.
  const roster = assignedStudentIdsFor(teacherId);
  if (roster.length > 0) {
    const challengeById = new Map(loadChallenges().map((c) => [c.id, c]));
    for (const sid of roster) {
      const st = USERS.find((x) => x.id === sid);
      if (!st) continue;
      for (const pick of st.chosen_challenges ?? []) {
        const ch = challengeById.get(pick.challenge_id);
        if (!ch) continue;
        out.push({
          id: `student-challenge:${sid}:${pick.challenge_id}`,
          kind: "student_challenge_selected",
          title: `${st.name} picked a Challenge`,
          body: `${ch.title}${ch.category ? ` (${ch.category})` : ""}`,
          createdAt: pick.chosen_at,
          to: "/teacher/students",
          read: false,
        });
      }
      // ---- Shared results (fires once per completed challenge, on first share) ----
      for (const done of st.completed_challenges ?? []) {
        if (!done.shared_at || !done.shared_link) continue;
        const ch = challengeById.get(done.challenge_id);
        if (!ch) continue;
        out.push({
          id: `student-shared:${sid}:${done.challenge_id}`,
          kind: "student_shared_challenge_result",
          title: `${st.name} shared a result`,
          body: ch.title,
          createdAt: done.shared_at,
          to: "/teacher/students",
          read: false,
          data: { studentId: sid, challengeId: done.challenge_id },
        });
      }
      // ---- Challenge deliveries awaiting this teacher's review -------------
      for (const s of st.challenge_submissions ?? []) {
        if (s.status !== "pending_review") continue;
        out.push({
          id: `challenge-pending-review:${sid}:${s.challenge_id}:${s.submitted_at}`,
          kind: "challenge_pending_review",
          title: `${st.name} submitted a Challenge`,
          body: challengeTitle(s.challenge_id),
          createdAt: s.submitted_at,
          to: "/teacher/challenges",
          read: false,
          data: { studentId: sid, challengeId: s.challenge_id },
        });
      }
    }
  }


  return out;
}

// ---------------------------------------------------------------------------
// Derivation — Admin
// ---------------------------------------------------------------------------
function adminNotifications(): Notification[] {
  const out: Notification[] = [];

  // ---- Needs Substitute cases -------------------------------------------
  for (const s of loadSessions()) {
    if (!s.needs_substitute) continue;
    const t = USERS.find((u) => u.id === s.teacher_id);
    out.push({
      id: `needs-sub:${s.id}`,
      kind: "needs_substitute",
      title: "New Needs Substitute case",
      body: `${t?.name ?? "Teacher"} · ${fmtDate(s.date_time)}`,
      createdAt: s.date_time,
      to: "/admin/sessions",
      read: false,
    });
  }

  // ---- Student cancelled/marked Absent a session (any 1:1 origin except --
  // one the teacher themselves caused) — Admin needs this same signal, not
  // just the teacher. Same filters as the teacher-facing block above.
  for (const s of loadSessions()) {
    if (s.origin === "workshop") continue;
    if (s.group_id) continue;
    if (s.status !== "cancelled" && s.status !== "absent") continue;
    if (s.absent_cause === "teacher") continue;
    const t = USERS.find((u) => u.id === s.teacher_id);
    const st = USERS.find((u) => u.id === s.student_id);
    out.push({
      id: `student-session-cancelled:${s.id}`,
      kind: "student_cancelled_session",
      title: s.status === "absent" ? "Student marked Absent (late cancellation)" : "Student cancelled a session",
      body: `${st?.name ?? "Student"} → ${t?.name ?? "Teacher"} · ${fmtDate(s.date_time)}`,
      createdAt: s.date_time,
      to: "/admin/sessions",
      read: false,
    });
  }

  // ---- New club release requests ----------------------------------------
  const clubsById = new Map(loadClubs().map((c) => [c.id, c]));
  for (const r of loadReleaseRequests()) {
    const c = clubsById.get(r.club_id);
    const t = USERS.find((u) => u.id === r.teacher_id);
    out.push({
      id: `release-req:${r.id}`,
      kind: "release_request",
      title: "New club release request",
      body: `${t?.name ?? "Teacher"} · ${c?.title ?? r.club_id}`,
      createdAt: r.requested_at,
      to: "/admin/clubs",
      read: false,
    });
  }

  // ---- Pending availability change requests -----------------------------
  for (const r of listChangeRequests("pending")) {
    const t = USERS.find((u) => u.id === r.teacherId);
    out.push({
      id: `avail-req:${r.id}`,
      kind: "avail_change_request",
      title: "New availability change request",
      body: `${t?.name ?? "Teacher"}${r.reason ? ` — ${r.reason}` : ""}`,
      createdAt: r.createdAt,
      to: "/admin/teachers",
      read: false,
    });
  }

  // ---- Teacher hit 3 strikes → auto-freeze ------------------------------
  const teachers = USERS.filter((u) => u.role === "teacher");
  for (const t of teachers) {
    if (activeStrikeCount(t.id) < 3) continue;
    const strikes = loadStrikes()
      .filter((s) => s.teacher_id === t.id)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const anchor = strikes[0]?.created_at ?? new Date().toISOString();
    out.push({
      id: `three-strikes:${t.id}:${anchor}`,
      kind: "teacher_three_strikes",
      title: "Teacher auto-frozen (3 strikes)",
      body: `${t.name} reached 3 unjustified cancellations.`,
      createdAt: anchor,
      to: "/admin/teachers",
      read: false,
    });
  }

  // ---- Student reports filed by teachers --------------------------------
  for (const r of loadStudentReports()) {
    const t = USERS.find((u) => u.id === r.teacher_id);
    const st = USERS.find((u) => u.id === r.student_id);
    out.push({
      id: `student-report:${r.id}`,
      kind: "student_report_filed",
      title: "New student report filed",
      body: `${t?.name ?? "Teacher"} → ${st?.name ?? "Student"}`,
      createdAt: r.created_at,
      to: `/admin/students?student=${r.student_id}`,
      read: false,
    });
  }

  // ---- Conduct reports filed by students --------------------------------
  for (const r of loadConductReports()) {
    const reporter = USERS.find((u) => u.id === r.reporter_id);
    const target = USERS.find((u) => u.id === r.target_id);
    out.push({
      id: `conduct-report:${r.id}`,
      kind: "conduct_report_filed",
      title: "New conduct report filed",
      body: `${reporter?.name ?? "Student"} → ${target?.name ?? r.target_type} · ${r.category}`,
      createdAt: r.created_at,
      to: "/admin/conduct-reports",
      read: false,
    });
  }

  // ---- Technical content issues reported by students ---------------------
  for (const r of loadContentIssueReports()) {
    const st = USERS.find((u) => u.id === r.studentId);
    out.push({
      id: `content-issue:${r.id}`,
      kind: "content_issue_reported",
      title: "New technical issue reported",
      body: `${st?.name ?? "Student"} · ${r.entityType} · ${r.issueType}`,
      createdAt: r.createdAt,
      to: "/admin/content-issue-reports",
      read: false,
    });
  }

  // ---- Financial issues reported by teachers ----------------------------
  for (const i of loadFinancialIssues()) {
    const t = USERS.find((u) => u.id === i.teacher_id);
    out.push({
      id: `fin-issue:${i.id}`,
      kind: "financial_issue_reported",
      title: "New financial issue reported",
      body: `${t?.name ?? "Teacher"}${i.text ? ` — ${i.text.slice(0, 80)}` : ""}`,
      createdAt: i.created_at,
      to: "/admin/financial",
      read: false,
    });
  }

  // ---- Challenge deliveries flagged (rejected by a teacher) --------------
  for (const st of USERS) {
    for (const sub of st.challenge_submissions ?? []) {
      if (sub.status !== "rejected") continue;
      out.push({
        id: `challenge-flagged:${st.id}:${sub.challenge_id}`,
        kind: "challenge_flagged",
        title: "Challenge submission flagged",
        body: `${st.name} — ${challengeTitle(sub.challenge_id)}`,
        createdAt: sub.reviewed_at ?? sub.submitted_at,
        to: "/admin/challenges",
        read: false,
        data: { studentId: st.id, challengeId: sub.challenge_id },
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Derivation — Student
// ---------------------------------------------------------------------------
function computeNextPayment(u: User): string | null {
  if (u.next_payment) return u.next_payment;
  if (!u.payment_day) return null;
  const now = new Date();
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayThis = Math.min(u.payment_day, daysInThisMonth);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dayThis);
  if (thisMonth >= now) return thisMonth.toISOString();
  const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
  const dayNext = Math.min(u.payment_day, daysInNextMonth);
  return new Date(now.getFullYear(), now.getMonth() + 1, dayNext).toISOString();
}

function studentNotifications(studentId: string): Notification[] {
  const out: Notification[] = [];
  const now = Date.now();
  const uu = USERS.find((x) => x.id === studentId);

  // ---- Reschedule request status updates ---------------------------------
  for (const r of loadStudentRequests()) {
    if (r.student_id !== studentId) continue;
    if (r.kind !== "reschedule") continue;
    if (r.status !== "claimed" && r.status !== "assigned" && r.status !== "cancelled") continue;
    const title =
      r.status === "claimed" ? "Your reschedule request was claimed" :
      r.status === "assigned" ? "Your reschedule request was scheduled" :
      "Your reschedule request was cancelled";
    out.push({
      id: `sr-updated:${r.id}:${r.status}`,
      kind: "reschedule_request_updated",
      title,
      body: fmtDate(r.proposed_datetime),
      createdAt: r.claimed_at ?? r.requested_at,
      to: "/student/sessions",
      read: false,
    });
  }

  // ---- Personalized content added — VIP ---------------------------------
  if (uu?.product === "vip") {
    for (const unit of loadVipUnits()) {
      if (unit.student_id !== studentId) continue;
      out.push({
        id: `vip-unit-added:${unit.id}`,
        kind: "personalized_content_added",
        title: "New content added to your course",
        body: unit.title,
        createdAt: unit.created_at,
        to: "/student/my-course",
        read: false,
      });
    }
  }
  // ---- Personalized content added — Tailored (Elite) --------------------
  if (uu?.access_plan === "Elite") {
    for (const unit of loadTailoredUnits()) {
      if (unit.student_id !== studentId) continue;
      out.push({
        id: `tc-unit-added:${unit.id}`,
        kind: "personalized_content_added",
        title: "New Tailored Content added",
        body: unit.title,
        createdAt: unit.created_at,
        to: "/student/courses",
        read: false,
      });
    }
  }

  // ---- Conduct report reviewed/dismissed --------------------------------
  for (const r of loadConductReports()) {
    if (r.reporter_id !== studentId) continue;
    if (r.status !== "reviewed" && r.status !== "dismissed") continue;
    out.push({
      id: `conduct-reviewed:${r.id}:${r.status}`,
      kind: "conduct_report_reviewed",
      title: "Your report was reviewed",
      body: r.status === "dismissed" ? "Marked as dismissed." : "Marked as reviewed.",
      createdAt: r.reviewed_at ?? r.created_at,
      to: "/student",
      read: false,
    });
  }

  // ---- Learning Path milestones -----------------------------------------
  for (const ev of loadEvents(studentId)) {
    if (ev.kind !== "unit_completed" && ev.kind !== "level_completed") continue;
    out.push({
      id: `lp:${ev.kind}:${ev.ref}:${ev.ts}`,
      kind: "learning_path_milestone",
      title: ev.kind === "level_completed" ? "Level completed" : "Unit completed",
      body: ev.label ?? ev.ref,
      createdAt: ev.ts,
      to: "/student/courses",
      read: false,
    });
  }

  // ---- Session ready to prepare (lesson plan saved) ---------------------
  const plans = loadLessonPlans();
  for (const s of loadSessions()) {
    if (s.student_id !== studentId) continue;
    if (s.status !== "ready") continue;
    if (+new Date(s.date_time) < now) continue;
    const plan = plans[s.id];
    if (!plan) continue;
    out.push({
      id: `session-ready:${s.id}`,
      kind: "session_ready_to_prepare",
      title: "Your session is ready — review the content",
      body: `${plan.title} · ${fmtDate(s.date_time)}`,
      createdAt: plan.saved_at,
      to: "/student/sessions",
      read: false,
    });
  }

  // ---- Session changed --------------------------------------------------
  const CHANGED_TITLES: Record<string, string> = {
    rescheduled: "Your session was rescheduled",
    cancelled: "Your session was cancelled",
    pending_reschedule: "Your session is pending reschedule",
    delayed: "Your session was delayed",
    converted_to_spotlight: "Your session was converted to Spotlight",
  };
  for (const s of loadSessions()) {
    if (s.student_id !== studentId) continue;
    const title = CHANGED_TITLES[s.status];
    if (!title) continue;
    out.push({
      id: `session-changed:${s.id}:${s.status}`,
      kind: "session_changed",
      title,
      body: fmtDate(s.date_time),
      createdAt: s.date_time,
      to: "/student/sessions",
      read: false,
    });
  }

  // ---- Newly opened Clubs (last 7 days, only if student has a seat) -----
  const SEVEN_DAYS = 7 * 24 * 3600 * 1000;
  for (const c of loadClubs()) {
    if (c.status !== "upcoming") continue;
    const createdIso = c.created_at ?? c.date;
    if (now - +new Date(createdIso) > SEVEN_DAYS) continue;
    const kind: AccessKind = c.type === "book" ? "book" : "insight";
    if (resolvedRemainingSeats(studentId, kind) <= 0) continue;
    out.push({
      id: `club-opened:${c.id}`,
      kind: "club_opened",
      title: `New Club open: ${c.title}`,
      body: fmtDate(c.date),
      createdAt: createdIso,
      to: "/student/sessions",
      read: false,
    });
  }

  // ---- Payment / sessions ending soon (individuals only) ----------------
  if (uu && !groupsByStudentId().has(studentId)) {
    if (typeof uu.remaining_sessions === "number" && uu.remaining_sessions <= 3) {
      const monthKey = new Date().toISOString().slice(0, 7);
      out.push({
        id: `sessions-ending:${studentId}:${monthKey}`,
        kind: "payment_or_sessions_ending_soon",
        title: "Your contracted sessions are almost over",
        body: `${uu.remaining_sessions} session(s) remaining.`,
        createdAt: new Date().toISOString(),
        to: "/student",
        read: false,
      });
    }
    const nextIso = computeNextPayment(uu);
    if (nextIso) {
      const days = Math.ceil((+new Date(nextIso) - now) / (24 * 3600 * 1000));
      if (days >= 0 && days <= 5) {
        out.push({
          id: `payment-due:${studentId}:${nextIso.slice(0, 10)}`,
          kind: "payment_or_sessions_ending_soon",
          title: "Your payment is due soon",
          body: `Due ${new Date(nextIso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`,
          createdAt: new Date().toISOString(),
          to: "/student",
          read: false,
        });
      }
    }
  }

  // ---- New Challenge available (for the student's product) --------------
  // VIP has no dedicated catalog — it reads the union of every
  // content-bearing product, so "new challenge" notifications fire from any
  // of those instead of an always-false exact-match on "vip".
  const studentProduct = uu?.product;
  if (studentProduct) {
    const eligibleProducts = challengeProductsFor(studentProduct);
    for (const ch of loadChallenges()) {
      if (!ch.created_at) continue;
      if (!eligibleProducts.includes(ch.product)) continue;
      out.push({
        id: `new-challenge:${ch.id}`,
        kind: "new_challenge_available",
        title: "New Challenge available",
        body: ch.title,
        createdAt: ch.created_at,
        to: "/student/challenges",
        read: false,
      });
    }
  }

  // ---- Badge unlocked (not yet seen) --------------------------------------
  if (uu) {
    for (const b of computeAllEarnedBadges(uu)) {
      if (hasSeenBadgeUnlock(studentId, b.storageId)) continue;
      out.push({
        id: `badge-unlocked:${studentId}:${b.storageId}`,
        kind: "badge_unlocked",
        title: "New badge unlocked!",
        body: b.name,
        createdAt: new Date().toISOString(),
        to: "/student/challenges",
        read: false,
        data: { badgeStorageId: b.storageId },
      });
    }
  }

  // ---- Challenge submission reviewed by the teacher ----------------------
  for (const sub of uu?.challenge_submissions ?? []) {
    const when = sub.reviewed_at ?? sub.submitted_at;
    const title = challengeTitle(sub.challenge_id);
    if (sub.status === "needs_resubmission") {
      out.push({
        id: `challenge-needs-resubmission:${studentId}:${sub.challenge_id}:${when}`,
        kind: "challenge_needs_resubmission",
        title: "Your teacher asked for another attempt",
        body: `${title}${sub.teacher_feedback ? ` — ${sub.teacher_feedback}` : ""}`,
        createdAt: when,
        to: "/student/challenges",
        read: false,
        data: { studentId, challengeId: sub.challenge_id },
      });
    } else if (sub.status === "approved") {
      out.push({
        id: `challenge-approved:${studentId}:${sub.challenge_id}:${when}`,
        kind: "challenge_submission_approved",
        title: "Challenge approved!",
        body: title,
        createdAt: when,
        to: "/student/challenges",
        read: false,
        data: { studentId, challengeId: sub.challenge_id },
      });
    } else if (sub.status === "rejected") {
      out.push({
        id: `challenge-rejected:${studentId}:${sub.challenge_id}:${when}`,
        kind: "challenge_submission_rejected",
        title: "Challenge not approved",
        body: `${title}${sub.teacher_feedback ? ` — ${sub.teacher_feedback}` : ""}`,
        createdAt: when,
        to: "/student/challenges",
        read: false,
        data: { studentId, challengeId: sub.challenge_id },
      });
    }
  }

  return out;

}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function buildNotifications(role: Role, userId: string): Notification[] {
  const raw =
    role === "admin" ? adminNotifications() :
    role === "teacher" ? teacherNotifications(userId) :
    studentNotifications(userId);
  const readSet = readSetFor(userId);
  return raw
    .map((n) => ({ ...n, read: !!readSet[n.id] }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

// ---------------------------------------------------------------------------
// React binding — one subscription that listens to every source event.
// ---------------------------------------------------------------------------
const SOURCE_EVENTS = [
  SESSIONS_EVENT, CLUBS_EVENT, RELEASE_REQUESTS_EVENT,
  AVAIL_EVENT, STRIKES_EVENT, ANN_EVENT, NOTIF_EVENT,
  REPORTS_EVENT, CONDUCT_REPORTS_EVENT, CONTENT_ISSUE_EVENT, FIN_ISSUES_EVENT, STUDENTS_EVENT, CHALLENGES_EVENT,
  REQUESTS_EVENT, VIP_UNITS_EVENT, TAILORED_UNITS_EVENT, LP_EVENT, LESSON_PLANS_EVENT,
  CHALLENGE_BADGES_EVENT, PROFILE_BADGES_EVENT, SEASONS_EVENT, BADGE_UNLOCK_SEEN_EVENT,
  FLASH_EVENT,
];

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  for (const e of SOURCE_EVENTS) window.addEventListener(e, cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    for (const e of SOURCE_EVENTS) window.removeEventListener(e, cb);
    window.removeEventListener("storage", onStorage);
  };
}

// Cache the derived array per (role,userId) so getSnapshot returns a stable
// reference between events — useSyncExternalStore compares by identity.
let lastKey = "";
let lastList: Notification[] = [];
let lastTick = 0;

function keyOf(user: User): string { return `${user.role}:${user.id}:${lastTick}`; }

/** React hook: current notification list for the given user. */
export function useNotifications(user: User | null): {
  notifications: Notification[];
  unreadCount: number;
} {
  const snap = useSyncExternalStore(
    (cb) => {
      const wrapped = () => { lastTick++; cb(); };
      return subscribe(wrapped);
    },
    () => {
      if (!user) return [];
      const key = keyOf(user);
      if (key !== lastKey) {
        lastKey = key;
        lastList = buildNotifications(user.role, user.id);
      }
      return lastList;
    },
    () => [],
  );
  const notifications = user ? snap : [];
  const unreadCount = notifications.reduce((n, x) => (x.read ? n : n + 1), 0);
  return { notifications, unreadCount };
}
