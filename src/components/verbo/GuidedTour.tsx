// Reusable Verbot "guided tour" engine: a small sequence of steps that either
// (a) spotlight a real element on the page — data-tour="<id>" selector, dark
//     cutout overlay + a bubble from Verbot next to it — or (b) show a
//     centered welcome/closing card when a step has no `target`.
//
// Used by the automatic Dashboard welcome tour and by the on-demand,
// per-page Verbot help tours (see VerbotHelpBubble.tsx). No new dependency:
// built on `motion` (already installed) the same way routes/index.tsx does.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import { GhostButton, PrimaryButton } from "@/components/verbo/ui";

export interface TourStep {
  id: string;
  /** CSS selector for the real element to highlight. Omit for a centered card. */
  target?: string;
  eyebrow: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 10;

function measure(selector: string): Rect | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

export function GuidedTour({
  steps,
  active,
  onClose,
  onFinish,
  artSrc,
  accent = "#01304a",
}: {
  steps: TourStep[];
  active: boolean;
  /** Skip / Escape / backdrop click on a centered step. */
  onClose: () => void;
  /** "Done" on the final step. */
  onFinish: () => void;
  /** Verbot artwork shown on centered (no-target) steps. */
  artSrc: string;
  accent?: string;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const reduceMotion = useReducedMotion();
  const attempts = useRef(0);

  const step = steps[index];
  const isCentered = !step?.target;

  // Reset to the first step whenever the tour is (re)opened.
  useEffect(() => {
    if (active) setIndex(0);
  }, [active]);

  // Locate + track the target element for spotlighted steps: scrolls it into
  // view, then measures its rect and keeps it in sync on resize/scroll.
  // Retries briefly in case the element mounts a beat after the tour opens.
  useEffect(() => {
    if (!active || !step?.target) { setRect(null); return; }
    attempts.current = 0;
    let raf = 0;
    let cancelled = false;

    const tryMeasure = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(step.target!);
      if (!el) {
        attempts.current += 1;
        if (attempts.current < 20) { raf = requestAnimationFrame(tryMeasure); return; }
        // Couldn't find the target after ~1/3s — skip this step rather than
        // showing a spotlight pointing at nothing.
        setRect(null);
        setIndex((i) => (i < steps.length - 1 ? i + 1 : i));
        return;
      }
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      const settle = () => { if (!cancelled) setRect(measure(step.target!)); };
      window.setTimeout(settle, reduceMotion ? 0 : 260);
    };
    tryMeasure();

    const onViewportChange = () => setRect(measure(step.target!));
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose]);

  if (!active || !step) return null;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const next = () => (isLast ? onFinish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Bubble placement for spotlighted steps: below the target when there's
  // room, otherwise above it. Clamped horizontally so it never runs off-screen.
  const bubbleWidth = 320;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const below = rect ? rect.top + rect.height + 220 < vh : true;
  const bubbleStyle: React.CSSProperties | undefined = rect
    ? {
        position: "fixed",
        top: below ? rect.top + rect.height + 14 : undefined,
        bottom: below ? undefined : vh - rect.top + 14,
        left: Math.min(Math.max(rect.left, 16), vw - bubbleWidth - 16),
        width: bubbleWidth,
      }
    : undefined;

  const dots = (
    <div className="flex items-center justify-center gap-1.5">
      {steps.map((s, i) => (
        <span
          key={s.id}
          className="h-1.5 rounded-full transition-all duration-200"
          style={{
            width: i === index ? 16 : 6,
            backgroundColor: i === index ? accent : "color-mix(in oklab, #01304a 20%, transparent)",
          }}
        />
      ))}
    </div>
  );

  const footer = (
    <div className="mt-4 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onClose}
        className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Skip tour
      </button>
      {dots}
      <div className="flex items-center gap-2">
        {!isFirst && !isCentered && (
          <GhostButton onClick={back} className="!px-3 !py-1.5 text-xs">Back</GhostButton>
        )}
        <PrimaryButton onClick={next} accentColor={accent} className="!px-4 !py-1.5 text-xs">
          {isLast ? "Got it" : "Next"}
          {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
        </PrimaryButton>
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Verbot guided tour">
      {/* Full-screen click/scroll blocker with the spotlight cutout painted on it. */}
      <div className="absolute inset-0" onClick={isCentered ? onClose : undefined}>
        {isCentered ? (
          <div className="absolute inset-0 verbo-backdrop" style={{ background: "rgba(1,48,74,0.55)" }} />
        ) : (
          <AnimatePresence>
            {rect && (
              <motion.div
                key={step.id}
                className="absolute rounded-2xl"
                initial={false}
                animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 32 }}
                style={{ boxShadow: "0 0 0 9999px rgba(1,48,74,0.62)" }}
              />
            )}
          </AnimatePresence>
        )}
      </div>

      {isCentered ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div
            className="verbo-overlay-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-floating"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative px-5 pt-5">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <img src={artSrc} alt="" aria-hidden className="h-24 w-auto select-none" />
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: `color-mix(in oklab, ${accent} 70%, transparent)` }}>
                {step.eyebrow}
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight" style={{ color: accent }}>
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
            <div className="px-5 pb-5">{footer}</div>
          </div>
        </div>
      ) : rect ? (
        <div style={bubbleStyle} className="verbo-overlay-in pointer-events-auto">
          <div className="overflow-hidden rounded-2xl bg-card shadow-floating" style={{ boxShadow: `inset 0 2px 0 0 ${accent}` }}>
            <div className="p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: `color-mix(in oklab, ${accent} 70%, transparent)` }}>
                {step.eyebrow}
              </div>
              <h3 className="mt-1 text-sm font-semibold tracking-tight" style={{ color: accent }}>
                {step.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              {footer}
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
