// Contrato con firma electrónica in-house — 2026-08-26.
//
// Reemplaza DocuSign/OpenSign (decisión de Jaret: apostar por una experiencia
// premium, mantener al alumno dentro de la plataforma, y no depender de una
// herramienta externa que "muchos pueden ver sketchy"). Mismo pipeline de
// render que receipt-pdf.ts / simple-docs-pdf.ts (html2canvas -> jsPDF), pero
// esta variante NO descarga el archivo (doc.save) — regresa el PDF como
// data URI base64, porque el resultado tiene que subirse a Supabase Storage
// (vía la Edge Function sign-contract) en vez de solo descargarse en el
// navegador de quien lo genera.
//
// ---------------------------------------------------------------------------
// PENDIENTE — el texto legal de abajo (CONTRACT_BODY_TEMPLATE) es un
// PLACEHOLDER estructural, NO el contrato real de Verbo. Jaret ya tiene el
// texto final (lo va a subir después, no estaba en su celular). Cuando lo
// mande, esta es la ÚNICA función que hay que editar — el resto del sistema
// (envío, firma, evidencia, PDF) no cambia. Buscar "TODO(jaret-contrato)".
// ---------------------------------------------------------------------------
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/verbo-logo.png";
// Reuses the SAME asset certificate.ts already uses for student
// certificates — found while building this feature: the file exists in the
// repo but is currently a blank 500x695 canvas (no signature actually drawn
// on it yet), so certificates today already render with an empty signature
// slot. Jaret uploading his real signature to this one path fixes BOTH
// certificates and contracts at once — no second upload needed.
import jaretSignatureUrl from "@/assets/jaret-signature.png";

export interface ContractFields {
  studentName: string;
  studentEmail: string;
  company?: string;
  product?: string; // display name, e.g. "Enterprise"
  accessPlan?: string; // e.g. "Elite"
  contractedLevels?: string[];
  sessionsPerWeek?: number;
  sessionDuration?: number; // minutes
  reschedulePolicy?: string;
  monthlyPrice?: number; // MXN
  paymentDay?: number; // 1-31
  cycleStart?: string; // ISO date
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

function fmtMoney(n?: number): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
}

/** Leyenda de consentimiento — redactada por la skill verbo-legal (2026-08-26),
 *  conforme al Código de Comercio (arts. 89-90, firma electrónica simple).
 *  Este texto SÍ es real y va a producción tal cual, a diferencia del cuerpo
 *  del contrato. Recomendación del skill, pasada a Jaret: esto es apoyo de
 *  IA para uso interno — vale la pena una revisión rápida de un abogado
 *  mercantil antes de que reciba tráfico real, igual que el resto de las
 *  plantillas legales de Verbo. */
export const CONSENT_LEGEND =
  "He leído el contrato mostrado arriba y estoy de acuerdo con sus términos. " +
  "Entiendo que, al firmar electrónicamente a continuación (dibujando o subiendo mi firma), " +
  "esta firma tiene la misma validez legal que una firma autógrafa, de acuerdo con el Código " +
  "de Comercio mexicano (arts. 89 y 90), y que refleja mi consentimiento libre e informado con " +
  "este documento. Acepto que Verbo Language Solutions registre, como evidencia de esta firma, " +
  "la dirección IP, fecha y hora exactas desde las que firmo, así como una huella digital (hash) " +
  "del documento exacto que estoy firmando.";

export const CONSENT_REMINDER =
  "Una vez que firmes, este documento queda bloqueado y no podrá modificarse. Si necesitas corregir algo, contacta a Verbo para que te reenvíen un nuevo contrato.";

// TODO(jaret-contrato): reemplazar este cuerpo por el texto final del
// contrato en cuanto Jaret lo mande. Los placeholders {{...}} ya están
// conectados al resto del sistema (ver ContractFields arriba) — no hace
// falta tocar nada más que este HTML.
function contractBodyHtml(f: ContractFields): string {
  return `
    <h1>Contrato de Prestación de Servicios Educativos</h1>
    <p style="background:#fff6ec;border:1px dashed #f38934;border-radius:8px;padding:10px 14px;color:#8a5620;font-weight:600;">
      PLACEHOLDER — este es un cuerpo de contrato de ejemplo, pendiente de que Jaret proporcione
      el texto legal final. No usar para un envío real todavía.
    </p>
    <p>Entre <strong>Verbo Language Solutions</strong> ("Verbo") y <strong>${f.studentName}</strong> ("el Cliente"),
    ${f.company ? `en representación de <strong>${f.company}</strong>, ` : ""}
    se celebra el presente contrato de prestación de servicios educativos, sujeto a los siguientes términos:</p>
    <table class="concept">
      <thead><tr><th>Concepto</th><th>Detalle</th></tr></thead>
      <tbody>
        <tr><td>Producto</td><td>${f.product ?? "—"}</td></tr>
        <tr><td>Plan de acceso</td><td>${f.accessPlan ?? "—"}</td></tr>
        <tr><td>Niveles contratados</td><td>${(f.contractedLevels ?? []).join(", ") || "—"}</td></tr>
        <tr><td>Sesiones por semana</td><td>${f.sessionsPerWeek ?? "—"}</td></tr>
        <tr><td>Duración de sesión</td><td>${f.sessionDuration ? `${f.sessionDuration} min` : "—"}</td></tr>
        <tr><td>Política de reagendamiento</td><td>${f.reschedulePolicy ?? "—"}</td></tr>
        <tr><td>Precio mensual</td><td>${fmtMoney(f.monthlyPrice)}</td></tr>
        <tr><td>Día de pago</td><td>${f.paymentDay ?? "—"}</td></tr>
        <tr><td>Inicio de ciclo</td><td>${fmtDate(f.cycleStart)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:16px;">[Aquí van las cláusulas completas del contrato: objeto, forma de pago, política de
    cancelación/reagendamiento, causales de terminación, confidencialidad, jurisdicción, etc. —
    pendiente del texto final de Jaret.]</p>
  `;
}

