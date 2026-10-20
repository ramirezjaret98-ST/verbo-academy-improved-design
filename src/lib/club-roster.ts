import { supabase } from "@/integrations/supabase/client";

export interface ClubAttendee {
  attendee_id: string;
  name: string;
  kind: "student" | "courtesy";
  booked_at: string;
  attendance_id: string;
}

export async function loadClubRoster(clubId: string): Promise<ClubAttendee[]> {
  const { data, error } = await supabase.rpc(
    "club_staff_roster" as never,
    { p_club_id: Number(clubId) } as never,
  );
  if (error) throw error;
  return (data ?? []) as ClubAttendee[];
}

export async function removeClubAttendee(
  clubId: string,
  attendeeId: string,
  returnCredit: boolean,
): Promise<void> {
  const { error } = await supabase.rpc(
    "admin_remove_club_attendee" as never,
    {
      p_club_id: Number(clubId),
      p_attendee_id: attendeeId,
      p_return_credit: returnCredit,
    } as never,
  );
  if (error) throw error;
}
