// ============================================================================
// Shared "Mark as Paid" modal — 2026-08-20, Feature A7.
//
// Replaces the old one-click Mark-as-Paid buttons across Students, Groups,
// and The Money Lab with a small form that captures payment-method detail
// (used for the receipt PDF and, for individual payments, the invoicing
// flow — see invoice-requests.ts). Which fields are shown varies by method
// (Jaret's original answer), but NONE are required — his explicit follow-up
// correction: "haz que todos los campos sean opcionales ya que a veces los
// depositos no tienen los mismos datos de transferencias y asi".
//
// This component only COLLECTS the detail and hands it to `onConfirm` — it
// does not know how to persist a payment. Each call site still owns that
// (logPayment / markInstallmentPaid / markGroupAsPaid), so this one modal
// can be reused everywhere without coupling to any single data path.
//
// `planContext`, when passed, is purely a display convenience ("Pago 2 de
// 3") — it answers Jaret's question about whether the modal already knows a
// student's plan type: yes, the CALLER looks that up via payment-plans.ts
// (activePlanForStudent / nextPendingInstallment) and passes it in here.
// ============================================================================
import { useState } from "react";
import { Wallet, AlertTriangle } from "lucide-react";
import { AccentModal, AccentModalFooter, GhostButton, PrimaryButton } from "./ui";
import type { PaymentDetailFields, PaymentMethod } from "@/lib/payments-log";

const HEADER_BG = "linear-gradient(135deg, #0f7a4a 0%, #0a5c38 100%)";

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "transferencia", label: "Transferencia" },
  { value: "deposito", label: "Depósito" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "efectivo", label: "Efectivo" },
  { value: "otro", label: "Otro" },
];

// Which extra fields make sense to show per method — purely a UX hint, never
// enforced (all fields are optional no matter which method is picked).
function fieldsForMethod(method: PaymentMethod | undefined) {
  switch (method) {
    case "transferencia":
      return { bank: true, trackingKey: true, folio: true, cardLast4: false };
    case "deposito":
      return { bank: true, trackingKey: false, folio: true, cardLast4: false };
    case "tarjeta":
      return { bank: false, trackingKey: false, folio: true, cardLast4: true };
    case "efectivo":
      return { bank: false, trackingKey: false, folio: true, cardLast4: false };
    default:
      return { bank: false, trackingKey: false, folio: false, cardLast4: false };
  }
}

const inputClass =
  "mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelClass = "text-xs font-medium text-foreground";

export function MarkAsPaidModal({
  entityLabel,
  amount,
  planContext,
  onClose,
  onConfirm,
}: {
  entityLabel: string;
  amount: number;
  planContext?: {
    installmentNumber: number;
    installmentsCount: number;
    planType: "single" | "installments";
  };
  onClose: () => void;
  onConfirm: (detail: PaymentDetailFields) => void | Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod | undefined>(undefined);
  const [folio, setFolio] = useState("");
  const [trackingKey, setTrackingKey] = useState("");
  const [issuingBank, setIssuingBank] = useState("");
  const [receivingBank, setReceivingBank] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [methodDetail, setMethodDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = fieldsForMethod(method);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const detail: PaymentDetailFields = {
        ...(method ? { method } : {}),
        ...(folio.trim() ? { folio: folio.trim() } : {}),
        ...(trackingKey.trim() ? { trackingKey: trackingKey.trim() } : {}),
        ...(issuingBank.trim() ? { issuingBank: issuingBank.trim() } : {}),
        ...(receivingBank.trim() ? { receivingBank: receivingBank.trim() } : {}),
        ...(cardLast4.trim() ? { cardLast4: cardLast4.trim() } : {}),
        ...(methodDetail.trim() ? { methodDetail: methodDetail.trim() } : {}),
      };
      await onConfirm(detail);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AccentModal
      background={HEADER_BG}
      iconTint="#ffffff"
      icon={Wallet}
      eyebrow="Mark as Paid"
      title={entityLabel}
      watermark={{ type: "icon", icon: Wallet }}
      maxWidth="max-w-md"
      onClose={onClose}
    >
      <div className="p-6">
        <div className="flex items-baseline justify-between rounded-lg border border-border bg-secondary/40 p-3">
          <span className="text-sm text-muted-foreground">Monto</span>
          <span className="text-lg font-semibold text-foreground">
            ${amount.toLocaleString("es-MX")} MXN
          </span>
        </div>
        {planContext && (
          <p className="mt-2 text-xs text-muted-foreground">
            {planContext.planType === "single"
              ? "Pago único"
              : `Pago ${planContext.installmentNumber} de ${planContext.installmentsCount}`}
          </p>
        )}

        <div className="mt-4">
          <label className={labelClass}>Método de pago (opcional)</label>
          <select
            value={method ?? ""}
            onChange={(e) => setMethod((e.target.value || undefined) as PaymentMethod | undefined)}
            className={inputClass}
          >
            <option value="">Sin especificar</option>
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Todos los campos de abajo son opcionales, incluso si eliges un método.
          </p>
        </div>

        {shown.bank && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Banco emisor</label>
              <input value={issuingBank} onChange={(e) => setIssuingBank(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Banco receptor</label>
              <input value={receivingBank} onChange={(e) => setReceivingBank(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}

        {shown.trackingKey && (
          <div className="mt-3">
            <label className={labelClass}>Clave de rastreo</label>
            <input value={trackingKey} onChange={(e) => setTrackingKey(e.target.value)} className={inputClass} />
          </div>
        )}

        {shown.cardLast4 && (
          <div className="mt-3">
            <label className={labelClass}>Últimos 4 dígitos</label>
            <input
              value={cardLast4}
              onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              maxLength={4}
              className={inputClass}
            />
          </div>
        )}

        {shown.folio && (
          <div className="mt-3">
            <label className={labelClass}>Folio / referencia</label>
            <input value={folio} onChange={(e) => setFolio(e.target.value)} className={inputClass} />
          </div>
        )}

        <div className="mt-3">
          <label className={labelClass}>Notas (opcional)</label>
          <textarea
            value={methodDetail}
            onChange={(e) => setMethodDetail(e.target.value)}
            rows={2}
            placeholder="Cualquier otro detalle del pago"
            className={inputClass}
          />
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <AccentModalFooter>
        <GhostButton onClick={onClose} disabled={submitting}>Cancel</GhostButton>
        <PrimaryButton onClick={submit} accentColor="#0a5c38" disabled={submitting}>
          {submitting ? "Guardando..." : "Confirm Payment"}
        </PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}
