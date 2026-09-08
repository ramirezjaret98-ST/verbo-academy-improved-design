// Bell icon in the top nav — renders a dropdown of internal notifications
// derived from existing stores. Click an item to navigate to its route and
// mark it read. See src/lib/notifications-store.ts for source of truth.
import { useEffect, useRef, useState } from "react";
import {
  Bell, X, ExternalLink, type LucideIcon,
  CalendarPlus, Users, CheckCircle2, XCircle, CalendarX, Snowflake, TrendingDown,
  Gift, TrendingUp, Megaphone, Trophy, Share2, ClipboardList, UserSearch, LogOut,
  CalendarClock, AlertTriangle, FileText, ShieldAlert, FileWarning, DollarSign,
  Flag, RefreshCcw, Sparkles, ShieldCheck, NotebookPen, FileCheck, AlertCircle,
  CreditCard, Award, RotateCcw,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  useNotifications, markNotificationRead, markAllNotificationsRead,
  type Notification, type NotificationKind,
} from "@/lib/notifications-store";
import { USERS } from "@/lib/mock-data";
import { loadChallenges } from "@/lib/challenges-store";
import { Pill } from "@/components/verbo/ui";
import { BadgeUnlockModal } from "@/components/verbo/BadgeUnlockCelebration";
import { computeAllEarnedBadges, type UnlockBadge } from "@/lib/badge-unlock";
import { markBadgeUnlockSeen } from "@/lib/badge-unlock-seen-store";
import { loadSessions } from "@/lib/sessions-store";
import { getLessonPlan } from "@/lib/lesson-plans-store";
import { SessionPrepModal } from "@/components/verbo/SessionPrepModal";

const MAX_VISIBLE = 15;

