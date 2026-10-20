export type ClubTimeStatus = "upcoming" | "live" | "completed" | "cancelled" | "expired" | "absent";

export const CLUB_STATUS_META: Record<ClubTimeStatus, { label: string; color: string }> = {
  upcoming: { label: "Upcoming", color: "#01304a" },
  live: { label: "Live", color: "#0284c7" },
  completed: { label: "Complete", color: "#279b10" },
  absent: { label: "Absent", color: "#dc0000" },
  expired: { label: "Expired", color: "#a16207" },
  cancelled: { label: "Cancelled", color: "#64748b" },
};

/** Reported outcomes are authoritative. Time alone never proves attendance. */
export function clubTimeStatus(
  club: { status: ClubTimeStatus; date: string; duration_minutes: number },
  now = Date.now(),
): ClubTimeStatus {
  if (["completed", "absent", "cancelled"].includes(club.status)) return club.status;
  const start = new Date(club.date).getTime();
  if (start + club.duration_minutes * 60_000 <= now) return "expired";
  return start <= now ? "live" : "upcoming";
}
