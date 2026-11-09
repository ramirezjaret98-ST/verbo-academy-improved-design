/** Versioned content for new 1:1 reports. Existing PDF URLs are never regenerated. */
export const REPORT_SECTIONS = [
  {
    type: "New word",
    title: "Words worth keeping",
    color: "#1687e8",
    term: "Word or phrase",
    explanation: "Meaning",
    example: "Example in context",
  },
  {
    type: "Mistake",
    title: "Say it better",
    color: "#f45c55",
    term: "You said",
    explanation: "Try this",
    example: "Why / useful reminder",
  },
  {
    type: "Pronunciation",
    title: "Sound more natural",
    color: "#7e22ce",
    term: "Word or phrase",
    explanation: "Sound or stress guidance",
    example: "Practice phrase",
  },
  {
    type: "Tip",
    title: "Keep this in mind",
    color: "#5fca16",
    term: "Focus",
    explanation: "Practical advice",
    example: "Example of use",
  },
  {
    type: "Other",
    title: "More from your session",
    color: "#01304a",
    term: "Topic",
    explanation: "Note",
    example: "Example",
  },
] as const;
export type ReportEntryType = (typeof REPORT_SECTIONS)[number]["type"];
export interface ReportEntry {
  id: string;
  type: ReportEntryType;
  term: string;
  explanation: string;
  example?: string;
}
export interface SessionReportContent {
  version: 2 | 3;
  todayWin: string;
  nextMove: string;
  entries: ReportEntry[];
  /** Review metadata. Omitted sections/reasons are not printed in the PDF. */
  skipped: Partial<Record<ReportEntryType, string>>;
}
export const MAX_REPORT_ENTRIES = 10;
export const MIN_REPORT_ENTRIES = 6;
export const REPORT_TEXT_LIMIT = 2000;

export function reportContentError(
  content: SessionReportContent,
  absent = false,
): string | undefined {
  if (absent) return undefined;
  if (!content.todayWin.trim()) return "Add Today's Win.";
  if (content.version === 2 && !content.nextMove.trim()) return "Add Your Next Move.";
  if (content.todayWin.length > REPORT_TEXT_LIMIT || content.nextMove.length > REPORT_TEXT_LIMIT)
    return "Keep each highlight under 2,000 characters.";
  const started = content.entries.filter(
    (e) => e.term.trim() || e.explanation.trim() || e.example?.trim(),
  );
  const minimum = content.version === 3 ? MIN_REPORT_ENTRIES : 1;
  if (started.length < minimum || started.length > MAX_REPORT_ENTRIES)
    return `Add between ${minimum} and 10 learning entries.`;
  if (started.some((e) => !e.term.trim() || !e.explanation.trim()))
    return "Complete both fields in each entry, or remove the unfinished entry.";
  if (
    started.some((e) =>
      [e.term, e.explanation, e.example ?? ""].some((t) => t.length > REPORT_TEXT_LIMIT),
    )
  )
    return "Keep each entry field under 2,000 characters.";
  for (const section of content.version === 2 ? REPORT_SECTIONS.slice(0, 4) : []) {
    const hasEntries = started.some((e) => e.type === section.type);
    const reason = content.skipped[section.type]?.trim();
    if (!hasEntries && !reason) return `Add ${section.title}, or explain why it was not covered.`;
    if (hasEntries && reason)
      return `Remove the omission reason for ${section.title}, or remove its entries.`;
  }
}

export function cleanReportContent(
  content: SessionReportContent,
  absent = false,
): SessionReportContent {
  return {
    version: content.version,
    todayWin: absent ? "" : content.todayWin.trim(),
    nextMove: absent ? "" : content.nextMove.trim(),
    entries: absent
      ? []
      : content.entries
          .filter((e) => e.term.trim() && e.explanation.trim())
          .map((e) => ({
            ...e,
            term: e.term.trim(),
            explanation: e.explanation.trim(),
            example: e.example?.trim() || undefined,
          })),
    skipped: absent
      ? {}
      : Object.fromEntries(
          Object.entries(content.skipped)
            .filter(([, reason]) => reason?.trim())
            .map(([type, reason]) => [type, reason!.trim()]),
        ),
  };
}
