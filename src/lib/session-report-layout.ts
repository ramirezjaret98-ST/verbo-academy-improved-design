import { jsPDF } from "jspdf";
import { REPORT_SECTIONS, type ReportEntry } from "./session-report-content";
import type { SessionReportInput } from "./session-report-pdf";

const NAVY = "#01304a",
  ORANGE = "#f38934",
  LIME = "#5fca16",
  MUTED = "#64748b";
const M = 42,
  GAP = 10,
  LINE = 14,
  PAD = 12;
type Line = { text: string; bold?: boolean; color?: string; size?: number };

/** Flow layout in PDF points. Rows move as units; oversized cards continue safely. */
export function buildModernSessionReport(input: SessionReportInput, logo?: string | null): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth(),
    H = doc.internal.pageSize.getHeight();
  const width = W - M * 2,
    bottom = H - 53;
  let y = 0;
  // WinAnsi-safe text, with explicit common IPA fallbacks. Never emit broken glyphs.
  const safe = (text: string) =>
    text
      .replace(
        /[θðʃʒŋɪʊəɜɔæʌɑɒɛɹˈˌː]/g,
        (c) =>
          ({
            θ: "th",
            ð: "th",
            ʃ: "sh",
            ʒ: "zh",
            ŋ: "ng",
            ɪ: "i",
            ʊ: "u",
            ə: "uh",
            ɜ: "er",
            ɔ: "o",
            æ: "a",
            ʌ: "uh",
            ɑ: "a",
            ɒ: "o",
            ɛ: "e",
            ɹ: "r",
            ˈ: "'",
            ˌ: "",
            ː: "",
          })[c] ?? "",
      )
      .replace(/[^\x20-\xff\n\r\t\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u2022]/g, "");
  function text(value: string, x: number, at: number, size = 10, bold = false, color = NAVY) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(safe(value), x, at);
  }
  function wrap(value: string, maxWidth: number, bold = false, size = 10): string[] {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(safe(value), maxWidth);
  }
  function header(first: boolean) {
    doc.setFillColor(NAVY);
    doc.rect(0, 0, W, first ? 74 : 58, "F");
    // Organic lower edge echoes the existing Academy report branding.
    doc.ellipse(W * 0.24, first ? 72 : 56, W * 0.27, 7, "F");
    if (logo) doc.addImage(logo, "PNG", M, 18, 27, 27);
    text("VERBO", M + (logo ? 37 : 0), 32, 19, true, "#ffffff");
    text("A C A D E M Y", M + (logo ? 37 : 0), 45, 7, false, "#ffffff");
    text("SESSION REPORT", W - M - 132, 29, 12, true, "#ffffff");
    const date = wrap(input.dateLabel, 170, false, 8);
    date.forEach((line, i) => text(line, W - M - 170, 44 + i * 10, 8, false, "#ffffff"));
    y = first ? 106 : 86;
    if (first) {
      for (const line of wrap(input.studentName || "Student", width, true, 20)) {
        text(line, M, y, 20, true);
        y += 24;
      }
      const detail = [
        input.teacherName ? `with ${input.teacherName}` : "",
        input.status === "absent" ? "Absent" : "Completed",
        input.status === "delayed" ? "Late attendance" : "",
      ]
        .filter(Boolean)
        .join("  |  ");
      for (const line of wrap(detail, width, false, 9)) {
        text(line, M, y, 9, false, MUTED);
        y += 13;
      }
      y += 13;
    } else {
      text("Session review - continued", M, y - 6, 8, false, MUTED);
      y += 8;
    }
  }
  function nextPage() {
    doc.addPage();
    header(false);
  }
  function ensure(height: number) {
    if (y + height > bottom) nextPage();
  }
  function section(title: string, color: string, height = 80) {
    ensure(32 + height);
    doc.setFillColor(color);
    doc.roundedRect(M, y, 22, 22, 6, 6, "F");
    // Small white dot keeps section markers vector-based and font-independent.
    doc.setFillColor(color === LIME ? NAVY : "#ffffff");
    doc.circle(M + 11, y + 11, 3, "F");
    text(title, M + 32, y + 15, 12, true);
    y += 33;
  }
  function drawCard(
    lines: Line[],
    x: number,
    at: number,
    cardWidth: number,
    height: number,
    accent?: string,
    dark = false,
  ) {
    doc.setFillColor("#e8edf1");
    doc.roundedRect(x, at + 2, cardWidth, height, 8, 8, "F");
    doc.setFillColor(dark ? NAVY : "#f9fafb");
    doc.setDrawColor(dark ? NAVY : "#dce2e8");
    doc.setLineWidth(0.6);
    doc.roundedRect(x, at, cardWidth, height, 8, 8, "FD");
    if (accent) {
      doc.setFillColor(accent);
      doc.roundedRect(x, at + 10, 3, height - 20, 1, 1, "F");
    }
    lines.forEach((line, i) =>
      text(
        line.text,
        x + PAD,
        at + PAD + 9 + i * LINE,
        line.size ?? 10,
        line.bold,
        line.color ?? (dark ? "#ffffff" : NAVY),
      ),
    );
  }
  function cardHeight(lines: Line[]) {
    return PAD * 2 + Math.max(1, lines.length) * LINE;
  }
  function fullCard(lines: Line[], accent?: string, dark = false) {
    const remaining = [...lines];
    // Ordinary cards are indivisible; only an entry taller than an entire page splits.
    if (cardHeight(remaining) <= bottom - 94) ensure(cardHeight(remaining));
    while (remaining.length) {
      if (bottom - y < PAD * 2 + LINE * 2) nextPage();
      const capacity = Math.floor((bottom - y - PAD * 2) / LINE);
      const chunk = remaining.splice(0, capacity);
      const h = cardHeight(chunk);
      drawCard(chunk, M, y, width, h, accent, dark);
      y += h + GAP;
      if (remaining.length) {
        nextPage();
        remaining.unshift({ text: "Continued", size: 8, color: dark ? "#ffffff" : MUTED });
      }
    }
  }
  function entryLines(entry: ReportEntry, cardWidth: number): Line[] {
    const max = cardWidth - PAD * 2;
    const lines: Line[] = [];
    const add = (value: string, bold = false, color = NAVY, size = 10) =>
      wrap(value, max, bold, size).forEach((t) => lines.push({ text: t, bold, color, size }));
    if (entry.type === "Mistake") add("YOU SAID", false, MUTED, 7);
    add(entry.term, true);
    if (entry.type === "Mistake") add("TRY THIS", true, "#c94c18", 7);
    add(entry.explanation);
    if (entry.example) {
      lines.push({ text: "" });
      add(entry.example, false, MUTED, 9);
    }
    return lines;
  }
  header(true);
  const content = input.content!;
  if (content.todayWin)
    fullCard(
      [
        { text: "TODAY'S WIN", bold: true, color: "#b4550d", size: 10 },
        ...wrap(content.todayWin, width - PAD * 2, true, 11).map((t) => ({
          text: t,
          bold: true,
          size: 11,
        })),
      ],
      ORANGE,
    );
  for (const category of REPORT_SECTIONS) {
    const entries = content.entries.filter((e) => e.type === category.type);
    if (!entries.length) continue;
    // Vocabulary is paired; an unpaired final card fills the entire row.
    const paired = category.type === "New word";
    let first = true;
    for (let i = 0; i < entries.length; ) {
      const pair = paired && i + 1 < entries.length;
      const cw = pair ? (width - GAP) / 2 : width;
      const a = entryLines(entries[i], cw),
        b = pair ? entryLines(entries[i + 1], cw) : [];
      const h = Math.max(cardHeight(a), pair ? cardHeight(b) : 0);
      // Extremely long vocabulary uses full-width flow instead of stranding a column.
      if (h > bottom - 130) {
        if (first) {
          section(category.title, category.color, 50);
          first = false;
        }
        fullCard(entryLines(entries[i], width), category.color);
        i++;
        continue;
      }
      if (first || y + h > bottom) {
        if (!first) nextPage();
        section(category.title + (first ? "" : " - continued"), category.color, h);
        first = false;
      }
      drawCard(a, M, y, cw, h, category.color);
      if (pair) drawCard(b, M + cw + GAP, y, cw, h, category.color);
      y += h + GAP;
      i += pair ? 2 : 1;
    }
    y += 6;
  }
  const rated =
    input.status !== "absent" && input.skills
      ? Object.entries(input.skills).filter(([, v]) => Number.isFinite(v) && v > 0)
      : [];
  if (rated.length) {
    section("Your performance", ORANGE, 30 + rated.length * 23);
    text("Teacher assessment for this session - scale 0 to 5", M, y, 8, false, MUTED);
    y += 21;
    for (const [key, value] of rated) {
      text(key[0].toUpperCase() + key.slice(1), M, y + 9, 10, true);
      const bx = M + 100,
        bw = width - 152;
      doc.setFillColor("#e2e8f0");
      doc.roundedRect(bx, y, bw, 12, 6, 6, "F");
      doc.setFillColor(LIME);
      doc.roundedRect(bx, y, Math.max(0, Math.min(1, value / 5)) * bw, 12, 6, 6, "F");
      doc.setDrawColor("#ffffff");
      doc.setLineWidth(1);
      for (let i = 1; i < 5; i++) doc.line(bx + (i * bw) / 5, y, bx + (i * bw) / 5, y + 12);
      text(`${value}/5`, W - M - 36, y + 9, 9, false, MUTED);
      y += 23;
    }
    y += 12;
  }
  const teacherNotes: Line[] = [];
  for (const [title, value] of [
    ["CLASS NOTES", input.notes],
    ["A NOTE FROM YOUR TEACHER", input.studentNote ?? ""],
  ]) {
    if (value.trim()) {
      if (teacherNotes.length) teacherNotes.push({ text: "" });
      teacherNotes.push(
        { text: title, bold: true, size: 8, color: MUTED },
        ...wrap(value, width - PAD * 2).map((t) => ({ text: t })),
      );
    }
  }
  if (teacherNotes.length) fullCard(teacherNotes, ORANGE);
  if (content.nextMove)
    fullCard(
      [
        { text: "YOUR NEXT MOVE", bold: true, color: ORANGE, size: 10 },
        ...wrap(content.nextMove, width - PAD * 2, false, 11).map((t) => ({ text: t, size: 11 })),
      ],
      ORANGE,
      true,
    );
  const count = doc.getNumberOfPages();
  for (let p = 1; p <= count; p++) {
    doc.setPage(p);
    doc.setDrawColor("#e2e8f0");
    doc.line(M, H - 39, W - M, H - 39);
    text("Your progress, one conversation at a time.", M, H - 24, 8, false, MUTED);
    text(`${p} / ${count}`, W - M - 30, H - 24, 8, false, MUTED);
    doc.setFillColor(ORANGE);
    doc.triangle(W - 42, H, W, H - 17, W, H, "F");
  }
  return doc;
}
