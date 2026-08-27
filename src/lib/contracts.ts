// Contrato con firma electrónica in-house — 2026-08-26 (reemplaza
// DocuSign/OpenSign, decisión de Jaret).
//
// Mismo patrón arquitectónico que invoice-requests.ts (Feature A10,
// 2026-08-20): un token único e impredecible (crypto.randomUUID) es la
// ÚNICA forma de entrar al flujo público de firma — ver
// src/routes/firmar-contrato.$token.tsx. El admin (con sesión autenticada)
// inserta directamente en `student_contracts` — permitido por la policy
// "admin_full_access_student_contracts" — y luego dispara el correo vía la
// Edge Function `notify-contract-event` (fire-and-forget, nunca bloquea ni
// revienta la acción del admin si el correo falla, mismo criterio que
// notifySessionEvent/notifyAccountEvent/createInvoiceRequestAndNotify).
//
// El PDF "sin firmar" NO se genera ni se sube aquí — el admin ve/confirma
// los campos en SendContractModal, y el PDF real (con la firma del alumno)
// se genera hasta que el alumno firma, en la página pública, para que el
// hash guardado como evidencia corresponda exactamente al documento que el
// alumno vio y firmó.
import { supabase } from "@/integrations/supabase/client";
import type { ContractFields } from "@/lib/contract-pdf";
import type { User } from "@/lib/mock-data";
import type { Json } from "@/integrations/supabase/types";

export type ContractStatus = "pending" | "signed" | "void";

export interface StudentContractRow {
  id: number;
  student_id: string;
  token: string;
  status: ContractStatus;
  contract_fields: ContractFields;
  created_at: string;
  signed_at: string | null;
}

/** Snapshot de los campos comerciales del alumno tal como existen HOY — se
 *  guarda congelado en `contract_fields` para que un cambio posterior en su
 *  perfil no altere un contrato ya enviado a firmar (ver comentario en la
 *  migración). Admin puede editar estos valores en el modal antes de enviar. */
export function contractFieldsFromStudent(student: User): ContractFields {
  return {
    studentName: student.name,
    studentEmail: student.email,
    company: student.company,
    product: student.product,
    accessPlan: student.access_plan,
    contractedLevels: student.contracted_levels,
    sessionsPerWeek: student.sessions_per_week,
    sessionDuration: student.session_duration,
    reschedulePolicy: student.reschedule_policy,
    monthlyPrice: student.custom_price ?? undefined,
    paymentDay: student.payment_day,
    cycleStart: student.cycle_start,
  };
}

/** Crea el registro del contrato y dispara el correo de "listo para firmar"
 *  al alumno. Devuelve el token (para mostrarlo/copiarlo en el modal como
 *  respaldo) o un error legible para notifyError(). */
export async function createContractAndNotify(opts: {
  studentId: string;
  createdBy: string;
  fields: ContractFields;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const token = crypto.randomUUID();
  const { error } = await supabase.from("student_contracts").insert({
    student_id: opts.studentId,
    created_by: opts.createdBy,
    token,
    status: "pending",
    contract_fields: opts.fields as unknown as Json,
  });
  if (error) {
    console.error("[contracts] failed to create student_contracts row", error);
    return { ok: false, error: error.message };
  }

  void supabase.functions
    .invoke("notify-contract-event", { body: { token, kind: "contract_ready" } })
    .then(({ error: fnError }) => {
      if (fnError) console.error("[contracts] notify-contract-event failed", fnError);
    });

  return { ok: true, token };
}

/** Anula un contrato pendiente (p. ej. si el admin cometió un error en los
 *  datos) — nunca se edita un contrato ya enviado, se anula y se manda uno
 *  nuevo, para que el rastro de auditoría quede limpio. */
export async function voidContract(id: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("student_contracts")
    .update({ status: "void", voided_at: new Date().toISOString(), voided_reason: reason })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function contractsForStudent(studentId: string): Promise<StudentContractRow[]> {
  const { data, error } = await supabase
    .from("student_contracts")
    .select("id, student_id, token, status, contract_fields, created_at, signed_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[contracts] failed to load contracts for student", error);
    return [];
  }
  return (data ?? []) as unknown as StudentContractRow[];
}
