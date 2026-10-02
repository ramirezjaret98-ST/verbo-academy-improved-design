import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
import type { ClubType } from "@/lib/clubs-store";

export type ClubSuggestion = {
  id: number;
  student_id: string;
  type: ClubType;
  title: string;
  details: string;
  status: string;
  created_at: string;
};

export type ClubRepeatRequest = {
  id: number;
  club_id: number;
  student_id: string;
  reason: "missed" | "full" | "again";
  created_at: string;
};

export async function submitClubSuggestion(studentId: string, input: {
  type: ClubType; title: string; details: string;
}): Promise<void> {
  const studentUuid = await legacyToUuid(studentId);
  if (!studentUuid) throw new Error("Your student profile is unavailable.");
  const title = input.title.trim();
  const details = input.details.trim();
  if (title.length < 3 || title.length > 160) throw new Error("Use a title between 3 and 160 characters.");
  if (details.length > 2000) throw new Error("The description is too long.");
  const { error } = await supabase.from("club_suggestions").insert({
    student_id: studentUuid, type: input.type, title, details,
  });
  if (error) throw new Error("Your suggestion could not be sent. Please try again.");
}

export async function loadMyRepeatRequests(studentId: string): Promise<ClubRepeatRequest[]> {
  const studentUuid = await legacyToUuid(studentId);
  if (!studentUuid) return [];
  const { data, error } = await supabase.from("club_repeat_requests")
    .select("*").eq("student_id", studentUuid);
  if (error) throw new Error("Could not load your requests.");
  return (data ?? []).map((row) => ({ ...row, reason: row.reason as ClubRepeatRequest["reason"] }));
}

export async function requestClubRepeat(
  studentId: string, clubId: string, reason: ClubRepeatRequest["reason"],
): Promise<ClubRepeatRequest> {
  const studentUuid = await legacyToUuid(studentId);
  const numericClubId = Number(clubId);
  if (!studentUuid || !Number.isInteger(numericClubId)) throw new Error("Could not identify this club.");
  const { data, error } = await supabase.from("club_repeat_requests")
    .insert({ student_id: studentUuid, club_id: numericClubId, reason })
    .select("*").single();
  if (error || !data) {
    if (error?.code === "23505") throw new Error("You have already requested this Insight.");
    throw new Error(error?.message || "Could not submit your request.");
  }
  return { ...data, reason: data.reason as ClubRepeatRequest["reason"] };
}

export async function loadAdminCatalogRequests(): Promise<{
  suggestions: ClubSuggestion[]; repeats: ClubRepeatRequest[];
}> {
  const [suggestionsResult, repeatsResult] = await Promise.all([
    supabase.from("club_suggestions").select("*").order("created_at", { ascending: false }),
    supabase.from("club_repeat_requests").select("*").order("created_at", { ascending: false }),
  ]);
  if (suggestionsResult.error || repeatsResult.error) throw new Error("Could not load catalog requests.");
  return {
    suggestions: (suggestionsResult.data ?? []).map((row) => ({
      ...row, student_id: uuidToLegacySync(row.student_id),
    })),
    repeats: (repeatsResult.data ?? []).map((row) => ({
      ...row, student_id: uuidToLegacySync(row.student_id),
      reason: row.reason as ClubRepeatRequest["reason"],
    })),
  };
}

export async function updateSuggestionStatus(
  id: number, status: "new" | "reviewed" | "planned" | "closed",
): Promise<void> {
  const { data, error } = await supabase.from("club_suggestions")
    .update({ status }).eq("id", id).select("id");
  if (error || !data?.length) throw new Error("Could not update the suggestion.");
}
