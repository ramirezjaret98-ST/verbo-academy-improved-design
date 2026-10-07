import type { ClubType } from "./clubs-store";
import type { User } from "./mock-data";

export function mexicoDate(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isStandaloneClubCustomer(user?: User): boolean {
  return user?.product_type === "insights";
}

export function packageTotal(user: User | undefined, type: ClubType): number {
  if (!user?.club_package_id) return 0;
  return type === "book"
    ? (user.club_book_base ?? 0) + (user.club_book_bonus ?? 0)
    : (user.club_insight_base ?? 0) + (user.club_insight_bonus ?? 0);
}

export function packageCoversDate(user: User | undefined, clubDate?: string): boolean {
  if (!user?.club_package_id || !user.club_package_started_on || !user.club_package_expires_on) return false;
  const today = mexicoDate();
  if (today < user.club_package_started_on || today >= user.club_package_expires_on) return false;
  if (!clubDate) return true;
  const eventDate = mexicoDate(new Date(clubDate));
  return eventDate >= user.club_package_started_on && eventDate < user.club_package_expires_on;
}
