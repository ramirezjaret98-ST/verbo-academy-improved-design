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

/** Grid of summary/stat card placeholders used by the role dashboards. */
export function SkeletonStatCards({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-label="Loading dashboard">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-5" aria-hidden>
          <div className="flex items-start justify-between gap-3">
            <SkeletonBlock height={10} width="45%" rounded="rounded-full" />
            <SkeletonBlock height={36} width={36} rounded="rounded-xl" />
          </div>
          <div className="mt-6">
            <SkeletonBlock height={30} width="50%" />
          </div>
          <div className="mt-3">
            <SkeletonBlock height={8} width="70%" rounded="rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full-page app shell placeholder: sidebar + header + content blocks. */
export function SkeletonAppShell() {
  return (
    <div className="flex h-full w-full gap-4 p-4" role="status" aria-label="Loading Verbo Academy">
      <div className="hidden w-56 shrink-0 space-y-3 rounded-2xl border border-border bg-card p-4 md:block">
        <SkeletonBlock height={32} width="70%" rounded="rounded-xl" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} height={14} rounded="rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <SkeletonBlock height={16} width="30%" rounded="rounded-full" />
          <div className="flex items-center gap-3">
            <SkeletonBlock height={32} width={32} rounded="rounded-xl" />
            <SkeletonAvatar size={36} />
          </div>
        </div>
        <SkeletonStatCards count={4} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" />
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard className="lg:col-span-2" lines={4} />
          <SkeletonCard lines={3} withAvatar={false} />
        </div>
      </div>
    </div>
  );
}
