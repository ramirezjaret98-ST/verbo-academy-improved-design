// Automatic, one-time welcome tour for the Student Dashboard. Fires the first
// time a student ever lands on /student, never again after that (see
// tour-seen-store.ts). Every other Verbot tour in the app is on-demand only
// (VerbotHelpBubble) — this is the single exception, by design.
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { hasSeenTour, markTourSeen } from "@/lib/tour-seen-store";
import { GuidedTour, type TourStep } from "@/components/verbo/GuidedTour";
import verbotHi from "@/assets/Verbot_hi.svg";

const DASHBOARD_TOUR_ID = "dashboard-welcome";

const STEPS: TourStep[] = [
  {
    id: "welcome",
    eyebrow: "Meet Verbot",
    title: "Hey, welcome to Verbo!",
    body: "I'm Verbot — I'll show you around in under a minute so you know exactly where everything lives.",
  },
  {
    id: "nav",
    target: '[data-tour="nav-menu"]',
    eyebrow: "Your menu",
    title: "Everything lives right here",
    body: "This is your menu. Sessions, your learning path, resources — everything about your course is one click away.",
  },
  {
    id: "kpis",
    target: '[data-tour="dashboard-kpis"]',
    eyebrow: "Your progress",
    title: "Track yourself at a glance",
    body: "Your level, your progress toward the next one, and your attendance — always up to date here.",
  },
  {
    id: "profile",
    target: '[data-tour="profile-button"]',
    eyebrow: "Your profile",
    title: "That's you",
    body: "Your streak, badges and account settings live behind your photo, right here.",
  },
  {
    id: "help",
    target: '[data-tour="help-button"]',
    eyebrow: "Need a hand?",
    title: "I'm always around",
    body: "Stuck or have a question? Tap me here anytime — and you'll find a page-specific version of me on every screen too.",
  },
  {
    id: "closing",
    eyebrow: "That's the tour",
    title: "You're all set!",
    body: "One more thing: each page has its own quick guide too — just look for me in the corner. See you around!",
  },
];

export function DashboardWelcomeTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id || user.role !== "student") return;
    if (hasSeenTour(user.id, DASHBOARD_TOUR_ID)) return;
    // Small delay so the dashboard's own mount/skeleton settles first —
    // spotlighting a card that's still swapping in from its skeleton looks off.
    const t = window.setTimeout(() => setOpen(true), 500);
    return () => window.clearTimeout(t);
  }, [user?.id, user?.role]);

  const finish = () => {
    setOpen(false);
    if (user?.id) markTourSeen(user.id, DASHBOARD_TOUR_ID);
  };

  if (!user) return null;

  return (
    <GuidedTour
      steps={STEPS}
      active={open}
      onClose={finish}
      onFinish={finish}
      artSrc={verbotHi}
      accent="#01304a"
    />
  );
}
