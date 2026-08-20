import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/verbo-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { productDisplayName } from "@/lib/certificate";
import { paymentsForEntity, type PaymentLogEntry, type PaymentMethod } from "@/lib/payments-log";
import type { TeacherKpis } from "@/lib/teacher-kpis";

/* -------------------------------------------------------------------------- */
/* 4 lightweight branded documents — simplified design, at Jaret's explicit   */
/* request 2026-08-20 ("no necesitan gran diseño, podemos simplificar el      */
/* diseño"). No hero card / no circular seal like the receipt/payroll — just  */
/* header + body + footer. Same rendering pipeline as receipt-pdf.ts /        */
/* payroll-pdf.ts (html2canvas -> addImage, jsPDF's own .html() addon is not  */
/* used — it produced blank pages when this pattern was first tried).        */
/*                                                                            */
/* Student-facing docs (enrollment letter, account statement) are in Spanish  */
/* to match the payment receipt — Verbo's students/HR contacts are Spanish-   */
/* speaking even though the app's own UI chrome is English. The 2 new        */
/* teacher docs are ALSO in Spanish here (unlike payroll-pdf.ts, which        */
/* matches admin.teachers.tsx's English UI) because they're meant for the    */
/* teacher's own external/fiscal use in Mexico — flag to Jaret if he'd        */
/* rather have these in English instead.                                    */
/*                                                                            */
/* The "constancia de colaboración" wording below is a plain-language draft, */
/* NOT reviewed by the Legal skill/chat — it touches independent-contractor   */
/* language that has real labor-law implications in Mexico. Recommend a      */
/* pass through the verbo-legal skill before this one goes out to real        */
/* teachers.                                                                 */
/* -------------------------------------------------------------------------- */

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

function money(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
}

function docNumber(prefix: string, id: string): string {
  const digits = id.replace(/\D/g, "").padStart(6, "0");
  return `${prefix}-${digits}`;
}

