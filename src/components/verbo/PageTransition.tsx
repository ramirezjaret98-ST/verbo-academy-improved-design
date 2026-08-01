import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Purely visual route-entrance wrapper.
 *
 * Re-keys its content on pathname change so the entering page fades and
 * lifts into place. There is no exit animation on purpose: waiting for an
 * outgoing transition makes tab navigation feel slower, not more premium.
 *
 * The animation class is removed as soon as the entrance ends. A lingering
 * transform on this wrapper would turn it into a containing block for every
 * `position: fixed` descendant, which clipped modal backdrops to the page box
 * and centered dialogs on the document instead of the viewport.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [animating, setAnimating] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAnimating(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnimating(false), 320);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname]);

  return (
    <div key={pathname} className={animating ? "verbo-route-in" : undefined}>
      {children}
    </div>
  );
}
