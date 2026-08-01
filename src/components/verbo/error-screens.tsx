import { useRouter } from "@tanstack/react-router";
import { ErrorScreen } from "@/components/verbo/ErrorScreen";
import { useAuth } from "@/lib/auth";
import { openContactModal } from "@/lib/contact-modal";
import { ContactVerbotModal } from "@/components/verbo/ContactVerbotModal";
import type { User } from "@/lib/mock-data";

/** Home route of the currently logged-in role (login when signed out). */
export function roleHome(user: User | null): string {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin";
  if (user.role === "teacher") return "/teacher";
  return "/student";
}

/** Reacts to the frozen flag Admin sets manually — no new detection logic. */
export function isAccountFrozen(user: User | null): boolean {
  if (!user) return false;
  if (user.role === "teacher") return (user.teacher_status ?? "active") === "frozen";
  return user.status === "frozen";
}

/* 1 — Route not found ------------------------------------------------------ */
export function NotFoundScreen() {
  const router = useRouter();
  const { user } = useAuth();
  return (
    <ErrorScreen
      title="This page took a wrong turn"
      body="We couldn't find what you're looking for. It might have moved, or the link might be outdated."
      action={{ label: "Back to Dashboard", onClick: () => router.navigate({ to: roleHome(user) }) }}
    />
  );
}

/* 2 — Session expired ------------------------------------------------------ */
export function SessionExpiredScreen() {
  const router = useRouter();
  return (
    <ErrorScreen
      title="Your session timed out"
      body="For your security, we signed you out after a while of inactivity. Log back in to keep going."
      action={{ label: "Log back in", onClick: () => router.navigate({ to: "/login" }) }}
    />
  );
}

/* 3 — Generic failure ------------------------------------------------------ */
export function GeneralErrorScreen({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <>
      {/* The root error boundary replaces the root render, so the modal is
          mounted here as well for this screen. */}
      <ContactVerbotModal />
      <ErrorScreen
      title="Something didn't load right"
      body="That's on us, not you. Try refreshing the page — if it keeps happening, let us know."
      action={{ label: "Refresh", onClick: onRefresh ?? (() => window.location.reload()) }}
        secondaryAction={{ label: "Contact VERBOT", onClick: openContactModal }}
      />
    </>
  );
}

/* 4 — Frozen account ------------------------------------------------------- */
export function FrozenAccountScreen() {
  return (
    <ErrorScreen
      title="Your account is temporarily locked"
      body="This happens automatically when we detect unusual activity, to keep your account safe. Reach out and we'll help you sort it out."
      action={{ label: "Contact VERBOT", onClick: openContactModal }}
    />
  );
}

/* 5 — Unsupported device --------------------------------------------------- */
export function UnsupportedDeviceScreen() {
  return (
    <ErrorScreen
      title="Verbo Academy works best on a bigger screen"
      body="We designed this experience for tablets and computers. Grab one of those and we'll be right here."
    />
  );
}
