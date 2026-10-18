import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/net-utils";
import { legacyToUuid } from "@/lib/user-id-bridge";

export interface SuspensionNotice {
  id: string;
  student_id: string;
  created_at: string;
  ended_at: string | null;
  first_shown_at: string | null;
  deadline_at: string | null;
  acknowledged_at: string | null;
  copy: {
    version: string;
    title: string;
    body: string;
    warningTitle: string;
    warning: string;
    receipt: string;
  };
  events?: { id: number; kind: string; created_at: string }[];
  emails?: {
    kind: string;
    status: string;
    accepted_at: string | null;
    last_error: string | null;
  }[];
}
export interface SuspensionAccess {
  token: string;
  notice: SuspensionNotice;
}
export type NoticeAction =
  | "shown"
  | "warning_opened"
  | "acknowledged"
  | "closed"
  | "contact_opened"
  | "returned_to_login"
  | "history";

async function invoke<T>(body: object): Promise<T> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("suspension-notices", { body }),
    15000,
    "suspension notice",
  );
  if (error || data?.error)
    throw new Error(
      data?.error ||
        "No se pudo guardar el registro. Reintenta; si la sesión del aviso expiró, vuelve a iniciar sesión.",
    );
  return data as T;
}
export const issueSuspensionAccess = () => invoke<SuspensionAccess>({ action: "issue" });
export const noticeAction = (token: string, action: NoticeAction) =>
  invoke<{ notice: SuspensionNotice }>({ token, action });
export const noticeHistory = (token: string) =>
  invoke<SuspensionNotice[]>({ token, action: "history" });
export async function loadSuspensionHistory(studentId: string): Promise<SuspensionNotice[]> {
  const uuid = await legacyToUuid(studentId);
  if (!uuid) return [];
  const { data, error } = await withTimeout(
    supabase.rpc("student_suspension_history" as never, { p_student: uuid } as never),
    15000,
    "notice history",
  );
  if (error) throw new Error("No se pudo cargar el historial de avisos.");
  return (data ?? []) as unknown as SuspensionNotice[];
}
export const noticeDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "long",
        timeStyle: "short",
      })
    : "Pendiente";
