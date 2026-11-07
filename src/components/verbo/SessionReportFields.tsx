import { Plus, Trash2 } from "lucide-react";
import {
  REPORT_SECTIONS,
  MAX_REPORT_ENTRIES,
  REPORT_TEXT_LIMIT,
  type ReportEntry,
  type SessionReportContent,
} from "@/lib/session-report-content";

const inputClass =
  "mt-1 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";
export const newReportEntry = (type: ReportEntry["type"]): ReportEntry => ({
  id: crypto.randomUUID(),
  type,
  term: "",
  explanation: "",
  example: "",
});

export function SessionReportFields({
  value,
  onChange,
}: {
  value: SessionReportContent;
  onChange: (value: SessionReportContent) => void;
}) {
  const update = (id: string, patch: Partial<ReportEntry>) =>
    onChange({
      ...value,
      entries: value.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  return (
    <div className="mt-6 space-y-6">
      <label className="block rounded-xl border border-[#f38934]/50 border-l-4 bg-[#f38934]/5 p-4">
        <span className="text-sm font-bold text-foreground">
          Today's Win <span aria-hidden>*</span>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Describe one specific thing the student achieved today.
        </span>
        <textarea
          required
          maxLength={REPORT_TEXT_LIMIT}
          rows={2}
          value={value.todayWin}
          onChange={(e) => onChange({ ...value, todayWin: e.target.value })}
          placeholder="You explained a problem and proposed a solution in English."
          className={inputClass}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Review every category. Add what actually happened, or explain why it was not covered. Only
        populated categories appear in the PDF. Up to {MAX_REPORT_ENTRIES} entries.
      </p>
      {REPORT_SECTIONS.map((section, index) => {
        const entries = value.entries.filter((e) => e.type === section.type);
        const skipped = Object.hasOwn(value.skipped, section.type);
        const complete = entries.some((e) => e.term.trim() && e.explanation.trim());
        return (
          <fieldset
            key={section.type}
            className="min-w-0 rounded-xl border border-border p-4"
            style={{ borderTop: `3px solid ${section.color}` }}
          >
            <legend className="px-2 text-sm font-bold text-foreground">{section.title}</legend>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {complete
                  ? "Entries added"
                  : skipped && value.skipped[section.type]?.trim()
                    ? "Reviewed · not covered"
                    : index === 4
                      ? "Optional"
                      : "Review required"}
              </span>
              {index < 4 && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={skipped}
                    disabled={entries.some(
                      (e) => e.term.trim() || e.explanation.trim() || e.example?.trim(),
                    )}
                    onChange={(e) => {
                      const reasons = { ...value.skipped };
                      if (e.target.checked) reasons[section.type] = "";
                      else delete reasons[section.type];
                      onChange({
                        ...value,
                        skipped: reasons,
                        entries: e.target.checked
                          ? value.entries.filter((entry) => entry.type !== section.type)
                          : value.entries,
                      });
                    }}
                  />
                  Not covered this session
                </label>
              )}
            </div>
            {skipped ? (
              <label className="block text-xs text-muted-foreground">
                Reason (required · omitted from PDF)
                <textarea
                  maxLength={500}
                  required
                  rows={2}
                  value={value.skipped[section.type] ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      skipped: { ...value.skipped, [section.type]: e.target.value },
                    })
                  }
                  className={inputClass}
                />
              </label>
            ) : (
              <>
                <div className="space-y-4">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="relative space-y-2 rounded-lg bg-secondary/30 p-3"
                    >
                      <div className="flex justify-end">
                        <button
                          type="button"
                          aria-label={`Remove ${section.title} entry`}
                          onClick={() =>
                            onChange({
                              ...value,
                              entries: value.entries.filter((e) => e.id !== entry.id),
                            })
                          }
                          className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="min-w-0 text-xs text-muted-foreground">
                          {section.term}
                          <textarea
                            rows={2}
                            maxLength={REPORT_TEXT_LIMIT}
                            value={entry.term}
                            onChange={(e) => update(entry.id, { term: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                        <label className="min-w-0 text-xs text-muted-foreground">
                          {section.explanation}
                          <textarea
                            rows={2}
                            maxLength={REPORT_TEXT_LIMIT}
                            value={entry.explanation}
                            onChange={(e) => update(entry.id, { explanation: e.target.value })}
                            className={inputClass}
                          />
                        </label>
                      </div>
                      <label className="block text-xs text-muted-foreground">
                        {section.example} (optional)
                        <textarea
                          rows={2}
                          maxLength={REPORT_TEXT_LIMIT}
                          value={entry.example ?? ""}
                          onChange={(e) => update(entry.id, { example: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={value.entries.length >= MAX_REPORT_ENTRIES}
                  onClick={() =>
                    onChange({
                      ...value,
                      entries: [...value.entries, newReportEntry(section.type)],
                    })
                  }
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-40"
                >
                  <Plus size={14} />
                  Add {section.type.toLowerCase()}
                </button>
              </>
            )}
          </fieldset>
        );
      })}
      <label className="block rounded-xl bg-[#01304a] p-4 text-white">
        <span className="text-sm font-bold text-[#f38934]">
          Your Next Move <span aria-hidden>*</span>
        </span>
        <span className="mt-1 block text-xs text-white/80">
          One clear, realistic action before the next session.
        </span>
        <textarea
          required
          maxLength={REPORT_TEXT_LIMIT}
          rows={3}
          value={value.nextMove}
          onChange={(e) => onChange({ ...value, nextMove: e.target.value })}
          placeholder="Record a 30-second project update. Use follow up and deadline."
          className={inputClass}
        />
      </label>
    </div>
  );
}
