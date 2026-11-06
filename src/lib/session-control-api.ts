import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/net-utils";
import type { SessionControlData } from "./session-control";

export async function fetchSessionControl(): Promise<SessionControlData> {
  const { data, error } = await withTimeout(
    supabase.rpc("session_control_list" as never),
    20_000,
    "Loading session control",
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Session control returned no data.");
  return data as unknown as SessionControlData;
}
export async function saveSessionControl(
  key: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await withTimeout(
    supabase.rpc(
      "session_control_save" as never,
      {
        p_key: key,
        p_action: action,
        p_payload: payload,
      } as never,
    ),
    20_000,
    "Saving session control",
  );
  if (error) throw new Error(error.message);
}
export async function fetchConfirmationHistory(key: string) {
  const { data, error } = await supabase
    .from("session_confirmation_history" as never)
    .select("id,actor_id,recorded_at,before_record,after_record")
    .eq("occurrence_key", key)
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Array<{
    id: number;
    actor_id: string;
    recorded_at: string;
    before_record: Record<string, unknown> | null;
    after_record: Record<string, unknown>;
  }>;
}
