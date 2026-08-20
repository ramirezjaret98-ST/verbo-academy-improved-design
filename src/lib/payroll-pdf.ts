import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/verbo-logo.png";
import type { PaymentFrequency } from "@/lib/teacher-model";

/* -------------------------------------------------------------------------- */
/* Branded payroll report (PDF) — teacher-facing, on-demand, client-side.     */
/*                                                                            */
/* Same visual system as the payment receipt (see receipt-pdf.ts — design     */
/* approved by Jaret 2026-08-20, adopted as the base template for the other   */
/* vertical PDFs of this app). Same rendering pipeline too: html2canvas       */
/* renders the approved HTML/CSS to a canvas, which then gets dropped into a  */
/* jsPDF doc via addImage() — jsPDF's own .html() addon was tried first for   */
/* the receipt and produced blank pages, so this file skips straight to the   */
/* pipeline that's actually proven to work.                                   */
/*                                                                            */
/* Replaces the old generatePDF() inside admin.teachers.tsx (pure jsPDF       */
/* rect()/text()/autoTable drawing, brand colors but no real logo/card        */
/* styling — confirmed by Jaret as "ultra genérico").                        */
/* -------------------------------------------------------------------------- */

const FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

export interface PayrollTeacherInfo {
  id: string;
  name: string;
  email: string;
  paymentFrequency: PaymentFrequency;
}

export interface PayrollAdjustment {
  id: string;
  date: string;
  amount: number;
  reason: string;
}

export interface PayrollSummary {
  rate: number;
  hours: number;
  subtotal: number;
  adjustments: number;
  total: number;
}

export interface PayrollInput {
  teacher: PayrollTeacherInfo;
  period: string;
  summary: PayrollSummary;
  adjustments: PayrollAdjustment[];
}

const IVA_RATE = 0.16;

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Signed amount for the Adjustments table — colored + explicit +/− prefix
 *  so a bonus and a deduction are never mistaken for each other at a glance
 *  (adjustments can be negative, see AddAdjustmentModal in admin.teachers.tsx).
 *  Colors match the +/− convention already used in Admin > Money Lab
 *  (text-success / text-destructive). */
