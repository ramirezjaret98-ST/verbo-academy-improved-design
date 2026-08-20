import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/verbo-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { productDisplayName } from "@/lib/certificate";
import type { PaymentLogEntry, PaymentMethod } from "@/lib/payments-log";

/* -------------------------------------------------------------------------- */
/* Branded payment receipt (PDF) — student-facing, on-demand, client-side.    */
/*                                                                            */
/* Design approved by Jaret 2026-08-20 (2 HTML mockups reviewed + 2 rounds of */
/* live feedback — see pdfs_funcionales_app_2026-08-20 in project memory).    */
/* Unlike certificate.ts / session-report-pdf.ts (jsPDF's own vector drawing  */
/* — .rect()/.text()/.line()), this one renders the approved HTML/CSS to a    */
/* canvas via html2canvas and drops that image into a jsPDF doc, so it        */
/* matches the approved design pixel-for-pixel. (jsPDF also ships a built-in  */
/* .html() addon backed by the same html2canvas — it was tried first but      */
/* produced blank pages in testing, so this calls html2canvas directly for    */
/* reliability.) Trade-off, flagged to Jaret and accepted: text is rasterized */
/* (not selectable in the PDF), and the file is a bit heavier than a          */
/* pure-vector jsPDF doc.                                                     */
/* -------------------------------------------------------------------------- */

const METHOD_LABELS: Record<PaymentMethod, string> = {
  transferencia: "Transferencia bancaria",
  deposito: "Depósito bancario",
  tarjeta: "Tarjeta",
  efectivo: "Efectivo",
  otro: "Otro",
};

export interface ReceiptStudentInfo {
  id: string;
  name: string;
  product?: string;
  accessPlan?: string;
  company?: string;
}

export interface ReceiptInput {
  student: ReceiptStudentInfo;
  entry: PaymentLogEntry;
  /** Deep link to the facturación form for this specific payment (already
   *  resolved via invoice_requests — see resolveInvoiceUrl() below). Omitted
   *  entirely from the PDF if it couldn't be resolved, rather than showing a
   *  broken/generic link. */
  invoiceUrl?: string;
}

