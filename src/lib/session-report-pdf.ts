import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logoUrl from "@/assets/verbo-logo.png";

/* -------------------------------------------------------------------------- */
/* Branded 1:1 session report (PDF) — shared by the teacher's "Download PDF"  */
/* button (generated instantly, client-side) and the copy uploaded to        */
/* Storage so the student can download the same report later.               */
/*                                                                            */
/* 2026-08-14 redesign (Jaret's live feedback on the exported PDF): added the */
/* real brand mark to the header, dropped "Final" from the title, split each  */
/* pedagogical entry into its own Word / Definition columns, and gave the     */
/* teacher's comments their own card.                                        */
/* 2026-08-14 tweaks (second round of live feedback): organic wave shapes for */
/* the header (navy) and footer (orange) instead of hard rectangles, the      */
/* wordmark text is now all-white, added the student's skill-rating cards     */
/* before the teacher's comments, rounded the table/card corners throughout,  */
/* and sanitized text going into the PDF so unsupported characters (e.g. IPA  */
/* phonetic symbols pasted into a Pronunciation entry) can never throw off    */
/* jsPDF's width calculation and spill text outside its table cell.          */
/* -------------------------------------------------------------------------- */

const NAVY: [number, number, number] = [1, 48, 74];
const ORANGE: [number, number, number] = [243, 137, 52];
const WHITE: [number, number, number] = [255, 255, 255];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [226, 232, 240];
const TEXT: [number, number, number] = [30, 41, 59];
const CARD_BG: [number, number, number] = [244, 246, 248];
const STRIPE_BG: [number, number, number] = [248, 250, 251];
const TRACK_BG: [number, number, number] = [226, 232, 240];

export interface SessionReportEntry {
  id: string;
  type: string;
  term: string;
  explanation: string;
}

export interface SessionReportSkills {
  fluency: number;
  vocabulary: number;
  confidence: number;
  grammar: number;
}

export interface SessionReportInput {
  studentName: string;
  dateLabel: string;
  status: string;
  notes: string;
  entries: SessionReportEntry[];
  /** Optional — Teacher's Skill Rating of the Student (0-5 per dimension).
   *  Dimensions at 0 mean "not rated this session" and are omitted from the
   *  PDF rather than shown as a 0/5 score. */
  skills?: SessionReportSkills;
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

// jsPDF's built-in Helvetica only reliably encodes ASCII + the standard
// Latin-1/WinAnsi accented letters (covers Spanish á/é/í/ó/ú/ñ fine, already
// verified visually). IPA phonetic symbols (e.g. "θ", "ɜ", "ʊ") sit outside
// that range — jsPDF still renders *something* for them, but different PDF
// viewers can draw a different fallback glyph with a different actual width
// than what jsPDF assumed while wrapping the cell text, which is what let
// text spill past its column in some viewers. Transliterating the common IPA
// symbols (and dropping anything else unmapped) keeps the wrap width and the
// rendered width always in sync, so this can't happen regardless of viewer.
const IPA_FALLBACK: Record<string, string> = {
  "θ": "th", "ð": "th", "ʃ": "sh", "ʒ": "zh", "ŋ": "ng", "ʧ": "ch", "ʤ": "j",
  "ɜ": "er", "ɪ": "i", "ʊ": "u", "ʌ": "u", "ə": "uh", "æ": "a", "ɑ": "a",
  "ɒ": "o", "ɔ": "o", "ɛ": "e", "ɹ": "r", "ɾ": "r", "ʔ": "'", "ɡ": "g",
  "ˈ": "", "ˌ": "", "ː": "",
};
// A few common punctuation marks that live outside the Latin-1 block but are
// still part of WinAnsiEncoding (what jsPDF's built-in Helvetica actually
// uses), so they render safely and consistently: en/em dash, curly quotes,
// ellipsis, bullet.
const WINANSI_EXTRAS = new Set([
  0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026, 0x2022, 0x2122,
]);

// The IPA_FALLBACK lookup runs BEFORE the codepoint-range checks below,
// regardless of which Unicode block a symbol happens to live in: some common
// IPA symbols (e.g. theta, eng) reuse codepoints from ranges (Greek letters,
// Latin Extended-A) that would otherwise look "safe" and slip through
// unsanitized.
function sanitizePdfText(input: string): string {
  if (!input) return input;
  let out = "";
  for (const ch of input) {
    if (IPA_FALLBACK[ch] !== undefined) {
      out += IPA_FALLBACK[ch];
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0xff || WINANSI_EXTRAS.has(code)) {
      // Plain ASCII + Latin-1/WinAnsi (covers Spanish accents) plus the safe
      // punctuation set above \u2014 jsPDF's built-in Helvetica renders these
      // consistently across viewers, already verified visually.
      out += ch;
      continue;
    }
    // Last resort for anything unmapped: drop the decomposed accent/mark and
    // keep the plain base letter if there is one, otherwise drop silently.
    const base = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    if (base && /^[\x00-\xff]+$/.test(base)) out += base;
  }
  return out;
}

// jsPDF's addImage() needs actual image data (a data URL), not a bare asset
// URL — the bundled PNG (imported via Vite, so it resolves to a hashed
// /assets/... URL in production) gets fetched and converted once, then the
// data URL is cached for the rest of the session so repeat downloads don't
// re-fetch it. Falls back to a text-only header if it can't be loaded for
// any reason (offline, blocked request, etc.) rather than failing the report.
let logoDataUrlPromise: Promise<string | null> | null = null;
function loadLogoDataUrl(): Promise<string | null> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(logoUrl)
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
      .catch((err) => {
        console.error("[session-report-pdf] failed to load logo", err);
        return null;
      });
  }
  return logoDataUrlPromise;
}