function signedMoney(n: number): string {
  const cls = n < 0 ? "neg" : "pos";
  const prefix = n < 0 ? "−" : "+";
  return `<span class="${cls}">${prefix}${money(Math.abs(n))}</span>`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Short, stable, human-friendly document number: period + teacher id digits
 *  (e.g. "August 2026" + teacher "t-42" -> "NOM-202608-000042"). No separate
 *  counter table needed. */
function payrollNumber(period: string, teacherId: string): string {
  const digits = teacherId.replace(/\D/g, "").padStart(6, "0");
  const d = new Date(`1 ${period}`);
  const stamp = Number.isNaN(d.getTime())
    ? period.replace(/\s+/g, "").toUpperCase()
    : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `NOM-${stamp}-${digits}`;
}

function buildHtml(input: PayrollInput): string {
  const { teacher, period, summary, adjustments } = input;
  const freqLabel = FREQUENCY_LABELS[teacher.paymentFrequency];

  const adjustmentRows = adjustments.length
    ? adjustments
        .map(
          (a) =>
            `<tr><td>${fmtDate(a.date)} — ${a.reason}</td><td>${signedMoney(a.amount)}</td></tr>`,
        )
        .join("")
    : `<tr><td>No adjustments this cycle</td><td>—</td></tr>`;

  // IVA is charged only on professional-fee hours (the subtotal), not on
  // manual adjustments/bonuses — confirmed with Jaret 2026-08-20. Adjustments
  // are added to the total AFTER tax, untaxed.
  const iva = summary.subtotal * IVA_RATE;
  const grandTotal = summary.subtotal + iva + summary.adjustments;

  const conceptRows = [
    `<tr><td>Hours worked (this cycle)</td><td>${summary.hours} h</td></tr>`,
    `<tr><td>Hourly rate</td><td>${money(summary.rate)}</td></tr>`,
    `<tr><td>Subtotal</td><td>${money(summary.subtotal)}</td></tr>`,
    `<tr><td>IVA (16%)</td><td>${money(iva)}</td></tr>`,
  ].join("");

  const totalRow = `<tr class="total"><td>Total to pay</td><td>${money(grandTotal)} MXN</td></tr>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
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
  table.concept .pos{color:#1a8f4c;font-weight:700;}
  table.concept .neg{color:#d64545;font-weight:700;}
  table.concept tbody tr:nth-child(even){background:#f4f6f8;}
  table.concept tbody tr.total td{border-bottom:none;font-weight:800;color:#01304a;font-size:15px;padding:10px 14px;background:#fff6ec;}
  .issuer-row{display:flex;align-items:center;gap:14px;background:#f4f6f8;border-radius:14px;padding:12px 20px;}
  .seal{width:52px;height:52px;border-radius:50%;overflow:hidden;flex-shrink:0;}
  .seal img{width:100%;height:100%;object-fit:cover;}
  .iname{font-weight:800;font-size:16px;color:#01304a;}
  .itagline{font-size:12px;color:#6b7c88;margin-top:3px;}
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
      <div class="label">Payroll report</div>
      <div class="folio">No. ${payrollNumber(period, teacher.id)}</div>
      <div class="date">Issued on ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="hero">
    <div class="eyebrow">Total to pay</div>
    <div class="amount">${money(grandTotal)}<span>MXN</span></div>
    <div class="badges">
      <div class="badge">Cycle <b>${period}</b></div>
      <div class="badge">Hours <b>${summary.hours} h</b></div>
    </div>
  </div>
  <div class="section">
    <h3>Teacher</h3>
    <div class="student-row">
      <div>
        <div class="name">${teacher.name}</div>
        <div class="plan">${teacher.email}</div>
      </div>
      <div class="right">
        <div class="l">Payment frequency</div>
        <div class="v">${freqLabel}</div>
      </div>
    </div>
  </div>
  <div class="section">
    <h3>Earnings breakdown</h3>
    <table class="concept">
      <thead><tr><th>Concept</th><th>Amount</th></tr></thead>
      <tbody>${conceptRows}${totalRow}</tbody>
    </table>
  </div>
  <div class="section">
    <h3>Adjustments</h3>
    <table class="concept">
      <thead><tr><th>Detail</th><th>Amount</th></tr></thead>
      <tbody>${adjustmentRows}</tbody>
    </table>
  </div>
  <div class="section">
    <h3>Issued by</h3>
    <div class="issuer-row">
      <div class="seal"><img src="${logoUrl}" alt=""></div>
      <div>
        <div class="iname">Verbo Language Solutions</div>
        <div class="itagline">Comunicación global en inglés &middot; verboacademic.com</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="fword">VERBO LANGUAGE SOLUTIONS</div>
    <div class="fsub">This document was generated automatically and is valid without a handwritten signature.</div>
    <div class="flinks">
      <a href="https://verboacademic.com">verboacademic.com</a>
      &nbsp;&middot;&nbsp;
      <a href="https://wa.me/5212461152136">Contact us on WhatsApp</a>
    </div>
  </div>
</div>
</body></html>`;
}

export function payrollFileName(input: PayrollInput): string {
  const { teacher, period } = input;
  return `${payrollNumber(period, teacher.id).toLowerCase()}-payroll-verbo.pdf`;
}

/** Renders the payroll report off-screen and triggers a download. */
export async function downloadPayrollPdf(input: PayrollInput): Promise<void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = buildHtml(input);
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

    let renderedHeight = 0;
    let page = 0;
    while (renderedHeight < imgHeightPt) {
      if (page > 0) doc.addPage();
      doc.addImage(imgData, "PNG", 0, -renderedHeight, pdfWidth, imgHeightPt);
      renderedHeight += pdfHeight;
      page++;
    }

    doc.save(payrollFileName(input));
  } finally {
    document.body.removeChild(container);
  }
}
