// Core plan freemium flow — 3 modals interposed between a Core student and
// the normal reserve/request flow for Insights, Book Clubs, and Spotlight
// Sessions. Backed by `core-freemium-store` (one-shot credit + silence flag,
// scoped to student_id × kind, never resets).
//
// Usage:
//   const gate = useCoreFreemiumGate(user);
//   ...
//   gate.tryOpen("insight", () => setClubModal(club));   // or spotlight, book
//   ...
//   {gate.node}
//
// If the student is not Core, `tryOpen` immediately calls the proceed
// callback — the gate is invisible. Silenced kinds should already be
// filtered out of the UI upstream, so `tryOpen` is never called for them;
// as a safety net we also short-circuit.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, Gift, Lock, Sparkles } from "lucide-react";
import { Confetti } from "./Confetti";
import {
  hasCreditUsed,
  isSilenced,
  markSilenced,
  useFreemium,
  type FreemiumKind,
} from "@/lib/core-freemium-store";
import { PLAN_DEFAULTS } from "@/lib/club-bookings-store";


const LABELS: Record<FreemiumKind, string> = {
  insight: "Insight session",
  book: "Book Club seat",
  spotlight: "Spotlight Session",
};

type Step =
  | { kind: FreemiumKind; step: "welcome"; onProceed: () => void }
  | { kind: FreemiumKind; step: "used"; onProceed: () => void }
  | { kind: FreemiumKind; step: "farewell" };

export function useCoreFreemiumGate(user: { id: string; access_plan?: string } | null | undefined) {
  const [state, setState] = useState<Step | null>(null);
  // Re-render when the underlying store changes (used/silenced flags).
  useFreemium();

  const isCore = user?.access_plan === "Core";

  const tryOpen = (kind: FreemiumKind, onProceed: () => void) => {
    if (!user || !isCore) { onProceed(); return; }
    if (isSilenced(user.id, kind)) { onProceed(); return; }
    if (hasCreditUsed(user.id, kind)) {
      setState({ kind, step: "used", onProceed });
    } else {
      setState({ kind, step: "welcome", onProceed });
    }
  };

  const close = () => setState(null);

  const claim = () => {
    if (!state || state.step !== "welcome" || !user) return;
    // NOTE: credit is NOT consumed here — only when the underlying
    // reservation/request is actually confirmed (reserveSeat in
    // club-bookings-store, or the Spotlight submit in student.sessions).
    // If the student closes the next modal without confirming, the
    // courtesy credit stays intact for a future attempt.
    const proceed = state.onProceed;
    setState(null);
    proceed();
  };


  const dismissUsed = (silence: boolean) => {
    if (!state || state.step !== "used" || !user) return;
    if (silence) {
      markSilenced(user.id, state.kind);
      setState({ kind: state.kind, step: "farewell" });
    } else {
      setState(null);
    }
  };

  const node = state ? (
    state.step === "welcome" ? (
      <WelcomeModal kind={state.kind} onClose={close} onClaim={claim} />
    ) : state.step === "used" ? (
      <UsedModal kind={state.kind} onClose={close} onDismiss={dismissUsed} />
    ) : (
      <FarewellModal onClose={close} />
    )
  ) : null;

  return { tryOpen, node };
}

// ---------------------------------------------------------------------------
// Modal 1 — welcome / claim your free credit
// ---------------------------------------------------------------------------
function WelcomeModal({
  kind, onClose, onClaim,
}: { kind: FreemiumKind; onClose: () => void; onClaim: () => void }) {
  const label = LABELS[kind];
  return (
    <div className="verbo-overlay-in fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card p-6 shadow-floating">
        <Confetti />
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="relative flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Gift className="h-7 w-7" />
          </div>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">A gift, just for you</h3>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Thank you for trusting Verbo. As a welcome gift, this {label} is on us — completely free.
          </p>
          <button
            onClick={onClaim}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#f38934] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> Claim it
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal 2 — credit already used / upgrade CTA
// ---------------------------------------------------------------------------
function UsedModal({
  kind, onClose, onDismiss,
}: {
  kind: FreemiumKind;
  onClose: () => void;
  onDismiss: (silence: boolean) => void;
}) {
  const label = LABELS[kind];
  const [silence, setSilence] = useState(false);

  const adv = PLAN_DEFAULTS.Advance;
  const eli = PLAN_DEFAULTS.Elite;
  const advLine = `${adv.insight} Insight${adv.insight === 1 ? "" : "s"} + ${adv.book} Book Club${adv.book === 1 ? "" : "s"} + ${adv.spotlight} Spotlight every month`;
  const eliLine = `${eli.insight} Insights + ${eli.book} Book Clubs + ${eli.spotlight} Spotlights every month, accumulating`;

  const done = (path: "close" | "upgrade") => {
    const silenceIt = silence;
    onDismiss(silenceIt);
    // Navigation for "upgrade" happens inside the <Link> — nothing else to do.
    void path;
  };

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Lock className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">You've already used your free {label}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your Core plan includes one complimentary {label} per contract, and you've used it. Upgrading your plan unlocks ongoing access.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-lg bg-secondary/50 p-3 text-xs">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">Advance</span>
            <span className="text-muted-foreground">{advLine}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">Elite</span>
            <span className="text-muted-foreground">{eliLine}</span>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={silence}
            onChange={(e) => setSilence(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border"
          />
          Don't show this again for {label}
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            onClick={() => done("close")}
            className="flex-1 cursor-pointer rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Maybe later
          </button>
          <Link
            to="/student/access-levels"
            onClick={() => done("upgrade")}
            className="flex-1 cursor-pointer rounded-lg bg-[#f38934] px-4 py-2 text-center text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            See upgrade options
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal 3 — farewell (fires once, after "don't show again" is checked)
// ---------------------------------------------------------------------------
function FarewellModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="verbo-overlay-in fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">You're all set</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          If you ever want more Insights, Book Clubs, or Spotlight Sessions, you can upgrade your plan anytime from Access Levels.
        </p>
        <div className="mt-6">
          <Link
            to="/student/access-levels"
            onClick={onClose}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#f38934] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Got it
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Helper mirroring the `AccessKind` in club-bookings-store, converting the
 *  calendar event kind into the freemium kind. */
export function calendarKindToFreemium(kind: "insight" | "book_club" | "spotlight"): FreemiumKind {
  return kind === "book_club" ? "book" : kind;
}
