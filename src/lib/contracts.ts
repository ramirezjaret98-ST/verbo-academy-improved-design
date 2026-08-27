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
 *  migración). Admin puede editar estos valores en el modal antes de enviar.
 *
 *  `totalPrice` se semilla desde `custom_price` solo como punto de partida
 *  razonable — ese campo del perfil modela un precio MENSUAL recurrente
 *  (Enterprise/GO/International), mientras que el contrato real (ver
 *  contract-pdf.ts) es de PAGO ÚNICO por el paquete completo (como el de
 *  Ericka, plan VIP). El admin debe confirmar/ajustar el total real en el
 *  modal antes de enviar — nunca se manda tal cual sin revisión. */
export function contractFieldsFromStudent(student: User): ContractFields {
  return {
    studentName: student.name,
    studentEmail: student.email,
    studentPhone: student.phone,
    company: student.company,
    product: student.product,
    accessPlan: student.access_plan,
    contractedLevels: student.contracted_levels,
    totalSessions: student.hired_sessions,
    sessionsPerWeek: student.sessions_per_week,
    sessionDuration: student.session_duration,
    reschedulePolicy: student.reschedule_policy,
    startDate: student.cycle_start,
    totalPrice: student.custom_price ?? undefined,
    monthlyPrice: student.custom_price ?? undefined,
    paymentDay: student.payment_day,
    cycleStart: student.cycle_start,
  };
}

/** Crea el registro del contrato y dispara el correo de "listo para firmar"
 *  al alumno. El folio (p.ej. "VFP-34-26", mismo formato que el contrato
 *  real de Jaret) se arma a partir del id autoincremental de la fila una vez
 *  insertada — por eso es un segundo update en vez de ir en el insert
 *  inicial. Devuelve el token (para mostrarlo/copiarlo en el modal como
 *  respaldo) o un error legible para notifyError(). */
export async function createContractAndNotify(opts: {
  studentId: string;
  createdBy: string;
  fields: ContractFields;
}): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const token = crypto.randomUUID();
  const { data: inserted, error } = await supabase
    .from("student_contracts")
    .insert({
      student_id: opts.studentId,
      created_by: opts.createdBy,
      token,
      status: "pending",
      contract_fields: opts.fields as unknown as Json,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[contracts] failed to create student_contracts row", error);
    return { ok: false, error: error?.message ?? "No se pudo crear el contrato." };
  }

  const yy = new Date().getFullYear().toString().slice(-2);
  const folio = `VFP-${inserted.id}-${yy}`;
  const fieldsWithFolio: ContractFields = { ...opts.fields, folio };
  const { error: folioErr } = await supabase
    .from("student_contracts")
    .update({ contract_fields: fieldsWithFolio as unknown as Json })
    .eq("id", inserted.id);
  if (folioErr) console.error("[contracts] failed to set folio", folioErr);

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
