import { jsPDF } from "jspdf";

/* -------------------------------------------------------------------------- */
/* Branded 1:1 session report (PDF) — shared by the teacher's "Download PDF"  */
/* button (generated instantly, client-side) and the copy uploaded to        */
/* Storage so the student can download the same report later.               */
/* -------------------------------------------------------------------------- */

const NAVY: [number, number, number] = [1, 48, 74];
const ORANGE: [number, number, number] = [243, 137, 52];
const WHITE: [number, number, number] = [255, 255, 255];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [226, 232, 240];

export interface SessionReportEntry {
  id: string;
  type: string;
  content: string;
}

export interface SessionReportInput {
  studentName: string;
  dateLabel: string;
  status: string;
  notes: string;
  entries: SessionReportEntry[];
}

export function sessionReportFileName({ studentName, dateLabel }: SessionReportInput): string {
  const slug = (s: string) => s.trim().replace(/\s+/g, "-").toLowerCase();
  return `verbo-session-report-${slug(studentName || "student")}-${slug(dateLabel || "session")}.pdf`;
}

function statusLabel(status: string): string {
  if (status === "completed") return "Completed";
  if (status === "absent") return "Absent";
  if (status === "delayed") return "Delayed";
  return status;
}

/** Builds the branded session-report PDF document (does not save/download it). */
export function buildSessionReportPdf(input: SessionReportInput): jsPDF {
  const { studentName, dateLabel, status, notes, entries } = input;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 48;
  let y = 0;

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 96, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...WHITE);
  doc.text("VERBO", MARGIN, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text("LANGUAGE SOLUTIONS", MARGIN, 58, { charSpace: 2 });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...WHITE);
  doc.text("Final Session Report", W - MARGIN, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED as unknown as [number, number, number]);
  doc.setTextColor(220, 226, 233);
  doc.text(dateLabel, W - MARGIN, 60, { align: "right" });

  y = 128;

  // Student / status summary
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("STUDENT", MARGIN, y);
  doc.text("STATUS", W - MARGIN - 120, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(studentName || "-", MARGIN, y);
  doc.text(statusLabel(status), W - MARGIN - 120, y);

  y += 24;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 28;

  // Pedagogical entries
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(`Pedagogical entries (${entries.length})`, MARGIN, y);
  y += 14;

  const contentWidth = W - MARGIN * 2;
  if (entries.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("No entries recorded for this session.", MARGIN, y);
    y += 20;
  } else {
    for (const e of entries) {
      const typeW = 96;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...ORANGE);
      doc.text(e.type.toUpperCase(), MARGIN, y + 10, { charSpace: 0.5 });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(e.content, contentWidth - typeW - 8);
      doc.text(lines, MARGIN + typeW, y + 10);

      const blockHeight = Math.max(20, lines.length * 13 + 6);
      y += blockHeight;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y, W - MARGIN, y);
      y += 16;

      if (y > 740) {
        doc.addPage();
        y = 56;
      }
    }
  }

  // Teacher's comments
  if (notes.trim().length > 0) {
    if (y > 680) {
      doc.addPage();
      y = 56;
    }
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Teacher's comments", MARGIN, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const noteLines = doc.splitTextToSize(notes.trim(), contentWidth);
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 13;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("verbolanguagesolutions.com", MARGIN, H - 24);
    doc.text(`Page ${p} of ${pageCount}`, W - MARGIN, H - 24, { align: "right" });
  }

  return doc;
}

/** Generates the report PDF and triggers an immediate browser download. */
export function downloadSessionReportPdf(input: SessionReportInput): void {
  const doc = buildSessionReportPdf(input);
  doc.save(sessionReportFileName(input));
}

/** Generates the report PDF as a Blob, for upload to Storage. */
export function sessionReportPdfBlob(input: SessionReportInput): Blob {
  const doc = buildSessionReportPdf(input);
  return doc.output("blob");
}
