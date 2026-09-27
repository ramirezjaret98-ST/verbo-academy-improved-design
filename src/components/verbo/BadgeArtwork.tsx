import { useEffect, useRef, useState } from "react";
import { staticBadgeArtwork } from "@/lib/badge-artwork";

/** Keep locked/offscreen badges still; artwork never embeds student state. */
export function BadgeArtwork({
  src,
  alt,
  className,
  animated = true,
}: {
  src: string;
  alt: string;
  className?: string;
  animated?: boolean;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!preference.matches && document.visibilityState === "visible");
    update();
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <img
      ref={ref}
      src={animated && visible && motion ? src : staticBadgeArtwork(src)}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