/* ---------------------------------------------------------------------- */
/* Shared shell — header (logo + doc tag) / body slot / footer.            */
/* ---------------------------------------------------------------------- */
function pageShell(opts: { docLabel: string; folio: string; bodyHtml: string }): string {
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
  .body{margin-top:22px;}
  .body h1{font-weight:800;font-size:19px;color:#01304a;margin:0 0 14px;}
  .body p{font-size:12.5px;line-height:1.65;color:#3c4650;margin:0 0 14px;}
  table.concept{width:100%;border-collapse:collapse;font-size:12.5px;border-radius:12px;overflow:hidden;border:1px solid #e3e9ed;margin-top:6px;}
  table.concept thead th{background:#01304a;color:#fff;text-align:left;padding:8px 14px;font-weight:600;font-size:10.5px;letter-spacing:0.5px;text-transform:uppercase;}
  table.concept thead th:last-child, table.concept tbody td:last-child{text-align:right;}
  table.concept tbody td{padding:7px 14px;border-bottom:1px solid #e3e9ed;font-size:12px;}
  table.concept tbody tr:nth-child(even){background:#f4f6f8;}
  table.concept tbody tr.total td{border-bottom:none;font-weight:800;color:#01304a;font-size:14px;padding:9px 14px;background:#fff6ec;}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e3e9ed;text-align:center;}
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
      <div class="label">${opts.docLabel}</div>
      <div class="folio">No. ${opts.folio}</div>
      <div class="date">Emitido el ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="body">
    ${opts.bodyHtml}
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

/** Shared render pipeline — same as receipt-pdf.ts / payroll-pdf.ts. */
async function renderPdf(html: string, fileName: string): Promise<void> {
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

    doc.save(fileName);
  } finally {
    document.body.removeChild(container);
  }
}

/* ========================================================================== */
/* 1. Constancia de inscripción / alumno activo                               */
/* ========================================================================== */

export interface EnrollmentStudentInfo {
  id: string;
  name: string;
  product?: string;
  accessPlan?: string;
  currentLevel?: string;
  company?: string;
}

/** Best-effort lookup of app_users.created_at for the "alumno desde" line —
 *  not modeled on the frontend User type (see mock-data.ts), queried directly
 *  since it's only needed here. Falls back to omitting the line if it fails
 *  (network, legacy record, etc.) rather than blocking the document. */
export async function resolveMemberSince(studentId: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("app_users")
    .select("created_at")
    .eq("id", studentId)
    .maybeSingle();
  if (error || !data?.created_at) return undefined;
  return data.created_at as string;
}

export async function downloadEnrollmentPdf(student: EnrollmentStudentInfo): Promise<void> {
  const memberSince = await resolveMemberSince(student.id);
  const planLine = [productDisplayName(student.product ?? ""), student.accessPlan].filter(Boolean).join(" · ");
  const folio = docNumber("VLA-CONST", student.id);

  const rows = [
    `<tr><td>Alumno</td><td>${student.name}</td></tr>`,
    planLine ? `<tr><td>Plan</td><td>${planLine}</td></tr>` : "",
    student.currentLevel ? `<tr><td>Nivel actual</td><td>${student.currentLevel}</td></tr>` : "",
    student.company ? `<tr><td>Empresa</td><td>${student.company}</td></tr>` : "",
    `<tr><td>Estatus</td><td>Activo</td></tr>`,
    memberSince ? `<tr><td>Alumno desde</td><td>${fmtDate(memberSince)}</td></tr>` : "",
  ].join("");

  const bodyHtml = `
    <h1>Constancia de Inscripción</h1>
    <p>Por medio del presente documento, <b>Verbo Language Solutions</b> hace constar que
    <b>${student.name}</b> se encuentra actualmente inscrito(a) y activo(a) en nuestra
    academia de comunicación en inglés, bajo los siguientes datos:</p>
    <table class="concept"><tbody>${rows}</tbody></table>
    <p style="margin-top:16px;">Este documento se expide para los fines que el interesado
    estime convenientes.</p>
  `;

  const html = pageShell({ docLabel: "Constancia de inscripción", folio, bodyHtml });
  await renderPdf(html, `${folio.toLowerCase()}-constancia-inscripcion.pdf`);
}

/* ========================================================================== */
/* 2. Estado de cuenta / historial de pagos                                   */
/* ========================================================================== */

const METHOD_LABELS: Record<PaymentMethod, string> = {
  transferencia: "Transferencia bancaria",
  deposito: "Depósito bancario",
  tarjeta: "Tarjeta",
  efectivo: "Efectivo",
  otro: "Otro",
};

export interface StatementStudentInfo {
  id: string;
  name: string;
}

/** v1: full payment history (no date-range picker) — simplest useful version,
 *  matches Jaret's "simplify" request. A period filter can be layered on
 *  later if he wants one. */
export async function downloadStatementPdf(student: StatementStudentInfo): Promise<void> {
  const entries: PaymentLogEntry[] = paymentsForEntity("individual", student.id);
  const folio = docNumber("VLA-EDC", student.id);

  const rows = entries.length
    ? entries
        .map((e) => {
          const label = e.method ? METHOD_LABELS[e.method] : "—";
          return `<tr><td>${fmtDate(e.paid_at)}</td><td>${label}</td><td>${money(e.amount)}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3">No hay pagos registrados.</td></tr>`;

  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  const totalRow = entries.length
    ? `<tr class="total"><td colspan="2">Total pagado</td><td>${money(total)} MXN</td></tr>`
    : "";

  const bodyHtml = `
    <h1>Estado de Cuenta</h1>
    <p>Historial completo de pagos registrados por <b>${student.name}</b> en
    Verbo Language Solutions.</p>
    <table class="concept">
      <thead><tr><th>Fecha</th><th>Método</th><th>Monto</th></tr></thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
  `;

  const html = pageShell({ docLabel: "Estado de cuenta", folio, bodyHtml });
  await renderPdf(html, `${folio.toLowerCase()}-estado-de-cuenta.pdf`);
}

/* ========================================================================== */
/* 3. Constancia de colaboración (profesor)                                   */
/* ========================================================================== */

export interface CollaborationTeacherInfo {
  id: string;
  name: string;
  email: string;
  hireDate?: string;
}

export async function downloadCollaborationPdf(teacher: CollaborationTeacherInfo): Promise<void> {
  const folio = docNumber("VLA-COLAB", teacher.id);

  const rows = [
    `<tr><td>Profesor(a)</td><td>${teacher.name}</td></tr>`,
    `<tr><td>Correo</td><td>${teacher.email}</td></tr>`,
    teacher.hireDate ? `<tr><td>Colabora desde</td><td>${fmtDate(teacher.hireDate)}</td></tr>` : "",
    `<tr><td>Estatus</td><td>Activo</td></tr>`,
  ].join("");

  const bodyHtml = `
    <h1>Constancia de Colaboración</h1>
    <p>Por medio del presente documento, <b>Verbo Language Solutions</b> hace constar que
    <b>${teacher.name}</b> colabora actualmente con esta institución impartiendo clases de
    inglés, bajo un esquema de prestación de servicios profesionales independientes.</p>
    <table class="concept"><tbody>${rows}</tbody></table>
    <p style="margin-top:16px;">Este documento se expide para los fines que el interesado
    estime convenientes. Verbo Language Solutions y el/la colaborador(a) mantienen una
    relación de prestación de servicios profesionales independiente, sin subordinación
    laboral.</p>
  `;

  const html = pageShell({ docLabel: "Constancia de colaboración", folio, bodyHtml });
  await renderPdf(html, `${folio.toLowerCase()}-constancia-colaboracion.pdf`);
}

/* ========================================================================== */
/* 4. Resumen de desempeño / KPIs (profesor)                                  */
/* ========================================================================== */

export interface KpiSummaryTeacherInfo {
  id: string;
  name: string;
  email: string;
}

export interface KpiSummaryInput {
  teacher: KpiSummaryTeacherInfo;
  period: string;
  kpis: TeacherKpis;
  activeStudentCount: number;
}

function bonusStatusLabel(kpis: TeacherKpis): string {
  if (kpis.onboarding) return "En periodo de onboarding";
  return kpis.bonusEligible ? "Elegible para bono" : "No elegible este periodo";
}

export async function downloadKpiSummaryPdf(input: KpiSummaryInput): Promise<void> {
  const { teacher, period, kpis, activeStudentCount } = input;
  const folio = docNumber("VLA-KPI", teacher.id);

  const rows = [
    `<tr><td>Profesor(a)</td><td>${teacher.name}</td></tr>`,
    `<tr><td>Periodo</td><td>${period}</td></tr>`,
    `<tr><td>Alumnos activos</td><td>${activeStudentCount}</td></tr>`,
    `<tr><td>Calificación promedio</td><td>${kpis.rating != null ? kpis.rating.toFixed(1) + " / 5.0" : "Sin calificaciones aún"}</td></tr>`,
    `<tr><td>Puntualidad de conexión</td><td>${kpis.connectionPunctuality}%</td></tr>`,
    `<tr><td>Puntualidad de planeación</td><td>${kpis.planningPunctuality}%</td></tr>`,
    `<tr><td>Tasa de finalización</td><td>${kpis.completionRate}%</td></tr>`,
    `<tr class="total"><td>Puntaje compuesto</td><td>${kpis.composite}/100</td></tr>`,
  ].join("");

  const bodyHtml = `
    <h1>Resumen de Desempeño</h1>
    <p>Resumen de métricas de desempeño de <b>${teacher.name}</b> en Verbo Language
    Solutions para el periodo indicado. Estatus de bono: <b>${bonusStatusLabel(kpis)}</b>.</p>
    <table class="concept"><tbody>${rows}</tbody></table>
  `;

  const html = pageShell({ docLabel: "Resumen de desempeño", folio, bodyHtml });
  await renderPdf(html, `${folio.toLowerCase()}-resumen-desempeno.pdf`);
}