function timeAgo(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.round(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Per-kind visual differentiation — 2026-09-08. Before this every           */
/* notification in the dropdown looked identical (same grey row, same dot).  */
/* Each kind now gets its own icon + brand-consistent color chip so a        */
/* cancellation reads as urgent at a glance and a badge unlock reads as a    */
/* celebration, without having to read the title first.                     */
/* -------------------------------------------------------------------------- */
const TONE = {
  danger: "#dc0000",   // matches STATUS_PALETTE.absent — same red used on the calendar
  warning: "#f38934",  // brand orange
  success: "#16a34a",
  info: "#01304a",     // brand navy
  violet: "#8b5cf6",   // matches STATUS_PALETTE.ready
  neutral: "#64748b",
} as const;

const NOTIF_KIND_META: Record<NotificationKind, { icon: LucideIcon; color: string }> = {
  // teacher-facing
  session_assigned: { icon: CalendarPlus, color: TONE.info },
  club_substitute_match: { icon: Users, color: TONE.violet },
  avail_request_approved: { icon: CheckCircle2, color: TONE.success },
  avail_request_rejected: { icon: XCircle, color: TONE.danger },
  club_claim_confirmed: { icon: CheckCircle2, color: TONE.success },
  club_released: { icon: CalendarX, color: TONE.neutral },
  freeze_applied: { icon: Snowflake, color: TONE.danger },
  kpi_below_threshold: { icon: TrendingDown, color: TONE.warning },
  bonus_eligible: { icon: Gift, color: TONE.success },
  tier_upgraded: { icon: TrendingUp, color: TONE.success },
  announcement: { icon: Megaphone, color: TONE.info },
  student_challenge_selected: { icon: Trophy, color: TONE.violet },
  student_shared_challenge_result: { icon: Share2, color: TONE.violet },
  spotlight_cancelled: { icon: CalendarX, color: TONE.danger },
  challenge_pending_review: { icon: ClipboardList, color: TONE.warning },
  student_cancelled_session: { icon: CalendarX, color: TONE.danger },
  // admin-facing
  needs_substitute: { icon: UserSearch, color: TONE.warning },
  release_request: { icon: LogOut, color: TONE.info },
  avail_change_request: { icon: CalendarClock, color: TONE.info },
  teacher_three_strikes: { icon: AlertTriangle, color: TONE.danger },
  student_report_filed: { icon: FileText, color: TONE.info },
  conduct_report_filed: { icon: ShieldAlert, color: TONE.warning },
  content_issue_reported: { icon: FileWarning, color: TONE.warning },
  financial_issue_reported: { icon: DollarSign, color: TONE.danger },
  challenge_flagged: { icon: Flag, color: TONE.danger },
  // student-facing
  reschedule_request_updated: { icon: RefreshCcw, color: TONE.info },
  personalized_content_added: { icon: Sparkles, color: TONE.violet },
  conduct_report_reviewed: { icon: ShieldCheck, color: TONE.success },
  learning_path_milestone: { icon: Trophy, color: TONE.success },
  session_ready_to_prepare: { icon: NotebookPen, color: TONE.info },
  report_ready: { icon: FileCheck, color: TONE.success },
  session_changed: { icon: CalendarClock, color: TONE.warning },
  club_opened: { icon: Sparkles, color: TONE.violet },
  payment_or_sessions_ending_soon: { icon: AlertCircle, color: TONE.warning },
  installment_payment_due: { icon: CreditCard, color: TONE.warning },
  new_challenge_available: { icon: Trophy, color: TONE.violet },
  badge_unlocked: { icon: Award, color: TONE.success },
  challenge_needs_resubmission: { icon: RotateCcw, color: TONE.warning },
  challenge_submission_approved: { icon: CheckCircle2, color: TONE.success },
  challenge_submission_rejected: { icon: XCircle, color: TONE.danger },
};

/* -------------------------------------------------------------------------- */
/* Shared-result preview modal — reuses MaterialLibrary's read-only preview   */
/* look so it feels consistent with the rest of the platform.                 */
/* -------------------------------------------------------------------------- */
function SharedResultModal({
  studentId,
  challengeId,
  onClose,
}: {
  studentId: string;
  challengeId: string;
  onClose: () => void;
}) {
  const student = USERS.find((u) => u.id === studentId);
  const challenge = loadChallenges().find((c) => c.id === challengeId);
  const entry = student?.completed_challenges?.find((c) => c.challenge_id === challengeId);
  const link = entry?.shared_link ?? "";

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div
        className="verbo-modal-card-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="success">Shared result</Pill>
              {challenge?.category && <Pill tone="muted">{challenge.category}</Pill>}
            </div>
            <h3 className="mt-2 text-sm font-semibold text-foreground">
              {student?.name ?? "Student"}
            </h3>
            <p className="text-xs text-muted-foreground">{challenge?.title ?? "Challenge"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-secondary/30 p-5">
          {link ? (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Shared link (read only)
              </div>
              <div className="break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground">
                {link}
              </div>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open in a new tab
              </a>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              This shared result is no longer available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotificationsBell({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount } = useNotifications(user ?? null);
  const [open, setOpen] = useState(false);
  const [sharedModal, setSharedModal] = useState<{ studentId: string; challengeId: string } | null>(null);
  const [badgeModal, setBadgeModal] = useState<UnlockBadge | null>(null);
  const [prepModalSessionId, setPrepModalSessionId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    markAllNotificationsRead(user.id, unreadIds);
  }, [open, user, notifications]);

  if (!user) return null;

  const isDark = variant === "dark";
  const visible = notifications.slice(0, MAX_VISIBLE);
  const hasUnread = unreadCount > 0;

  const onClickItem = (n: Notification) => {
    if (!n.read) markNotificationRead(user.id, n.id);
    setOpen(false);
    if (
      (n.kind === "student_shared_challenge_result" || n.kind === "challenge_flagged") &&
      n.data?.studentId && n.data?.challengeId
    ) {
      setSharedModal({ studentId: n.data.studentId, challengeId: n.data.challengeId });
      return;
    }
    // 2026-09-08: opens the new SessionPrepModal in place instead of
    // navigating to the generic sessions list — same pattern as the
    // shared-result / badge-unlock branches below.
    if (n.kind === "session_ready_to_prepare" && n.data?.sessionId) {
      setPrepModalSessionId(n.data.sessionId);
      return;
    }
    if (n.kind === "badge_unlocked" && n.data?.badgeStorageId) {
      const student = USERS.find((u) => u.id === user.id);
      const badge = student
        ? computeAllEarnedBadges(student).find((b) => b.storageId === n.data!.badgeStorageId)
        : undefined;
      if (badge) setBadgeModal(badge);
      return;
    }
    // 2026-09-08: kinds tied to one specific session get a deep link instead
    // of just landing on the generic calendar — `highlight` makes
    // CalendarView pulse + scroll to that exact session (color of its
    // status), `studentId` pre-selects the Admin Calendar's student filter
    // so it's actually visible. See admin.calendar.tsx / teacher.calendar.tsx
    // / student.sessions.tsx's Route.validateSearch + highlightEventId prop.
    if (
      n.data?.sessionId &&
      (n.kind === "session_assigned" ||
        n.kind === "spotlight_cancelled" ||
        n.kind === "student_cancelled_session" ||
        n.kind === "session_changed")
    ) {
      const search: Record<string, string> = { highlight: n.data.sessionId };
      if (n.data.studentId) search.studentId = n.data.studentId;
      navigate({ to: n.to, search: search as never });
      return;
    }
    navigate({ to: n.to });
  };

  const markAll = () => {
    if (!hasUnread) return;
    markAllNotificationsRead(user.id, notifications.filter((n) => !n.read).map((n) => n.id));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className={`verbo-notif-press relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors ${
          isDark
            ? "text-[#94a3b8] hover:text-[#f38934]"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Bell className="h-4 w-4" />
        {hasUnread && (
          <span
            key={unreadCount}
            aria-hidden="true"
            className="verbo-notif-badge absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="verbo-notif-panel absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-elevated"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">Notifications</div>
            <button
              type="button"
              onClick={markAll}
              disabled={!hasUnread}
              className="verbo-notif-press text-xs font-medium text-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="verbo-soft-fade px-4 py-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
              {visible.map((n, i) => (
                <li
                  key={n.id}
                  className="verbo-notif-row border-b border-border last:border-b-0"
                  style={{ "--verbo-notif-i": Math.min(i, 6) } as React.CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => onClickItem(n)}
                    className={`verbo-notif-item verbo-notif-press flex w-full items-start gap-3 px-4 py-3 text-left transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:bg-secondary/60 ${
                      n.read ? "" : "bg-accent/5"
                    }`}
                  >
                    {(() => {
                      const meta = NOTIF_KIND_META[n.kind] ?? { icon: Bell, color: TONE.neutral };
                      const Icon = meta.icon;
                      return (
                        <span
                          aria-hidden="true"
                          className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                      );
                    })()}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`verbo-notif-dot h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent ${
                            n.read ? "scale-50 opacity-0" : "scale-100 opacity-100"
                          }`}
                        />
                        <div className={`text-sm ${n.read ? "text-muted-foreground" : "font-semibold text-foreground"}`}>
                          {n.title}
                        </div>
                      </div>
                      {n.body && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {notifications.length > MAX_VISIBLE && (
            <div className="border-t border-border bg-secondary/30 px-4 py-2 text-center text-[11px] text-muted-foreground">
              Showing the {MAX_VISIBLE} most recent.
            </div>
          )}
        </div>
      )}

      {sharedModal && (
        <SharedResultModal
          studentId={sharedModal.studentId}
          challengeId={sharedModal.challengeId}
          onClose={() => setSharedModal(null)}
        />
      )}

      {badgeModal && (
        <BadgeUnlockModal
          badge={badgeModal}
          studentId={user.id}
          onClose={() => {
            markBadgeUnlockSeen(user.id, badgeModal.storageId);
            setBadgeModal(null);
          }}
        />
      )}

      {prepModalSessionId && (() => {
        const session = loadSessions().find((s) => s.id === prepModalSessionId);
        const plan = getLessonPlan(prepModalSessionId);
        if (!session || !plan) return null;
        return (
          <SessionPrepModal
            session={session}
            plan={plan}
            onClose={() => setPrepModalSessionId(null)}
          />
        );
      })()}
    </div>

  );
}