function money(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

/** Short, stable, human-friendly document number derived from the payment's
 *  own numeric id (`pay-123` -> "VLA-000123") — no separate counter table
 *  needed, and it's naturally unique since payment_log_entries.id already is. */
function receiptNumber(entryId: string): string {
  const digits = entryId.replace(/\D/g, "");
  return `VLA-${digits.padStart(6, "0")}`;
}

/** Every payment_log_entries row gets exactly one invoice_requests row (see
 *  invoice-requests.ts) — this looks that token up so the receipt can deep
 *  link straight into the facturación form instead of just describing it.
 *  Students can read their own invoice_requests row as of the 2026-08-20
 *  migration (student_id = auth.uid()); if this fails for any reason
 *  (network, a payment logged before invoice_requests existed, etc.) the
 *  receipt still renders fine, just without the button. */
export async function resolveInvoiceUrl(entryId: string): Promise<string | undefined> {
  const numericId = Number(entryId.replace(/\D/g, ""));
  if (!Number.isFinite(numericId)) return undefined;
  const { data, error } = await supabase
    .from("invoice_requests")
    .select("token")
    .eq("payment_log_entry_id", numericId)
    .maybeSingle();
  if (error || !data?.token) return undefined;
  return `https://verboacademic.com/facturacion/${data.token}`;
}

function row(label: string, value: string | undefined): string {
  if (!value) return "";
  return `<tr><td>${label}</td><td>${value}</td></tr>`;
}

function buildHtml(input: ReceiptInput): string {
  const { student, entry, invoiceUrl } = input;
  const methodLabel = entry.method ? METHOD_LABELS[entry.method] : undefined;
  const planLine = [productDisplayName(student.product ?? ""), student.accessPlan]
    .filter(Boolean)
    .join(" · ");

  const bankLine =
    entry.issuingBank && entry.receivingBank
      ? `${entry.issuingBank} → ${entry.receivingBank}`
      : entry.issuingBank || entry.receivingBank;

  const conceptRows = [
    row("Concepto", `Pago${planLine ? ` — ${planLine}` : ""}`),
    row("Fecha de pago", fmtDate(entry.paid_at)),
    row("Método de pago", methodLabel),
    row("Folio / Referencia", entry.folio),
    row("Clave de rastreo", entry.trackingKey),
    row("Banco emisor / receptor", bankLine),
    row("Últimos 4 dígitos", entry.cardLast4 ? `**** ${entry.cardLast4}` : undefined),
    row("Detalle adicional", entry.methodDetail),
  ].join("");

  const totalRow = `<tr class="total"><td>Total recibido</td><td>${money(entry.amount)} MXN</td></tr>`;

  const invoiceCta = invoiceUrl
    ? `<a class="cta" href="${invoiceUrl}">Solicitar factura</a>`
    : `<p style="margin:10px 0 0;font-size:11.5px;color:#5a4527;">Puedes solicitarla desde tu cuenta de Verbo Academic.</p>`;

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
  .doc-tag .folio{font-weight:800;font-size:15px;color:#01304a;margin-top:4px;}
  .doc-tag .date{font-size:11px;color:#6b7c88;margin-top:3px;}
  .rule{height:1px;background:#e3e9ed;margin:18px 0 0;}
  .hero{margin-top:18px;background:#01304a;border-radius:18px;padding:22px 30px;color:#fff;}
  .hero .eyebrow{font-weight:700;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#f38934;}
  .hero .amount{font-weight:800;font-size:38px;margin-top:6px;letter-spacing:-0.5px;}
  .hero .amount span{font-size:20px;font-weight:600;opacity:0.75;margin-left:6px;}
  .badges{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;}
  .badge{background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:6px 14px;font-size:11.5px;font-weight:500;}
  .badge b{color:#f38934;font-weight:700;}
  .section{margin-top:16px;}
  .section h3{font-weight:700;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#01304a;margin:0 0 10px;}
  .student-row{display:flex;justify-content:space-between;background:#f4f6f8;border-radius:14px;padding:13px 20px;}
  .student-row .name{font-weight:800;font-size:16px;color:#01304a;}
  .student-row .plan{font-size:12px;color:#6b7c88;margin-top:3px;}
  .student-row .right{text-align:right;}
  .student-row .right .l{font-size:10px;color:#6b7c88;text-transform:uppercase;letter-spacing:0.8px;}
  .student-row .right .v{font-weight:700;color:#1c2b36;font-size:13px;margin-top:3px;}
  table.concept{width:100%;border-collapse:collapse;font-size:12.5px;border-radius:12px;overflow:hidden;border:1px solid #e3e9ed;}
  table.concept thead th{background:#01304a;color:#fff;text-align:left;padding:8px 14px;font-weight:600;font-size:10.5px;letter-spacing:0.5px;text-transform:uppercase;}
  table.concept thead th:last-child, table.concept tbody td:last-child{text-align:right;}
  table.concept tbody td{padding:7px 14px;border-bottom:1px solid #e3e9ed;font-size:12px;}
  table.concept tbody tr:nth-child(even){background:#f4f6f8;}
  table.concept tbody tr.total td{border-bottom:none;font-weight:800;color:#01304a;font-size:15px;padding:10px 14px;background:#fff6ec;}
  .issuer-row{display:flex;align-items:center;gap:14px;background:#f4f6f8;border-radius:14px;padding:12px 20px;}
  .seal{width:52px;height:52px;border-radius:50%;overflow:hidden;flex-shrink:0;}
  .seal img{width:100%;height:100%;object-fit:cover;}
  .iname{font-weight:800;font-size:16px;color:#01304a;}
  .itagline{font-size:12px;color:#6b7c88;margin-top:3px;}
  .note{margin-top:16px;background:#fff6ec;border-left:3px solid #f38934;border-radius:0 12px 12px 0;padding:12px 18px;font-size:11.5px;color:#5a4527;line-height:1.45;}
  .note b{color:#e97a1f;}
  .note .cta{display:inline-block;margin-top:8px;background:#01304a;color:#fff;font-weight:700;font-size:11px;text-decoration:none;padding:7px 16px;border-radius:9px;}
  .footer{margin-top:20px;padding-top:14px;border-top:1px solid #e3e9ed;text-align:center;}
  .footer .fword{font-weight:800;font-size:12px;letter-spacing:1.5px;color:#01304a;}
  .footer .fsub{font-size:10px;color:#6b7c88;margin-top:4px;line-height:1.5;}
  .footer .flinks{font-size:10px;margin-top:6px;font-weight:600;}
  .footer .flinks a{color:#e97a1f;text-decoration:none;}
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
      <div class="label">Recibo de pago</div>
      <div class="folio">No. ${receiptNumber(entry.id)}</div>
      <div class="date">Emitido el ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="hero">
    <div class="eyebrow">Monto pagado</div>
    <div class="amount">${money(entry.amount)}<span>MXN</span></div>
    <div class="badges">
      ${planLine ? `<div class="badge">Plan <b>${planLine}</b></div>` : ""}
      ${methodLabel ? `<div class="badge">Método <b>${methodLabel}</b></div>` : ""}
    </div>
  </div>
  <div class="section">
    <h3>Alumno</h3>
    <div class="student-row">
      <div>
        <div class="name">${student.name}</div>
        <div class="plan">${planLine || "Verbo Academy"}${student.company ? ` · ${student.company}` : ""}</div>
      </div>
      <div class="right">
        <div class="l">ID de alumno</div>
        <div class="v">${student.id}</div>
      </div>
    </div>
  </div>
  <div class="section">
    <h3>Desglose del pago</h3>
    <table class="concept">
      <thead><tr><th>Concepto</th><th>Detalle</th></tr></thead>
      <tbody>${conceptRows}${totalRow}</tbody>
    </table>
  </div>
  <div class="section">
    <h3>Emitido por</h3>
    <div class="issuer-row">
      <div class="seal"><img src="${logoUrl}" alt=""></div>
      <div>
        <div class="iname">Verbo Language Solutions</div>
        <div class="itagline">Comunicación global en inglés &middot; verboacademic.com</div>
      </div>
    </div>
  </div>
  <div class="note">
    <b>¿Necesitas factura?</b> Este recibo no constituye un comprobante fiscal (CFDI). Puedes solicitarla dentro de los siguientes 5 días naturales.
    <br>${invoiceCta}
  </div>
  <div class="footer">
    <div class="fword">VERBO LANGUAGE SOLUTIONS</div>
    <div class="fsub">Este documento fue generado automáticamente y es válido sin firma autógrafa.</div>
    <div class="flinks">
      <a href="https://verboacademic.com">verboacademic.com</a>
      &nbsp;&middot;&nbsp;
      <a href="https://wa.me/5212461152136">Contáctanos por WhatsApp</a>
    </div>
  </div>
</div>
</body></html>`;
}

export function receiptFileName(entry: PaymentLogEntry): string {
  return `${receiptNumber(entry.id).toLowerCase()}-recibo-verbo.pdf`;
}

/** Renders the receipt off-screen and triggers a download. Resolves the
 *  invoice_requests token first (see resolveInvoiceUrl) so the "Solicitar
 *  factura" button is a real deep link whenever possible. */
export async function downloadReceiptPdf(input: Omit<ReceiptInput, "invoiceUrl">): Promise<void> {
  const invoiceUrl = await resolveInvoiceUrl(input.entry.id);
  const full: ReceiptInput = { ...input, invoiceUrl };

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = buildHtml(full);
  document.body.appendChild(container);
  const pageEl = container.querySelector(".page") as HTMLElement;

  try {
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    const ratio = pdfWidth / canvas.width;
    const imgHeightPt = canvas.height * ratio;

    // Slice across pages in case a future edit ever pushes content past one
    // Letter page again — normal case (verified 2026-08-20) is a single page.
    let renderedHeight = 0;
    let page = 0;
    while (renderedHeight < imgHeightPt) {
      if (page > 0) doc.addPage();
      doc.addImage(imgData, "PNG", 0, -renderedHeight, pdfWidth, imgHeightPt);
      renderedHeight += pdfHeight;
      page++;
    }

    doc.save(receiptFileName(input.entry));
  } finally {
    document.body.removeChild(container);
  }
}
