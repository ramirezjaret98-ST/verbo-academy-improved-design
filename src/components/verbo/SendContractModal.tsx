// "Enviar contrato" — botón nuevo en el perfil del alumno (Admin), 2026-08-26.
// Reemplaza DocuSign/OpenSign: genera el link único de firma y dispara el
// correo al alumno. Ver src/lib/contracts.ts (lógica) y
// src/routes/firmar-contrato.$token.tsx (lo que ve el alumno).
//
// 2026-09-15: agregado el selector "Pago único / Mensualidades" (antes solo
// existía pago único — ver NOTA A JARET #1 en contract-pdf.ts). Cuando se
// envía un contrato de mensualidades, además de crear el contrato también se
// crea el Payment Plan interno del alumno (mismo mecanismo de
// admin.students.tsx → PaymentPlanModal, con las alertas 3/2/1/0 días en la
// campanita) con el mismo total/parcialidades/frecuencia/fecha, para no
// tener que configurarlo dos veces — decisión explícita de Jaret. Para pago
// único NO se toca el Payment Plan: createPaymentPlan() lo marcaría como ya
// pagado de inmediato, lo cual sería incorrecto aquí (el contrato apenas se
// está enviando a firmar, todavía no se ha cobrado).
import { useState } from "react";
import { FileSignature, Loader2, Check, Eye, X } from "lucide-react";
import { GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import { contractFieldsFromStudent, createContractAndNotify } from "@/lib/contracts";
import { renderContractHtml, type ContractFields } from "@/lib/contract-pdf";
import { computeInstallmentSchedule, createPaymentPlan } from "@/lib/payment-plans";
import type { User } from "@/lib/mock-data";
import { notifyError, notifySuccess } from "@/lib/notify";

const ACTIVE = "#01304a"; // navy — convención de la app para el estado seleccionado de un chip/pill

function PaymentTypeButton({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors"
      style={active ? { background: ACTIVE, borderColor: ACTIVE, color: "#fff" } : { background: "transparent", borderColor: "var(--border)", color: "var(--foreground)" }}
    >
      {title}
      <p className={`mt-0.5 text-[11px] font-normal ${active ? "text-white/80" : "text-muted-foreground"}`}>{subtitle}</p>
    </button>
  );
}

export function SendContractModal({ student, onClose }: { student: User; onClose: () => void }) {
  const { user } = useAuth();
  const [fields, setFields] = useState<ContractFields>(() => ({
    installmentsCount: 3,
    frequencyDays: 30,
    ...contractFieldsFromStudent(student),
  }));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ContractFields>(key: K, value: ContractFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const isInstallments = fields.paymentType === "installments";
  const schedulePreview =
    isInstallments && fields.totalPrice && fields.paymentDueDate && fields.installmentsCount && fields.frequencyDays
      ? computeInstallmentSchedule(fields.totalPrice, fields.installmentsCount, fields.paymentDueDate, fields.frequencyDays)
      : [];

  const submit = async () => {
    if (!user) return;
    setError(null);
    if (isInstallments && !(fields.totalPrice && fields.totalPrice > 0 && fields.installmentsCount && fields.installmentsCount >= 1 && fields.frequencyDays && fields.frequencyDays >= 1 && fields.paymentDueDate)) {
      setError("Para mensualidades, completa precio total, número de parcialidades, frecuencia y fecha del primer pago.");
      return;
    }
    setSending(true);
    const res = await createContractAndNotify({ studentId: student.id, createdBy: user.id, fields });
    if (!res.ok) {
      setSending(false);
      notifyError(res.error, { context: `Enviando contrato a ${student.name}` });
      return;
    }

    // El contrato ya se envió con éxito en este punto — lo que sigue es una
    // conveniencia adicional (crear el Payment Plan interno), nunca debe
    // hacer parecer que el envío del contrato falló si esto falla.
    if (isInstallments && fields.totalPrice && fields.installmentsCount && fields.frequencyDays && fields.paymentDueDate) {
      const planRes = await createPaymentPlan({
        studentId: student.id,
        studentName: student.name,
        planType: "installments",
        totalAmount: fields.totalPrice,
        installmentsCount: fields.installmentsCount,
        frequencyDays: fields.frequencyDays,
        firstDueDate: fields.paymentDueDate,
        createdBy: user.id,
        notes: `Creado automáticamente al enviar el contrato${fields.folio ? ` ${fields.folio}` : ""}.`,
      });
      if (!planRes.ok) {
        notifyError(
          `El contrato se envió correctamente, pero no se pudo crear el Payment Plan interno (${planRes.error}). Configúralo manualmente en el perfil del alumno para que aparezcan las alertas de pago.`,
          { context: `Payment Plan de ${student.name}` },
        );
      }
    }

    setSending(false);
    notifySuccess(`Contrato enviado a ${student.name} (${student.email}).`);
    setSent(true);
  };

  const sendFromPreview = async () => {
    await submit();
    setShowPreview(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <FileSignature className="h-4.5 w-4.5 text-[#01304a]" />
          <h2 className="text-sm font-semibold text-foreground">Enviar contrato a {student.name}</h2>
        </div>

        {sent ? (
          <div className="p-6">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Contrato enviado. {student.name} recibirá un correo en {student.email} con el link para revisarlo y firmarlo.
              </span>
            </div>
            <div className="mt-4 flex justify-end">
              <PrimaryButton onClick={onClose}>Listo</PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-5">
              <p className="text-xs text-muted-foreground">
                Estos datos ya vienen prellenados del perfil del alumno — ajústalos si algo va a ser distinto en este contrato específico antes de enviarlo.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono">
                  <input value={fields.studentPhone ?? ""} onChange={(e) => set("studentPhone", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Empresa">
                  <input value={fields.company ?? ""} onChange={(e) => set("company", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Producto">
                  <input value={fields.product ?? ""} onChange={(e) => set("product", e.target.value)} className={inputCls} />
                </Field>
                <Field label='Programa (opcional, ej. "Trayecto Total")'>
                  <input value={fields.productProgram ?? ""} onChange={(e) => set("productProgram", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Plan de acceso">
                  <input value={fields.accessPlan ?? ""} onChange={(e) => set("accessPlan", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Niveles contratados">
                  <input
                    value={(fields.contractedLevels ?? []).join(", ")}
                    onChange={(e) => set("contractedLevels", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Número total de sesiones">
                  <input type="number" value={fields.totalSessions ?? ""} onChange={(e) => set("totalSessions", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} />
                </Field>
                <Field label="Duración por sesión (min)">
                  <input type="number" value={fields.sessionDuration ?? ""} onChange={(e) => set("sessionDuration", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} />
                </Field>
                <Field label="Modalidad">
                  <input value={fields.modality ?? "Virtual"} onChange={(e) => set("modality", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Fecha de inicio">
                  <input type="date" value={fields.startDate?.slice(0, 10) ?? ""} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Fecha de término estimada">
                  <input type="date" value={fields.estimatedEndDate?.slice(0, 10) ?? ""} onChange={(e) => set("estimatedEndDate", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Precio total del paquete (MXN)">
                  <input type="number" value={fields.totalPrice ?? ""} onChange={(e) => set("totalPrice", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} />
                </Field>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Forma de pago</p>
                <div className="grid grid-cols-2 gap-2">
                  <PaymentTypeButton
                    active={!isInstallments}
                    onClick={() => set("paymentType", "single")}
                    title="Pago único"
                    subtitle="Un solo pago por el total del paquete."
                  />
                  <PaymentTypeButton
                    active={isInstallments}
                    onClick={() => set("paymentType", "installments")}
                    title="Mensualidades"
                    subtitle="Se divide el total en varias parcialidades."
                  />
                </div>

                {isInstallments ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Número de parcialidades">
                        <input
                          type="number"
                          min={1}
                          value={fields.installmentsCount ?? ""}
                          onChange={(e) => set("installmentsCount", e.target.value ? Math.max(1, Number(e.target.value)) : undefined)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Frecuencia (días entre pagos)">
                        <input
                          type="number"
                          min={1}
                          value={fields.frequencyDays ?? ""}
                          onChange={(e) => set("frequencyDays", e.target.value ? Math.max(1, Number(e.target.value)) : undefined)}
                          className={inputCls}
                        />
                      </Field>
                    </div>
                    <Field label="Fecha del primer pago">
                      <input type="date" value={fields.paymentDueDate?.slice(0, 10) ?? ""} onChange={(e) => set("paymentDueDate", e.target.value)} className={inputCls} />
                    </Field>
                    {schedulePreview.length > 0 && (
                      <div className="rounded-lg border border-border bg-card p-2.5 text-[12px]">
                        <p className="mb-1 font-semibold text-foreground">Calendario de parcialidades</p>
                        {schedulePreview.map((s) => (
                          <div key={s.installmentNumber} className="flex justify-between py-0.5 text-muted-foreground">
                            <span>#{s.installmentNumber} · {new Date(s.dueDate + "T00:00:00").toLocaleDateString("es-MX")}</span>
                            <span className="font-medium text-foreground">${s.amount.toLocaleString("es-MX")} MXN</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10.5px] text-muted-foreground">
                      Al enviar, esto también crea el Payment Plan interno del alumno (mismas alertas de la campanita que ya usas para pagos diferidos).
                    </p>
                  </>
                ) : (
                  <Field label="Fecha límite de pago">
                    <input type="date" value={fields.paymentDueDate?.slice(0, 10) ?? ""} onChange={(e) => set("paymentDueDate", e.target.value)} className={inputCls} />
                  </Field>
                )}
              </div>

              {error && <p className="text-xs font-medium text-destructive">{error}</p>}

              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
                El texto legal (cláusulas de objeto, mora, cancelaciones, conducta, etc.) es el contrato real que confirmaste (Ericka Escamilla, 2026-08-27), con solo estos datos como variables. La cláusula de forma de pago cambia según lo que elijas arriba; el resto no depende de eso.
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/30 px-5 py-4">
              <GhostButton onClick={() => setShowPreview(true)}><Eye className="h-3.5 w-3.5" /> Vista previa</GhostButton>
              <div className="flex items-center gap-2">
                <GhostButton onClick={onClose} disabled={sending}>Cancelar</GhostButton>
                <PrimaryButton onClick={submit} disabled={sending}>
                  {sending ? (<><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Enviando…</>) : "Enviar contrato"}
                </PrimaryButton>
              </div>
            </div>
          </>
        )}
      </div>

      {showPreview && (
        <ContractPreviewModal
          fields={fields}
          studentName={student.name}
          sending={sending}
          onClose={() => setShowPreview(false)}
          onSend={sendFromPreview}
        />
      )}
    </div>
  );
}

/** Full-size, read-only look at exactly what `firmar-contrato.$token.tsx`
 *  will render for the student — same `renderContractHtml` + `srcDoc`
 *  pattern, so "preview" and "what actually gets sent" can never drift
 *  apart. Sits on top of SendContractModal (higher z-index) so admins can
 *  review the current field values, then send right from here. */
function ContractPreviewModal({
  fields,
  studentName,
  sending,
  onClose,
  onSend,
}: {
  fields: ContractFields;
  studentName: string;
  sending: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-[#01304a]" />
            <h3 className="text-sm font-semibold text-foreground">Vista previa — contrato de {studentName}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-secondary/30 p-5">
          <div className="mx-auto overflow-hidden rounded-xl border border-border bg-white shadow-sm">
            <iframe title="Vista previa del contrato" srcDoc={renderContractHtml(fields)} className="h-[65vh] w-full" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/30 px-5 py-4">
          <p className="text-[11px] text-muted-foreground">Así lo verá {studentName} al abrir el link de firma.</p>
          <div className="flex items-center gap-2">
            <GhostButton onClick={onClose} disabled={sending}>Cerrar</GhostButton>
            <PrimaryButton onClick={onSend} disabled={sending}>
              {sending ? (<><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Enviando…</>) : "Enviar contrato"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#f38934]/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
