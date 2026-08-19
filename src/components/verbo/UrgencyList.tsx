// 2026-08-19: extracted from admin.index.tsx (Dashboard) alongside
// src/lib/urgent-items.ts, so the Tablet quick-actions view can render the
// exact same "needs immediate action" cards without duplicating the JSX.
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { UrgencyItem } from "@/lib/urgent-items";

export function UrgencyRow({ item }: { item: UrgencyItem }) {
  const Icon = item.icon;
  return (
    <button
      onClick={item.onClick}
      className="group flex w-full items-stretch overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:bg-secondary/40"
    >
      <span className="w-1.5 shrink-0" style={{ background: item.accent }} aria-hidden />
      <span className="flex flex-1 items-center gap-3 py-3 pl-3 pr-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.glow ? "animate-report-glow" : ""}`}
          style={{ background: `${item.accent}1f` }}
        >
          <Icon className="h-4 w-4" style={{ color: item.accent }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${item.accent}1f`, color: item.accent }}
        >
          {item.badge}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors group-hover:bg-secondary">
          {item.ctaLabel} <ChevronRight className="h-3 w-3" />
        </span>
      </span>
    </button>
  );
}

export function UrgencyList({ items, empty }: { items: UrgencyItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CheckCircle2 className="mb-2 h-8 w-8 text-success" />
        <p className="text-sm font-medium text-foreground">{empty}</p>
      </div>
    );
  }
  return <div className="space-y-2">{items.map((it) => <UrgencyRow key={it.id} item={it} />)}</div>;
}
