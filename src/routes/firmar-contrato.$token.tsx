// Página pública de firma de contrato — 2026-08-26.
//
// Mismo patrón que facturacion.$token.tsx (Feature A10, 2026-08-20): el
// token en la URL es el único control de acceso, no hay login ni useAuth().
// Toda la lógica que importa (validar el token, guardar IP/hora/hash como
// evidencia, mandar los correos de confirmación) vive server-side en la
// Edge Function `sign-contract` (verify_jwt:false) — este componente solo
// muestra el contrato y arma el PDF final en el navegador del alumno con el
// mismo pipeline que usan los recibos (contract-pdf.ts), pero nunca decide
// por sí solo si el contrato "ya quedó firmado": eso lo dice el backend.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/verbo/Logo";
import { SignaturePad } from "@/components/verbo/SignaturePad";
import { PrimaryButton } from "@/components/verbo/ui";
import { Loader2, Check, AlertTriangle, FileSignature } from "lucide-react";
import { renderContractHtml, renderContractPdfBase64, CONSENT_LEGEND, CONSENT_REMINDER, type ContractFields } from "@/lib/contract-pdf";

export const Route = createFileRoute("/firmar-contrato/$token")({
  head: () => ({ meta: [{ title: "Firmar contrato — Verbo Language Solutions" }] }),
  component: SignContractPage,
});

type LoadState = "loading" | "ready" | "already_signed" | "not_found";

function SignContractPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>("loading");
  const [fields, setFields] = useState<ContractFields | null>(null);
  const [consent, setConsent] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("sign-contract", { body: { action: "get", token } });
      if (cancelled) return;
      if (fnError || !data?.ok) {
        setState("not_found");
        return;
      }
      setFields(data.contract_fields as ContractFields);
      setState(data.status === "signed" ? "already_signed" : "ready");
    })();
    return () => { cancelled = true; };
  }, [token]);

  const canSubmit = consent && !!signatureDataUrl && !submitting;

  const onSubmit = async () => {
    if (!canSubmit || !fields) return;
    setSubmitting(true);
    setError(null);
    try {
      const signedAt = new Date().toISOString();
      const pdfBase64 = await renderContractPdfBase64(fields, { signedAt, studentSignatureDataUrl: signatureDataUrl! });
      const { data, error: fnError } = await supabase.functions.invoke("sign-contract", {
        body: { action: "submit", token, pdfBase64 },
      });
      if (fnError || !data?.ok) {
        setError("No pudimos registrar tu firma. Intenta de nuevo o escríbenos por WhatsApp.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Ocurrió un problema generando tu contrato firmado. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <Logo className="mb-6" />

        {state === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando tu contrato…
          </div>
        )}

        {state === "not_found" && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Este enlace no es válido o el contrato fue anulado. Escríbenos por WhatsApp y con gusto te ayudamos.</span>
          </div>
        )}

        {state === "already_signed" && !submitted && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Este contrato ya fue firmado. Si necesitas otra copia, escríbenos por WhatsApp.</span>
          </div>
        )}

        {submitted && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>¡Listo! Tu contrato quedó firmado. Te llegará una copia por correo en unos minutos.</span>
          </div>
        )}

        {state === "ready" && !submitted && fields && (
          <>
            <div className="mb-4 flex items-center gap-2 text-[#01304a]">
              <FileSignature className="h-5 w-5" />
              <h1 className="text-xl font-semibold tracking-tight">Revisa y firma tu contrato</h1>
            </div>

            <div className="mb-5 overflow-hidden rounded-xl border border-border bg-white shadow-sm">
              <iframe
                title="Contrato"
                srcDoc={renderContractHtml(fields)}
                className="h-[500px] w-full"
              />
            </div>

            <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <label className="flex items-start gap-2.5 text-xs text-foreground/90">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{CONSENT_LEGEND}</span>
              </label>

              <div className="mt-5">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tu firma</div>
                <SignaturePad onChange={setSignatureDataUrl} />
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">{CONSENT_REMINDER}</p>

              {error && (
                <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>
              )}

              <div className="mt-4">
                <PrimaryButton onClick={onSubmit} disabled={!canSubmit} className="w-full justify-center">
                  {submitting ? (<><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Firmando…</>) : "Firmar contrato"}
                </PrimaryButton>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
