// Lightweight, read-only "peek" card for OTHER people's profiles (a teacher or
// a classmate). Distinct from the "My Profile" modal: no editing, no password,
// no photo upload — just identity + a couple of public facts.
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAvatar } from "@/lib/avatar-store";
import { colorFromString, initialsOf } from "@/lib/leaderboard-identity-store";
import { useStudentProfile } from "@/lib/student-profile-store";
import { rankLabel } from "@/lib/staff-profile-store";
import { USERS } from "@/lib/mock-data";
import { avgRating } from "@/lib/teacher-model";
import { Star } from "lucide-react";

interface Props {
  /** Omit to render the trigger without a popover (e.g. "Verbo Team"). */
  userId?: string;
  /** Name to display. Required when the identity is anonymized. */
  displayName?: string;
  /**
   * When false the person chose to be shown under a nickname — never reveal
   * their real name, photo, role details or any identifying data.
   */
  showRealIdentity?: boolean;
  children: ReactNode;
}

export function ProfilePeekCard({
  userId,
  displayName,
  showRealIdentity = true,
  children,
}: Props) {
  const anonymous = !showRealIdentity;
  const user = userId ? USERS.find((u) => u.id === userId) : undefined;
  const avatar = useAvatar(anonymous ? undefined : userId);
  const studentProfile = useStudentProfile(userId);

  if (!userId) return <>{children}</>;

  const name = anonymous ? (displayName ?? "Player") : (displayName ?? user?.name ?? "Player");
  const isTeacher = !anonymous && user?.role === "teacher";
  const isStudent = anonymous || user?.role === "student";
  const rating = isTeacher && user ? avgRating(user) : null;
  const tags = isStudent ? studentProfile.personalityTags : [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt={name} className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ background: colorFromString(name) }}
              aria-hidden
            >
              {initialsOf(name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{name}</div>
            <span className="mt-1 inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {isTeacher ? "Teacher" : "Student"}
            </span>
          </div>
        </div>

        {isTeacher && user && (
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tier</span>
              <span className="font-medium text-foreground">{rankLabel(user)}</span>
            </div>
            {rating != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rating</span>
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Star className="h-3.5 w-3.5 text-[#f38934]" />
                  {rating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        )}

        {isStudent && tags.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Personality tags
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[#01304a]/[0.06] px-2 py-1 text-[11px] font-medium text-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
