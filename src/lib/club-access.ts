import type { ClubType } from "./clubs-store";
import type { User } from "./mock-data";

/** The existing `insights` product_type is the legacy key for standalone club
 * access. Its two independent allowances determine which collections exist. */
export function visibleClubTypes(user: Pick<User, "product_type" | "addon_insights_per_month" | "addon_bookclubs_per_month"> | null): ClubType[] {
  if (!user || user.product_type !== "insights") return ["insight", "book"];
  const types: ClubType[] = [];
  if ((user.addon_insights_per_month ?? 0) > 0) types.push("insight");
  if ((user.addon_bookclubs_per_month ?? 0) > 0) types.push("book");
  return types;
}
