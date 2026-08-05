import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Reusable skeleton loaders (visual only)                                     */
/* Shimmer sweep on light grey; prefers-reduced-motion → subtle opacity pulse. */
/* -------------------------------------------------------------------------- */

/** True once the client has hydrated — the real (brief) "not ready yet" moment. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

interface BlockProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: string;
}

export function SkeletonBlock({ className = "", width, height = 16, rounded = "rounded-md" }: BlockProps) {
  return (
    <div
      aria-hidden
      className={`verbo-skeleton ${rounded} ${className}`}
      style={{ width: width ?? "100%", height }}
    />
  );
}

export function SkeletonText({ lines = 1, className = "", width }: { lines?: number; className?: string; width?: string | number }) {
  if (lines === 1) return <SkeletonBlock className={className} width={width} height={10} rounded="rounded-full" />;
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock key={i} height={10} rounded="rounded-full" width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <SkeletonBlock className={className} rounded="rounded-full" width={size} height={size} />;
}

/** Card-shaped placeholder: header row (avatar + title) plus content lines. */
export function SkeletonCard({
  className = "",
  lines = 3,
  withAvatar = true,
  height,
}: { className?: string; lines?: number; withAvatar?: boolean; height?: number | string }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 ${className}`}
      style={height ? { minHeight: height } : undefined}
      aria-hidden
    >
      <div className="flex items-center gap-3">
        {withAvatar && <SkeletonAvatar size={40} />}
        <div className="flex-1 space-y-2">
          <SkeletonBlock height={10} width="45%" rounded="rounded-full" />
          <SkeletonBlock height={8} width="30%" rounded="rounded-full" />
        </div>
      </div>
      <div className="mt-5">
        <SkeletonBlock height={28} width="55%" />
      </div>
      <div className="mt-4">
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

/** Grid of hero/stat card placeholders. Mirrors `HeroStatCard`: rounded-[2rem]
 *  surface, min-h-[168px], padding 24px, big value on the left and a circular
 *  glyph (StatRing / icon) on the right. */
export function SkeletonStatCards({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-label="Loading dashboard">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="shadow-card relative flex min-h-[168px] items-center overflow-hidden rounded-[2rem] border border-border bg-card px-6 py-6"
          aria-hidden
        >
          <div className="w-full">
            <SkeletonBlock height={10} width="45%" rounded="rounded-full" />
            <div className="mt-3">
              <SkeletonBlock height={38} width="40%" />
            </div>
            <div className="mt-3">
              <SkeletonBlock height={8} width="60%" rounded="rounded-full" />
            </div>
          </div>
          {/* Circle where the real cards render a StatRing / icon glyph. */}
          <div className="absolute right-6 top-6">
            <SkeletonAvatar size={52} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full-page app shell placeholder. The app has NO sidebar: every role layout
 *  is a fixed TopNav plus a single `mx-auto w-full max-w-7xl` column, so the
 *  skeleton reproduces exactly that geometry (including the pt-24 offset). */
export function SkeletonAppShell() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f4f6f8" }} role="status" aria-label="Loading Verbo Academy">
      {/* Top navigation bar */}
      <div className="fixed inset-x-0 top-0 z-30 h-16 border-b border-border bg-card">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-6">
          <SkeletonBlock height={22} width={132} rounded="rounded-lg" />
          <div className="hidden items-center gap-6 md:flex">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} height={10} width={78} rounded="rounded-full" />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <SkeletonBlock height={32} width={32} rounded="rounded-xl" />
            <SkeletonAvatar size={36} />
          </div>
        </div>
      </div>

      {/* Same container the real pages use */}
      <main className="mx-auto w-full max-w-7xl pt-24 pb-10">
        <div className="px-6">
          <div className="space-y-2">
            <SkeletonBlock height={26} width="34%" rounded="rounded-lg" />
            <SkeletonBlock height={10} width="22%" rounded="rounded-full" />
          </div>
          <SkeletonStatCards count={4} className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4" />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <SkeletonCard className="lg:col-span-2" lines={4} />
            <SkeletonCard lines={3} withAvatar={false} />
          </div>
        </div>
      </main>
    </div>
  );
}