/** Draws the organic navy header wave. Everything the header needs to show
 *  (logo, wordmark, title, date) fits inside the guaranteed-flat 0..HEADER_BASE
 *  zone — the wave only ever ADDS extra height below that, so content can
 *  never get clipped by the dip. */
function drawHeaderWave(doc: jsPDF, W: number) {
  const HEADER_BASE = 64;
  const ctx = (doc as unknown as { context2d: CanvasRenderingContext2D }).context2d;
  ctx.save();
  ctx.fillStyle = "#01304a";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, HEADER_BASE);
  ctx.bezierCurveTo(W * 0.85, HEADER_BASE, W * 0.8, HEADER_BASE + 20, W * 0.6, HEADER_BASE + 16);
  ctx.bezierCurveTo(W * 0.42, HEADER_BASE + 12, W * 0.3, HEADER_BASE, W * 0.15, HEADER_BASE + 4);
  ctx.bezierCurveTo(W * 0.08, HEADER_BASE + 6, W * 0.02, HEADER_BASE + 2, 0, HEADER_BASE);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return HEADER_BASE;
}

/** Draws the small organic orange footer wave — deliberately much smaller
 *  than the header, and low enough that it never gets near the footer text
 *  line (drawn separately, above this). */
function drawFooterWave(doc: jsPDF, W: number, H: number) {
  const ctx = (doc as unknown as { context2d: CanvasRenderingContext2D }).context2d;
  ctx.save();
  ctx.fillStyle = "#f38934";
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(W, H);
  ctx.lineTo(W, H - 14);
  ctx.bezierCurveTo(W * 0.78, H - 14, W * 0.7, H - 22, W * 0.5, H - 17);
  ctx.bezierCurveTo(W * 0.32, H - 13, W * 0.2, H - 8, 0, H - 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draws a filled rectangle with only its TOP-LEFT/TOP-RIGHT corners rounded
 *  (used for the entries-table header band, which sits directly on top of
 *  the table body below it — rounding the bottom corners there would leave
 *  a visible notch against the flat-topped body). */
function fillTopRoundedRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number, r: number,
  color: [number, number, number],
) {
  const ctx = (doc as unknown as { context2d: CanvasRenderingContext2D }).context2d;
  ctx.save();
  ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** jsPDF's TS types don't expose `internal.getCurrentPageInfo`, even though
 *  it exists at runtime — used to detect whether a multi-row block (like the
 *  entries table) stayed on one page or spilled onto more. */
function getCurrentPageNumber(doc: jsPDF): number {
  return (
    doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } }
  ).getCurrentPageInfo().pageNumber;
}

