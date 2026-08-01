// Badge unlock celebration — generic for ANY badge (core Challenge badges,
// Lightning Bolt, Season badges, and Profile Badges). BadgeUnlockWatcher is
// mounted once in the student layout and detects, for the current student, any
// earned badge that hasn't had its unlock celebration shown yet. One at a time
// (queued). CSS-only animation, respects prefers-reduced-motion.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Award, Lock, Medal, X, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { USERS } from "@/lib/mock-data";
import { subscribeStudents } from "@/lib/students-store";
import { subscribeBadges as subscribeChallengeBadges } from "@/lib/badges-store";
import { subscribeBadges as subscribeProfileBadges } from "@/lib/profile-badges-store";
import { subscribeSeasons } from "@/lib/flash-challenges-store";
import { subscribeCourses } from "@/lib/product-courses-store";
import { computeAllEarnedBadges, type UnlockBadge } from "@/lib/badge-unlock";
import {
  loadEquippedChallengeBadgeIds,
  setEquippedChallengeBadgeIds,
  EQUIPPED_MAX as EQUIPPED_CHALLENGE_MAX,
} from "@/lib/equipped-challenge-badges-store";
import {
  loadEquippedBadgeIds,
  setEquippedBadgeIds,
  EQUIPPED_MAX,
} from "@/lib/equipped-profile-badges-store";
import { hasSeenBadgeUnlock, markBadgeUnlockSeen } from "@/lib/badge-unlock-seen-store";

type StudentLike = (typeof USERS)[number];

const ICON_BY_KIND: Record<UnlockBadge["iconKind"], ReactNode> = {
  award: <Award className="h-12 w-12 text-amber-500" strokeWidth={1.6} />,
  zap: <Zap className="h-12 w-12 text-amber-500" strokeWidth={1.6} />,
  medal: <Medal className="h-12 w-12 text-amber-500" strokeWidth={1.6} />,
};

