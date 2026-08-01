import { useEffect, useRef, useState } from "react";

/** True when the user asked the OS to reduce motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animates an integer from its previous value (0 on first mount) up to `target`
 * with an ease-out curve. Respects `prefers-reduced-motion`.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced = prefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? target : 0);
  const fromRef = useRef(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / Math.max(1, durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + delta * eased;
      setDisplay(Math.round(current));
      fromRef.current = current;
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
        setDisplay(target);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);

  return display;
}