const SKILL_LABELS: Record<keyof SessionReportSkills, string> = {
  fluency: "Fluency",
  vocabulary: "Vocabulary",
  confidence: "Confidence",
  grammar: "Grammar",
};

/** Builds the branded session-report PDF document (does not save/download it). */
export async function buildSessionReportPdf(input: SessionReportInput): Promise<jsPDF> {
  const studentName = sanitizePdfText(input.studentName);
  const dateLabel = sanitizePdfText(input.dateLabel);
  const { status, skills } = input;
  const notes = sanitizePdfText(input.notes);
  const entries = input.entries.map((e) => ({
    id: e.id,
    type: sanitizePdfText(e.type),
    term: sanitizePdfText(e.term),
    explanation: sanitizePdfText(e.explanation),
  }));

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 48;
  const contentWidth = W - MARGIN * 2;
  const RADIUS = 8;
  let y = 0;

  const logo = await loadLogoDataUrl();

  // Header — organic navy wave.
  const headerBase = drawHeaderWave(doc, W);
  const wordmarkX = logo ? MARGIN + 38 : MARGIN;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", MARGIN, 20, 28, 28, undefined, "FAST");
    } catch (err) {
      console.error("[session-report-pdf] failed to draw logo", err);
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text("VERBO", wordmarkX, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);
  doc.text("LANGUAGE SOLUTIONS", wordmarkX, 51, { charSpace: 2 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text("Session Report", W - MARGIN, 38, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(220, 226, 233);
  doc.text(dateLabel, W - MARGIN, 53, { align: "right" });

  y = headerBase + 42;

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
  y += 12;

  if (entries.length === 0) {
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("No entries recorded for this session.", MARGIN, y);
    y += 20;
  } else {
    const typeColW = 82;
    const termColW = 138;
    const HEADER_H = 27;
    fillTopRoundedRect(doc, MARGIN, y, contentWidth, HEADER_H, RADIUS, NAVY);
    const tableStartPage = getCurrentPageNumber(doc);

    autoTable(doc, {
      startY: y,
      head: [["Type", "Word / Phrase", "Definition / Note"]],
      body: entries.map((e) => [e.type.toUpperCase(), e.term, e.explanation]),
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN, bottom: 56 },
      styles: {
        font: "helvetica",
        fontSize: 9.5,
        textColor: TEXT,
        lineColor: BORDER,
        lineWidth: 0.5,
        cellPadding: { top: 7, bottom: 7, left: 8, right: 8 },
        valign: "top",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: false,
        lineWidth: 0,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 8.5,
        minCellHeight: HEADER_H,
        valign: "middle",
        cellPadding: { top: 0, bottom: 0, left: 8, right: 8 },
      },
      alternateRowStyles: { fillColor: STRIPE_BG },
      columnStyles: {
        0: { cellWidth: typeColW, fontStyle: "bold", textColor: ORANGE, fontSize: 7.5 },
        1: { cellWidth: termColW, fontStyle: "bold", textColor: NAVY },
        2: { cellWidth: contentWidth - typeColW - termColW },
      },
      didParseCell: (data) => {
        // Never let the last body row carry a fill — its corners sit at the
        // bottom of the table and there's nothing below to round it against,
        // so an unfilled row there just reads as "the card ends here"
        // against the white page instead of a hard square edge.
        if (data.section === "body" && data.row.index === entries.length - 1) {
          data.cell.styles.fillColor = false;
        }
      },
    });
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    const tableEndPage = getCurrentPageNumber(doc);
    // The outer rounded-corner frame only makes sense when the whole table
    // fits on the page it started on — "y" (start) and "finalY" (end) are
    // only comparable coordinates on the same page. If the table spilled
    // onto further pages, skip the frame rather than stroke a bogus
    // multi-page-tall rectangle on whichever page the cursor ended up on;
    // the grid theme's cell borders already give the table a clear edge.
    if (tableEndPage === tableStartPage) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.75);
      doc.roundedRect(MARGIN, y, contentWidth, finalY - y, RADIUS, RADIUS, "S");
    }
    y = finalY + 24;
  }

  // Skill-rating cards — one small card per rated dimension, shown before
  // the teacher's comments. Dimensions the teacher didn't touch this session
  // score 0 and are simply omitted rather than shown as a hollow 0/5.
  if (skills) {
    const rated = (Object.keys(SKILL_LABELS) as Array<keyof SessionReportSkills>)
      .map((key) => ({ key, value: skills[key] }))
      .filter((s) => s.value > 0);

    if (rated.length > 0) {
      if (y + 90 > 760) {
        doc.addPage();
        y = 56;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text("Skill ratings", MARGIN, y);
      y += 14;

      const gap = 10;
      const maxCardW = 150;
      const n = rated.length;
      const cardW = Math.min(maxCardW, (contentWidth - (n - 1) * gap) / n);
      const cardH = 56;

      rated.forEach((s, i) => {
        const cx = MARGIN + i * (cardW + gap);
        doc.setFillColor(...CARD_BG);
        doc.roundedRect(cx, y, cardW, cardH, RADIUS, RADIUS, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(SKILL_LABELS[s.key].toUpperCase(), cx + 12, y + 18, { charSpace: 0.5 });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(...NAVY);
        const valueText = s.value.toFixed(1);
        doc.text(valueText, cx + 12, y + 36);
        const valueWidth = doc.getTextWidth(valueText);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        doc.text("/5", cx + 12 + valueWidth + 2, y + 36);

        const barX = cx + 12, barY = y + 44, barW = cardW - 24, barH = 4;
        doc.setFillColor(...TRACK_BG);
        doc.roundedRect(barX, barY, barW, barH, 2, 2, "F");
        const pct = Math.max(0, Math.min(1, s.value / 5));
        if (pct > 0) {
          doc.setFillColor(...ORANGE);
          doc.roundedRect(barX, barY, Math.max(barH, barW * pct), barH, 2, 2, "F");
        }
      });
      y += cardH + 20;
    }
  }

  // Teacher's comments — its own card so it reads as a distinct block, not
  // a visual continuation of the entries table above it.
  if (notes.trim().length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const noteLines = doc.splitTextToSize(notes.trim(), contentWidth - 40);
    const textBlockH = noteLines.length * 13;
    const cardH = 22 + 16 + textBlockH + 14;

    if (y + cardH > 760) {
      doc.addPage();
      y = 56;
    }

    doc.setFillColor(...CARD_BG);
    doc.roundedRect(MARGIN, y, contentWidth, cardH, RADIUS, RADIUS, "F");
    doc.setFillColor(...ORANGE);
    doc.roundedRect(MARGIN, y, 5, cardH, 2, 2, "F");
    doc.setFillColor(...ORANGE);
    doc.rect(MARGIN + 2, y, 3, cardH, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text("TEACHER'S COMMENTS", MARGIN + 20, y + 24, { charSpace: 0.5 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    doc.text(noteLines, MARGIN + 20, y + 44);

    y += cardH + 20;
  }

  // Footer — small organic orange wave on every page, plus the usual
  // domain/page-number line safely above it.
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    drawFooterWave(doc, W, H);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("verbolanguagesolutions.com", MARGIN, H - 24);
    doc.text(`Page ${p} of ${pageCount}`, W - MARGIN, H - 24, { align: "right" });
  }

  return doc;
}

/** Generates the report PDF and triggers an immediate browser download. */
export async function downloadSessionReportPdf(input: SessionReportInput): Promise<void> {
  const doc = await buildSessionReportPdf(input);
  doc.save(sessionReportFileName(input));
}

/** Generates the report PDF as a Blob, for upload to Storage. */
export async function sessionReportPdfBlob(input: SessionReportInput): Promise<Blob> {
  const doc = await buildSessionReportPdf(input);
  return doc.output("blob");
}
