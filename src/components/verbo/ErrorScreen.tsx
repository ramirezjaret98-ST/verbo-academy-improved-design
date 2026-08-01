import type { ReactNode } from "react";
import { PrimaryButton, GhostButton } from "@/components/verbo/ui";
import verbotError from "@/assets/Verbot_error.svg.asset.json";

/** Navy used across the brand for primary actions. */
const NAVY = "#01304a";

export interface ErrorScreenAction {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * Shared full-screen state used for 404, expired session, generic errors,
 * frozen accounts and unsupported (mobile) devices. One layout for all five —
 * only the copy and the CTAs change.
 */
export function ErrorScreen({
  title,
  body,
  action,
  secondaryAction,
  children,
}: {
  title: string;
  body: string;
  action?: ErrorScreenAction;
  secondaryAction?: ErrorScreenAction;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-6 py-16">
      {/* Soft navy blob behind the content — no hard edges, no glass. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(1,48,74,0.10) 0%, rgba(1,48,74,0.05) 45%, rgba(1,48,74,0) 72%)" }}
      />

      <div className="verbo-error-enter motion-reduce:animate-none relative flex max-w-md flex-col items-center text-center">
        {/* Mascot — cropped from the top, same treatment as the other Verbots. */}
        <div className="mb-6 h-40 w-40 overflow-hidden sm:h-48 sm:w-48">
          <img
            src={verbotError.url}
            alt=""
            aria-hidden
            className="h-auto w-full -translate-y-[6%] select-none object-contain"
          />
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground" style={{ fontFamily: "Montserrat, sans-serif" }}>
          {body}
        </p>

        {(action || secondaryAction) && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {action && (
              <PrimaryButton accentColor={NAVY} onClick={action.onClick} disabled={action.disabled}>
                {action.label}
              </PrimaryButton>
            )}
            {secondaryAction && (
              <GhostButton onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
                {secondaryAction.label}
              </GhostButton>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
