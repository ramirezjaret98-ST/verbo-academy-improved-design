// "Enviar contrato" — botón nuevo en el perfil del alumno (Admin), 2026-08-26.
// Reemplaza DocuSign/OpenSign: genera el link único de firma y dispara el
// correo al alumno. Ver src/lib/contracts.ts (lógica) y
// src/routes/firmar-contrato.$token.tsx (lo que ve el alumno).
import { useState } from "react";
import { FileSignature, Loader2, Check, Eye } from "lucide-react";
import { GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import { contractFieldsFromStudent, createContractAndNotify } from "@/lib/contracts";
import { renderContractHtml, type ContractFields } from "@/lib/contract-pdf";
import type { User } from "@/lib/mock-data";
import { notifyError, notifySuccess } from "@/lib/notify";

export function SendContractModal({ student, onClose }: { student: User; onClose: () => void }) {
  const { user } = useAuth();
  const [fields, setFields] = useState<ContractFields>(() => contractFieldsFromStudent(student));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const set = <K extends keyof ContractFields>(key: K, value: ContractFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!user) return;
    setSending(true);
    const res = await createContractAndNotify({ studentId: student.id, createdBy: user.id, fields });
    setSending(false);
    if (!res.ok) {
      notifyError(res.error, { context: `Enviando contrato a ${student.name}` });
      return;
    }
    notifySuccess(`Contrato enviado a ${student.name} (${student.email}).`);
    setSent(true);
  };

  const preview = () => {
    setPreviewing(true);
    try {
      const blob = new Blob([renderContractHtml(fields)], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } finally {
      setPreviewing(false);
    }
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
                <Field label="Precio total del paquete (MXN, pago único)">
                  <input type="number" value={fields.totalPrice ?? ""} onChange={(e) => set("totalPrice", e.target.value ? Number(e.target.value) : undefined)} className={inputCls} />
                </Field>
                <Field label="Fecha límite de pago">
                  <input type="date" value={fields.paymentDueDate?.slice(0, 10) ?? ""} onChange={(e) => set("paymentDueDate", e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
                El texto legal es el contrato real que confirmaste (Ericka Escamilla, 2026-08-27), con solo estos datos como variables. Está modelado como pago único por el paquete completo — si necesitas mensualidades para otro alumno, avísame antes de enviarlo.
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border bg-secondary/30 px-5 py-4">
              <GhostButton onClick={preview} disabled={previewing}><Eye className="h-3.5 w-3.5" /> Vista previa</GhostButton>
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
