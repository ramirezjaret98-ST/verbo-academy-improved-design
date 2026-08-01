import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { UserRound, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCountUp } from "@/lib/use-count-up";

/** Watermark variants supported by AccentModalHeader. */
export type AccentWatermark =
  | { type: "text"; value: string }
  | { type: "icon"; icon: LucideIcon }
  | { type: "image"; src: string };

/**
 * Shared compact modal header with a solid/gradient accent background,
 * animated decorative blobs, a bleeding watermark and a white logo square.
 * Visual language mirrors the ChallengeDetail modal header.
 */
export function AccentModalHeader({
  background,
  iconTint,
  icon: Icon,
  eyebrow,
  title,
  watermark,
  onClose,
  textTone = "light",
  logoSrc,
}: {
  background: string;
  iconTint: string;
  icon?: LucideIcon;
  eyebrow: string;
  title: ReactNode;
  watermark?: AccentWatermark;
  onClose: () => void;
  /** "dark" for light/white header backgrounds. */
  textTone?: "light" | "dark";
  /** Optional image logo rendered instead of the white icon square. */
  logoSrc?: string;
}) {

  const dark = textTone === "dark";
  const blobA = dark
    ? "radial-gradient(circle, rgba(1,48,74,0.10), transparent 70%)"
    : "radial-gradient(circle, rgba(255,255,255,0.45), transparent 70%)";
  const blobB = dark
    ? "radial-gradient(circle, rgba(1,48,74,0.07), transparent 70%)"
    : "radial-gradient(circle, rgba(0,0,0,0.35), transparent 70%)";
  return (
    <div
      className={`relative overflow-hidden px-4 py-3 shrink-0 ${dark ? "border-b border-border" : ""}`}
      style={{ background }}
    >
      {/* Decorative blobs */}
      <div
        className="vc-blob pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full blur-2xl"
        style={{ background: blobA }}
        aria-hidden
      />
      <div
        className="vc-blob pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full blur-2xl"
        style={{ background: blobB, animationDelay: "0.1s" }}
        aria-hidden
      />
      {/* Watermark bleeding out of the top-right corner, behind everything */}
      {watermark && watermark.type !== "image" && (
        <div className="pointer-events-none absolute -right-4 -top-4 select-none" aria-hidden>
          {watermark.type === "text" && (
            <span className={`block text-[92px] font-black uppercase leading-none tracking-tighter ${dark ? "text-[#01304a]/10" : "text-white/10"}`}>
              {watermark.value}
            </span>
          )}
          {watermark.type === "icon" && (
            <watermark.icon className={`h-[92px] w-[92px] ${dark ? "text-[#01304a]/[0.12]" : "text-white/[0.14]"}`} strokeWidth={1.5} />
          )}
        </div>
      )}
      {/* Image watermark: anchored to the right, flush with the header bottom.
       *  It is taller than the header so the lower half gets clipped away. */}
      {watermark && watermark.type === "image" && (
        <img
          src={watermark.src}
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-1 top-1 h-[230%] w-auto select-none object-contain object-top opacity-[0.28]"
        />
      )}

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          {logoSrc ? (
            <img src={logoSrc} alt="" aria-hidden className="h-10 w-10 object-contain" />
          ) : Icon ? (
            <div className={`vc-logo flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm ${dark ? "bg-[var(--navy-50,#f1f5f9)] border border-border" : "bg-white"}`}>
              <Icon className="h-5 w-5" style={{ color: iconTint }} />
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`rounded-full border p-1.5 transition-colors ${
              dark
                ? "border-[#01304a]/25 text-[#01304a]/70 hover:bg-[#01304a]/10 hover:text-[#01304a]"
                : "border-white/40 text-white/80 hover:bg-white/15 hover:text-white"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className={`vc-rise mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] ${dark ? "text-[#01304a]/70" : "text-white/70"}`}
          style={{ animationDelay: "0.15s" }}
        >
          {eyebrow}
        </div>
        <h2
          className={`vc-rise mt-1 text-lg font-semibold tracking-tight ${dark ? "text-[#01304a]" : "text-white"}`}
          style={{ animationDelay: "0.2s" }}
        >
          {title}
        </h2>
      </div>
    </div>
  );
}

/**
 * Reusable modal wrapper: fixed backdrop + card + AccentModalHeader already mounted.
 * Same visual language the Student Panel modals use today.
 */
export function AccentModal({
  background,
  iconTint,
  icon,
  eyebrow,
  title,
  watermark,
  onClose,
  textTone = "light",
  logoSrc,
  maxWidth = "max-w-md",
  zClass = "z-50",
  children,
}: {
  background: string;
  iconTint: string;
  icon?: LucideIcon;
  eyebrow: string;
  title: ReactNode;
  watermark?: AccentWatermark;
  onClose: () => void;
  textTone?: "light" | "dark";
  /** Optional image logo rendered instead of the white icon square. */
  logoSrc?: string;
  /** Tailwind max-width class for the card. */
  maxWidth?: string;
  /** Tailwind z-index class, for modals stacked on top of another modal. */
  zClass?: string;
  children: ReactNode;
}) {

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center verbo-backdrop p-4`}
      onClick={onClose}
    >
      <div
        className={`relative w-full ${maxWidth} flex max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-card shadow-floating`}
        onClick={(e) => e.stopPropagation()}
      >
        <AccentModalHeader
          background={background}
          iconTint={iconTint}
          icon={icon}
          eyebrow={eyebrow}
          title={title}
          watermark={watermark}
          onClose={onClose}
          textTone={textTone}
          logoSrc={logoSrc}
        />

        <div className="report-modal-scroll min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Bottom action bar for AccentModal bodies. `accent` is the header color, for accented buttons. */
export function AccentModalFooter({
  accent,
  children,
  className = "",
}: {
  accent?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-end gap-3 border-t border-border bg-secondary/30 p-4 ${className}`}
      style={accent ? { borderTopColor: accent } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Stats row with icons, designed to replace plain Date/Time rectangles in modals.
 * Icon on top, large value in the middle, small label below; vertical dividers between columns.
 */
export function InfoStatRow({
  items,
}: {
  items: { icon: LucideIcon; value: ReactNode; label: string; tint?: string }[];
}) {
  return (
    <div className="flex items-stretch divide-x divide-border rounded-xl border border-border bg-secondary/30 py-3">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div key={i} className="flex flex-1 flex-col items-center justify-center px-2 text-center">
            <Icon className="h-4 w-4" style={{ color: item.tint ?? "var(--muted-foreground)" }} />
            <div className="mt-1 text-sm font-semibold text-foreground">{item.value}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Shared hero KPI card shell (Current Level / Level Progress / Overall
 * Attendance on the student dashboard). Renders only the styled inner card —
 * the clickable wrapper (Link or role="button") stays with the caller.
 */
export function HeroStatCard({
  className = "",
  style,
  decorative,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  decorative?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`shadow-card verbo-card-hover relative flex h-full min-h-[168px] items-center overflow-hidden rounded-[2rem] px-6 py-6 ${className}`}
      style={style}
    >
      {decorative}
      {children}
    </div>
  );
}






// TODO: reemplazar con foto real
export function PhotoPlaceholder({
  className = "",
  tone = "light",
  shape = "rounded",
}: {
  className?: string;
  tone?: "light" | "dark";
  shape?: "rounded" | "circle";
}) {
  const bg = tone === "light" ? "bg-[var(--navy-100)]" : "bg-white/15";
  const iconColor = tone === "light" ? "text-[var(--navy-300)]" : "text-white/50";
  const radius = shape === "circle" ? "rounded-full" : "rounded-[1.75rem]";
  return (
    <div
      className={`flex items-center justify-center ${radius} ${bg} ${className}`}
      aria-hidden
    >
      <UserRound className={`h-10 w-10 ${iconColor}`} strokeWidth={1.5} />
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-border bg-card p-6 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Pill({ children, tone = "default", style }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "muted" | "elite"; style?: React.CSSProperties }) {
  const tones: Record<string, string> = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-foreground",
    danger: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
    elite: "bg-[var(--tier-elite-soft)] text-[var(--tier-elite)]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`} style={style}>
      {children}
    </span>
  );
}

export function PrimaryButton({
  children,
  className = "",
  accentColor,
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; accentColor?: string }) {
  return (
    <button
      {...rest}
      style={accentColor ? { background: accentColor, ...style } : style}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full ${accentColor ? "text-white" : "bg-accent text-accent-foreground"} px-4 py-2 text-sm font-medium shadow-soft transition-opacity hover:opacity-90 disabled:opacity-40 shadow-sm transition-transform duration-150 ease-out active:scale-[0.97] ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary transition-transform duration-150 ease-out active:scale-[0.97] ${className}`}
    >
      {children}
    </button>
  );
}

export function SuccessButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-success px-4 py-2 text-sm font-medium text-success-foreground shadow-soft transition-opacity hover:opacity-90 transition-transform duration-150 ease-out active:scale-[0.97] ${className}`}
    >
      {children}
    </button>
  );
}

/** Minimal SVG circular progress ring (right-aligned inside KPI cards). */
export function StatRing({
  value,
  size = 64,
  stroke = 6,
  label,
  trackColor = "rgba(1, 48, 74, 0.08)",
  progressColor = "#f38934",
  textColor = "#01304a",
  valueClassName,
}: { value: number; size?: number; stroke?: number; label?: ReactNode; trackColor?: string; progressColor?: string; textColor?: string; valueClassName?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Start at 0 on mount so the CSS transition also plays on first render.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  const offset = c - (shown / 100) * c;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={progressColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms ease" }}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center tabular-nums ${valueClassName ?? "text-[11px] font-semibold"}`} style={{ color: textColor }}>
        {label ?? `${Math.round(pct)}%`}
      </div>
    </div>
  );
}

/** Number that counts up to `value` on mount and on every change. */
export function AnimatedNumber({
  value,
  suffix,
  durationMs,
  className = "",
}: { value: number; suffix?: string; durationMs?: number; className?: string }) {
  const animated = useCountUp(value, durationMs);
  return (
    <span className={`tabular-nums ${className}`}>
      {animated}
      {suffix}
    </span>
  );
}



export function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-black">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
