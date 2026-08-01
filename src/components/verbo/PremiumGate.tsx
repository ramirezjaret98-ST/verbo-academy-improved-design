// Shared premium-access primitives used by any student surface that needs to
// gate content behind the Advance/Elite access plans. Extracted from
// student.challenges.tsx so Resources (and future surfaces) reuse exactly the
// same rule + visual language — the message intentionally differs for group
// vs. individual students because groups upgrade through the admin, not a
// billing surface exposed to the student.
import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { groupsByStudentId } from "@/lib/groups-store";

export const PREMIUM_ACCESS: readonly string[] = ["Advance", "Elite"];

export function PremiumBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
      <Lock className="h-3 w-3" /> Premium
    </span>
  );
}

export function AccessGateNotice({ accent }: { accent?: string }) {
  const { user } = useAuth();
  const isGroup = !!(user && groupsByStudentId().has(user.id));
  return (
    <>
      <p className="max-w-sm text-sm font-medium text-foreground">
        {isGroup
          ? "This challenge is for Advance tier+. It's not included in your group's plan — contact your admin to expand access."
          : "This challenge is for Advance tier+. Upgrade your access level to access them."}
      </p>
      {!isGroup && (
        <Link
          to="/student/access-levels"
          className="text-xs font-semibold underline underline-offset-4 hover:opacity-80"
          style={accent ? { color: accent } : undefined}
        >
          Learn more
        </Link>
      )}
    </>
  );
}
