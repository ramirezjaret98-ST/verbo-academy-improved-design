// Per-page Verbot help button: a small floating icon fixed to the bottom-right
// corner of the page. Never opens its guided tour on its own — the student
// always has to tap it. The one exception is a short, dismissible speech
// bubble that can auto-peek once (see `autoNudge`), which only *invites* a
// click, it never starts the tour by itself.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import contactIcon from "@/assets/contact.svg";
import { useAuth } from "@/lib/auth";
import { hasSeenTour, markTourSeen } from "@/lib/tour-seen-store";
import { GuidedTour, type TourStep } from "@/components/verbo/GuidedTour";
import verbotHi from "@/assets/Verbot_hi.svg";

export function VerbotHelpBubble({
  tourId,
  steps,
  nudgeText,
  artSrc = verbotHi,
}: {
  /** Unique id for this page's tour, used to key the one-time nudge in localStorage. */
  tourId: string;
  steps: TourStep[];
  /** Copy for the one-time auto-peek speech bubble. Omit to stay fully silent. */
  nudgeText?: string;
  artSrc?: string;
}) {
  const { user } = useAuth();
  const [tourOpen, setTourOpen] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);

  // Auto-peek the nudge bubble once per student per page — never the full tour.
  useEffect(() => {
    if (!user?.id || !nudgeText) return;
    const nudgeId = `${tourId}:nudge`;
    if (hasSeenTour(user.id, nudgeId)) return;
    const t = window.setTimeout(() => {
      setNudgeOpen(true);
      markTourSeen(user.id, nudgeId);
    }, 900);
    return () => window.clearTimeout(t);
  }, [user?.id, tourId, nudgeText]);

  if (!user) return null;

  return (
    <>
      {/* z-40 (same as TopNav) so it never floats above session modals, which
       *  range from z-50 to z-[70] — the idle button/nudge should always sit
       *  behind those, only the active tour itself (z-[80]) goes on top. */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {nudgeOpen && (
          <div className="verbo-overlay-in flex items-start gap-2 rounded-2xl bg-card p-3 pr-2 shadow-floating" style={{ maxWidth: 240 }}>
            <p className="pt-0.5 text-xs font-medium leading-snug text-foreground">{nudgeText}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={(e) => { e.stopPropagation(); setNudgeOpen(false); }}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => { setNudgeOpen(false); setTourOpen(true); }}
          aria-label="Ask Verbot for help on this page"
          title="Need help here?"
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-floating transition-transform duration-200 ease-out hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5fca16]/70 motion-reduce:transition-none motion-reduce:hover:scale-100"
          style={{ boxShadow: "0 8px 24px rgba(1,48,74,0.22)" }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ boxShadow: "0 0 18px 6px rgba(95,202,22,0.35)", backgroundColor: "rgba(95,202,22,0.14)" }}
          />
          <img src={contactIcon} alt="" aria-hidden className="relative h-9 w-9 select-none object-contain" />
        </button>
      </div>

      <GuidedTour
        steps={steps}
        active={tourOpen}
        onClose={() => setTourOpen(false)}
        onFinish={() => setTourOpen(false)}
        artSrc={artSrc}
        accent="#01304a"
      />
    </>
  );
}
