// Bell icon in the top nav — renders a dropdown of internal notifications
// derived from existing stores. Click an item to navigate to its route and
// mark it read. See src/lib/notifications-store.ts for source of truth.
import { useEffect, useRef, useState } from "react";
import { Bell, X, ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  useNotifications, markNotificationRead, markAllNotificationsRead,
  type Notification,
} from "@/lib/notifications-store";
import { USERS } from "@/lib/mock-data";
import { loadChallenges } from "@/lib/challenges-store";
import { Pill } from "@/components/verbo/ui";
import { BadgeUnlockModal } from "@/components/verbo/BadgeUnlockCelebration";
import { computeAllEarnedBadges, type UnlockBadge } from "@/lib/badge-unlock";
import { markBadgeUnlockSeen } from "@/lib/badge-unlock-seen-store";

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
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
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
    if (n.kind === "badge_unlocked" && n.data?.badgeStorageId) {
      const student = USERS.find((u) => u.id === user.id);
      const badge = student
        ? computeAllEarnedBadges(student).find((b) => b.storageId === n.data!.badgeStorageId)
        : undefined;
      if (badge) setBadgeModal(badge);
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
        className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors ${
          isDark
            ? "text-[#94a3b8] hover:text-[#f38934]"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Bell className="h-4 w-4" />
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-elevated"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">Notifications</div>
            <button
              type="button"
              onClick={markAll}
              disabled={!hasUnread}
              className="text-xs font-medium text-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {visible.map((n) => (
                <li key={n.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onClickItem(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60 ${
                      n.read ? "" : "bg-accent/5"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                        n.read ? "bg-transparent" : "bg-accent"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${n.read ? "text-muted-foreground" : "font-semibold text-foreground"}`}>
                        {n.title}
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
    </div>

  );
}
