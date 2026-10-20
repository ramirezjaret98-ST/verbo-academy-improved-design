import type { Club } from "@/lib/clubs-store";
import { CLUB_STATUS_META, clubTimeStatus } from "@/lib/club-lifecycle";
import { ACADEMY_TIME_ZONE } from "@/lib/academy-time";
import { ClubRoster } from "./ClubRoster";

export function TeacherClubDetails({ club }: { club: Club }) {
  const status = CLUB_STATUS_META[clubTimeStatus(club)];
  return (
    <div className="space-y-4 px-5 py-5">
      <div className="rounded-2xl bg-secondary/50 p-4">
        <p className="text-sm font-semibold">
          {new Date(club.date).toLocaleString("en-US", {
            timeZone: ACADEMY_TIME_ZONE,
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · CDMX
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-background px-3 py-1">
            {club.duration_minutes} minutes
          </span>
          <span className="rounded-full bg-background px-3 py-1">
            {club.spots_taken}/{club.spots_total} student seats
          </span>
          <span
            className="rounded-full px-3 py-1 font-semibold text-white"
            style={{ background: status.color }}
          >
            {status.label}
          </span>
          {club.topic_tag && (
            <span className="rounded-full bg-background px-3 py-1">{club.topic_tag}</span>
          )}
        </div>
      </div>
      {club.subtitle && <p className="text-base font-semibold">{club.subtitle}</p>}
      {club.description && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            About this club
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{club.description}</p>
        </div>
      )}
      {club.instructions && (
        <div className="rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preparation & participation
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{club.instructions}</p>
        </div>
      )}
      <ClubRoster clubId={club.id} />
    </div>
  );
}
