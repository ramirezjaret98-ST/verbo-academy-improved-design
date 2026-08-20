// Hidden facturación (invoice request) page — 2026-08-20 (Feature A10).
//
// Deliberately NOT linked from anywhere in the app's nav/UI. The only way in
// is the "¿Necesitas factura?" link in the "payment_confirmed" email (see
// notify-payment-event's Edge Function), which embeds this page's token.
// That token is the entire access control here — this route works without
// an app session (no useAuth()/login needed), same reasoning as
// reset-password.tsx, since a not-yet-logged-in first-time payer (or a
// payer who simply doesn't want to log in just to request an invoice) must
// still be able to reach it.
//
// All backend logic lives in the public `submit-invoice-request` Edge
// Function (verify_jwt:false, token-gated server-side) — this component is
// just the form. All fiscal fields are marked required in THIS form (a
// valid CFDI needs them), but the backend still accepts partial data if a
// field is left blank by editing the request directly — see that
// function's header for why.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/verbo/Logo";
import { Loader2, Check, AlertTriangle, FileText } from "lucide-react";

export const Route = createFileRoute("/facturacion/$token")({
  head: () => ({ meta: [{ title: "Solicitar factura — Verbo Language Solutions" }] }),
  component: FacturacionPage,
});

type LoadState = "loading" | "ready" | "not_found";

interface PaymentContext {
  amount: number;
  paidAt: string;
  method: string | null;
  payerName: string | null;
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

function FacturacionPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>("loading");
  const [payment, setPayment] = useState<PaymentContext | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [rfc, setRfc] = useState("");
  const [cfdiUse, setCfdiUse] = useState("");
  const [taxRegime, setTaxRegime] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("submit-invoice-request", {
        body: { action: "get", token },
      });
      if (cancelled) return;
      if (fnError || !data?.ok) {
        setState("not_found");
        return;
      }
      setPayment(data.payment ?? null);
      setAlreadySubmitted(data.status === "submitted");
      const existing = data.existing ?? {};
      setBusinessName(existing.business_name ?? "");
      setRfc(existing.rfc ?? "");
      setCfdiUse(existing.cfdi_use ?? "");
      setTaxRegime(existing.tax_regime ?? "");
      setPostalCode(existing.postal_code ?? "");
      setBillingEmail(existing.billing_email ?? "");
      setState("ready");
    })();
    return () => { cancelled = true; };
  }, [token]);

  const canSubmit =
    businessName.trim() && rfc.trim() && cfdiUse.trim() && taxRegime.trim() && postalCode.trim() && billingEmail.trim() && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: fnError } = await supabase.functions.invoke("submit-invoice-request", {
      body: {
        action: "submit",
        token,
        business_name: businessName.trim(),
        rfc: rfc.trim(),
        cfdi_use: cfdiUse.trim(),
        tax_regime: taxRegime.trim(),
        postal_code: postalCode.trim(),
        billing_email: billingEmail.trim(),
      },
    });
    setSubmitting(false);
    if (fnError || !data?.ok) {
      setError("No pudimos enviar tus datos. Intenta de nuevo o escríbenos por WhatsApp.");
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-10">
      <div className="w-full max-w-md">
        <Logo className="mb-8 [&_span]:text-[#01304a] [&_span.text-muted-foreground]:text-[#01304a]/70" />

        {state === "loading" && (
          <div className="flex items-center gap-2 text-sm text-[#01304a]/70">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando tu solicitud…
          </div>
        )}

        {state === "not_found" && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Este enlace no es válido o ya expiró. Escríbenos por WhatsApp y con gusto te ayudamos.</span>
          </div>
        )}

        {state === "ready" && submitted && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>¡Listo! Recibimos tus datos de facturación. Te enviaremos tu factura por correo en los próximos días.</span>
          </div>
        )}

        {state === "ready" && !submitted && (
          <>
            <div className="mb-1 flex items-center gap-2 text-[#01304a]">
              <FileText className="h-5 w-5" />
              <h1 className="text-2xl font-semibold tracking-tight">Solicitar factura</h1>
            </div>
            <p className="mt-1.5 text-sm text-[#01304a]/70">
              Completa tus datos fiscales y te enviaremos tu factura por correo.
            </p>

            {payment && (
              <div className="mt-4 rounded-lg border border-[#01304a]/10 bg-[#01304a]/[0.03] px-3 py-2.5 text-xs text-[#01304a]/80">
                Pago de <strong>{fmtMoney(payment.amount)}</strong> el <strong>{fmtDate(payment.paidAt)}</strong>
              </div>
            )}

            {alreadySubmitted && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Ya habíamos recibido una solicitud para este pago. Puedes actualizar los datos abajo si algo cambió.
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field label="Razón social / Nombre">
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputCls} />
              </Field>
              <Field label="RFC">
                <input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} required className={inputCls} />
              </Field>
              <Field label="Uso de CFDI">
                <input value={cfdiUse} onChange={(e) => setCfdiUse(e.target.value)} required placeholder="p. ej. G03 - Gastos en general" className={inputCls} />
              </Field>
              <Field label="Régimen fiscal">
                <input value={taxRegime} onChange={(e) => setTaxRegime(e.target.value)} required className={inputCls} />
              </Field>
              <Field label="Código postal (fiscal)">
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required className={inputCls} />
              </Field>
              <Field label="Correo para enviar la factura">
                <input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} required className={inputCls} />
              </Field>

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f38934] px-4 py-3 text-sm font-semibold text-white shadow-soft disabled:opacity-60"
              >
                {submitting ? (<><Loader2 className="h-4 w-4 animate-spin text-white" /> Enviando...</>) : "Enviar solicitud"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const inputCls = "mt-1.5 w-full rounded-lg border border-[#01304a]/15 bg-white px-3 py-2.5 text-sm text-[#01304a] focus:outline-none focus:ring-2 focus:ring-[#f38934]/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-[#01304a]">{label}</label>
      {children}
    </div>
  );
}