function signatureBlockHtml(opts: { signedAt?: string; studentSignatureDataUrl?: string }): string {
  const studentBlock = opts.studentSignatureDataUrl
    ? `<img src="${opts.studentSignatureDataUrl}" style="height:56px;object-fit:contain;" />`
    : `<div style="height:56px;border-bottom:1px solid #94a3b8;"></div>`;
  return `
    <div class="rule" style="margin-top:28px;"></div>
    <div style="display:flex;justify-content:space-between;margin-top:22px;gap:24px;">
      <div style="flex:1;text-align:center;">
        <img src="${jaretSignatureUrl}" style="height:56px;object-fit:contain;" />
        <div style="border-top:1px solid #94a3b8;margin-top:4px;padding-top:6px;font-size:11px;color:#475569;">
          Jaret Ramírez — Verbo Language Solutions
        </div>
      </div>
      <div style="flex:1;text-align:center;">
        ${studentBlock}
        <div style="border-top:1px solid #94a3b8;margin-top:4px;padding-top:6px;font-size:11px;color:#475569;">
          ${opts.studentSignatureDataUrl ? "Firmado electrónicamente" : "Firma del Cliente (pendiente)"}
          ${opts.signedAt ? `<br/>${new Date(opts.signedAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}` : ""}
        </div>
      </div>
    </div>
  `;
}

/** Misma hoja/estilos que simple-docs-pdf.ts (pageShell) para que el
 *  contrato se vea de la misma familia visual que recibos y constancias. */
function pageHtml(bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;}
  body{margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;color:#1c2b36;}
  .page{width:816px;background:#ffffff;padding:40px 56px 32px;}
  .header{display:flex;align-items:flex-start;justify-content:space-between;}
  .brand{display:flex;align-items:center;gap:14px;}
  .brand img{width:52px;height:52px;border-radius:12px;display:block;}
  .brand .top{font-weight:800;font-size:17px;letter-spacing:1.5px;color:#01304a;}
  .brand .sub{font-weight:600;font-size:9px;letter-spacing:2px;color:#f38934;text-transform:uppercase;}
  .doc-tag{text-align:right;}
  .doc-tag .label{font-weight:700;font-size:11px;letter-spacing:2.5px;color:#f38934;text-transform:uppercase;}
  .doc-tag .date{font-size:11px;color:#6b7c88;margin-top:3px;}
  .rule{height:1px;background:#e3e9ed;margin:18px 0 0;}
  .body{margin-top:22px;}
  .body h1{font-weight:800;font-size:19px;color:#01304a;margin:0 0 14px;}
  .body p{font-size:12.5px;line-height:1.65;color:#3c4650;margin:0 0 14px;}
  table.concept{width:100%;border-collapse:collapse;font-size:12.5px;border-radius:12px;overflow:hidden;border:1px solid #e3e9ed;margin-top:6px;}
  table.concept thead th{background:#01304a;color:#fff;text-align:left;padding:8px 14px;font-weight:600;font-size:10.5px;letter-spacing:0.5px;text-transform:uppercase;}
  table.concept tbody td{padding:7px 14px;border-bottom:1px solid #e3e9ed;font-size:12px;}
  table.concept tbody tr:nth-child(even){background:#f4f6f8;}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e3e9ed;text-align:center;}
  .footer .fword{font-weight:800;font-size:12px;letter-spacing:1.5px;color:#01304a;}
  .footer .fsub{font-size:10px;color:#6b7c88;margin-top:4px;line-height:1.5;}
</style></head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">
      <img src="${logoUrl}" alt="Verbo">
      <div>
        <div class="top">VERBO</div>
        <div class="sub">Language Solutions</div>
      </div>
    </div>
    <div class="doc-tag">
      <div class="label">Contrato</div>
      <div class="date">Emitido el ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="body">
    ${bodyHtml}
  </div>
  <div class="footer">
    <div class="fword">VERBO LANGUAGE SOLUTIONS</div>
    <div class="fsub">verboacademic.com</div>
  </div>
</div>
</body></html>`;
}

export function renderContractHtml(fields: ContractFields, opts: { signedAt?: string; studentSignatureDataUrl?: string } = {}): string {
  return pageHtml(contractBodyHtml(fields) + signatureBlockHtml(opts));
}

/** Same html2canvas -> jsPDF pipeline as receipt-pdf.ts/simple-docs-pdf.ts,
 *  but returns a base64 data URI instead of calling doc.save() — the caller
 *  (the public signing page) sends this to the sign-contract Edge Function
 *  to be hashed, stored, and emailed, it never gets saved locally here. */
export async function renderContractPdfBase64(fields: ContractFields, opts: { signedAt?: string; studentSignatureDataUrl?: string } = {}): Promise<string> {
  const html = renderContractHtml(fields, opts);
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  const pageEl = container.querySelector(".page") as HTMLElement;

  try {
    const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    const ratio = pdfWidth / canvas.width;
    const imgHeightPt = canvas.height * ratio;

    let renderedHeight = 0;
    let page = 0;
    while (renderedHeight < imgHeightPt) {
      if (page > 0) doc.addPage();
      doc.addImage(imgData, "PNG", 0, -renderedHeight, pdfWidth, imgHeightPt);
      renderedHeight += pdfHeight;
      page++;
    }
    return doc.output("datauristring");
  } finally {
    document.body.removeChild(container);
  }
}