export function BadgeUnlockModal({

  badge,
  studentId,
  onClose,
}: {
  badge: UnlockBadge;
  studentId: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"lock-break" | "burst" | "zoom-shine" | "settled">("lock-break");
  const [equipTick, setEquipTick] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase("settled");
      return;
    }
    setPhase("lock-break");
    const t1 = window.setTimeout(() => setPhase("burst"), 450);
    const t2 = window.setTimeout(() => setPhase("zoom-shine"), 450 + 600);
    const t3 = window.setTimeout(() => setPhase("settled"), 450 + 600 + 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [badge.storageId]);

  const equipped = useMemo(() => {
    void equipTick;
    return badge.kind === "profile"
      ? loadEquippedBadgeIds(studentId).includes(badge.equipId)
      : loadEquippedChallengeBadgeIds(studentId).includes(badge.equipId);
  }, [badge, studentId, equipTick]);

  const toggleEquip = () => {
    if (badge.kind === "profile") {
      const cur = loadEquippedBadgeIds(studentId);
      const next = cur.includes(badge.equipId)
        ? cur.filter((id) => id !== badge.equipId)
        : [...cur, badge.equipId].slice(-EQUIPPED_MAX);
      setEquippedBadgeIds(studentId, next);
    } else {
      const cur = loadEquippedChallengeBadgeIds(studentId);
      const next = cur.includes(badge.equipId)
        ? cur.filter((id) => id !== badge.equipId)
        : [...cur, badge.equipId].slice(-EQUIPPED_CHALLENGE_MAX);
      setEquippedChallengeBadgeIds(studentId, next);
    }
    setEquipTick((t) => t + 1);
  };

  const settled = phase === "settled";
  const showLock = phase === "lock-break";

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[80] flex items-center justify-center verbo-backdrop p-4">
      <style>{`
        @keyframes verbo-unlock-lock-break {
          0% { opacity: 1; transform: scale(1) rotate(0deg); }
          40% { opacity: 1; transform: scale(1.15) rotate(-10deg); }
          100% { opacity: 0; transform: scale(0.6) rotate(12deg); }
        }
        @keyframes verbo-unlock-burst {
          0% { opacity: 0.9; transform: scale(0.3); }
          100% { opacity: 0; transform: scale(2.4); }
        }
        @keyframes verbo-unlock-zoom {
          0% { transform: scale(0.85); }
          55% { transform: scale(1.22); }
          100% { transform: scale(1); }
        }
        @keyframes verbo-unlock-shine {
          0% { transform: translateX(-140%) rotate(20deg); opacity: 0; }
          15% { opacity: 0.9; }
          55% { opacity: 0.9; }
          100% { transform: translateX(140%) rotate(20deg); opacity: 0; }
        }
        @keyframes verbo-badge-glow {
          0%, 100% { box-shadow: 0 0 0px 0px rgba(245,158,11,0), 0 2px 6px rgba(0,0,0,0.15); }
          50% { box-shadow: 0 0 14px 3px rgba(245,158,11,0.55), 0 2px 6px rgba(0,0,0,0.15); }
        }
        @media (prefers-reduced-motion: reduce) {
          .verbo-unlock-lock-break, .verbo-unlock-burst, .verbo-unlock-zoom, .verbo-unlock-shine, .verbo-badge-glow {
            animation: none !important;
          }
        }
      `}</style>

      <div className="verbo-modal-in relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Badge unlocked!
        </p>

        <div className="relative mx-auto mt-6 flex h-40 w-40 items-center justify-center">
          {phase === "burst" && (
            <span
              className="verbo-unlock-burst pointer-events-none absolute inset-0 rounded-full bg-amber-300/60 blur-xl"
              style={{ animation: "verbo-unlock-burst 600ms ease-out forwards" }}
            />
          )}

          <div
            className="verbo-unlock-zoom group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-amber-300/70 bg-amber-50"
            style={{
              animation: settled
                ? "verbo-badge-glow 2.4s ease-in-out infinite"
                : phase === "zoom-shine"
                  ? "verbo-unlock-zoom 900ms cubic-bezier(0.22,1,0.36,1) forwards"
                  : undefined,
            }}
          >
            {badge.image ? (
              <img src={badge.image} alt={badge.name} className="h-full w-full object-cover" />
            ) : (
              ICON_BY_KIND[badge.iconKind]
            )}

            {phase === "zoom-shine" && (
              <span
                className="verbo-unlock-shine pointer-events-none absolute inset-y-[-40%] left-0 w-1/3 bg-white/70 blur-md"
                style={{ animation: "verbo-unlock-shine 900ms ease-out forwards" }}
              />
            )}

            {showLock && (
              <span
                className="verbo-unlock-lock-break absolute inset-0 flex items-center justify-center rounded-full bg-black/25 backdrop-blur-[1px]"
                style={{ animation: "verbo-unlock-lock-break 450ms ease-in forwards" }}
              >
                <Lock className="h-10 w-10 text-white" strokeWidth={2} />
              </span>
            )}

            {settled && (
              <button
                type="button"
                onClick={toggleEquip}
                className="absolute inset-0 hidden items-center justify-center bg-black/35 text-xs font-semibold text-white backdrop-blur-[2px] group-hover:flex"
              >
                {equipped ? "Unequip" : "Equip now"}
              </button>
            )}
          </div>
        </div>

        <h3 className="mt-5 text-2xl font-black tracking-tight text-foreground">{badge.name}</h3>

        <p className="mt-1 text-sm text-muted-foreground">
          {equipped ? "Equipped — showing on your Dashboard." : "You just earned a new badge."}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={toggleEquip}
            className={`verbo-press w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              equipped
                ? "bg-muted text-foreground hover:bg-muted/80"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {equipped ? "Equipped ✓" : "Equip"}
          </button>
          <Link
            to="/student/challenges"
            onClick={onClose}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Explore more badges
          </Link>
        </div>
      </div>
    </div>
  );
}

export function BadgeUnlockWatcher() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const [current, setCurrent] = useState<UnlockBadge | null>(null);

  const student =
    user && user.role === "student" ? ((USERS.find((u) => u.id === user.id) ?? user) as StudentLike) : null;
  const studentId = student?.id;

  useEffect(() => {
    if (!studentId) return;
    const bump = () => setTick((t) => t + 1);
    const uns = [
      subscribeStudents(bump),
      subscribeChallengeBadges(bump),
      subscribeProfileBadges(bump),
      subscribeSeasons(bump),
      subscribeCourses(bump),
    ];
    return () => uns.forEach((u) => u());
  }, [studentId]);

  useEffect(() => {
    if (!student || current) return;
    void tick;
    const earned = computeAllEarnedBadges(student);
    const next = earned.find((b) => !hasSeenBadgeUnlock(student.id, b.storageId));
    if (next) setCurrent(next);
  }, [tick, student, current]);

  if (!student || !current) return null;

  return (
    <BadgeUnlockModal
      badge={current}
      studentId={student.id}
      onClose={() => {
        markBadgeUnlockSeen(student.id, current.storageId);
        setCurrent(null);
      }}
    />
  );
}
