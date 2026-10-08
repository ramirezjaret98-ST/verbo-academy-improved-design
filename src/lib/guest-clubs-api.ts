import { supabase } from "@/integrations/supabase/client";

export type GuestClub = {
  id: number;
  type: "insight" | "book";
  title: string;
  description: string | null;
  subtitle: string | null;
  topic_tag: string | null;
  cover_image: string | null;
  cover_position_x: number | null;
  cover_position_y: number | null;
  cover_scale: number | null;
  date: string;
  duration_minutes: number;
  status: string;
  guestSeatAvailable: boolean;
};

export type GuestDetail = {
  guestName: string;
  bookingStatus: "booked" | "cancelled" | "revoked";
  club: Pick<GuestClub, "id" | "type" | "title" | "description" | "subtitle" | "date" | "duration_minutes" | "status" | "cover_image"> & {
    instructions: string | null;
  };
  materialAvailable: boolean;
  meetingAvailable: boolean;
  cancellationAvailable: boolean;
};

type GuestAction =
  | { action: "catalog" }
  | { action: "book"; code: string; clubId: number }
  | { action: "detail" | "material" | "meeting" | "cancel"; accessToken: string };

export async function guestRequest<T>(body: GuestAction): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${url}/functions/v1/club-guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "No pudimos conectar con Clubs. Intenta de nuevo.");
  return result as T;
}

export type GuestInvitation = {
  id: string;
  guest_name: string;
  email: string;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
  invitation_sent_at: string | null;
  created_at: string;
};
export type GuestBookingAdmin = {
  id: string;
  invitation_id: string;
  club_id: number;
  status: "booked" | "cancelled" | "revoked";
  booked_at: string;
  confirmation_sent_at: string | null;
};
export type GuestAdminList = {
  invitations: GuestInvitation[];
  bookings: GuestBookingAdmin[];
  clubs: { id: number; title: string; date: string; type: string }[];
};

export async function guestAdminRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("club-guest-admin", { body });
  if (error) {
    let message = error.message || "No pudimos completar la acción.";
    const context = error.context as Response | undefined;
    if (context?.json) {
      const details = await context.json().catch(() => null);
      if (details?.error) message = details.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
