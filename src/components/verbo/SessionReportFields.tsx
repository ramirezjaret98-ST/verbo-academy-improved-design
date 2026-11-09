import { Plus, Trash2 } from "lucide-react";
import { MAX_REPORT_ENTRIES, MIN_REPORT_ENTRIES, REPORT_TEXT_LIMIT, type ReportEntry, type SessionReportContent } from "@/lib/session-report-content";

const inputClass = "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const entryTypes: ReportEntry["type"][] = ["New word", "Pronunciation", "Mistake", "Tip", "Other"];
const placeholders = {
  "New word": ["Word or phrase…", "Definition or meaning…"],
  Pronunciation: ["Target word/phrase…", "Phonetic guide or sound correction…"],
  Mistake: ["Student's mistake…", "Correct form…"],
  Tip: ["Focus area…", "Practical advice…"],
  Other: ["Topic/Concept…", "Additional notes…"],
};
export const newReportEntry = (type: ReportEntry["type"] = "New word"): ReportEntry => ({
  id: crypto.randomUUID(), type, term: "", explanation: "",
});

export function SessionReportFields({ value, onChange }: {
  value: SessionReportContent;
  onChange: (value: SessionReportContent) => void;
}) {
  const update = (id: string, patch: Partial<ReportEntry>) => onChange({
    ...value, entries: value.entries.map(e => e.id === id ? { ...e, ...patch } : e),
  });
  const filled = value.entries.filter(e => e.term.trim() && e.explanation.trim()).length;
  return (
    <div className="mt-6 space-y-5">
      <label className="block rounded-xl border border-[#f38934]/50 border-l-4 bg-[#f38934]/5 p-4">
        <span className="text-sm font-bold text-foreground">Today's Win <span aria-hidden>*</span></span>
        <span className="mt-1 mb-2 block text-xs text-muted-foreground">One specific thing the student achieved today.</span>
        <textarea required maxLength={REPORT_TEXT_LIMIT} rows={2} value={value.todayWin}
          onChange={e => onChange({ ...value, todayWin: e.target.value })}
          placeholder="You explained a problem and proposed a solution in English." className={inputClass} />
      </label>
      <fieldset className="min-w-0">
        <legend className="text-xs font-medium text-foreground">Pedagogical entries</legend>
        <p className="mt-1 text-xs text-muted-foreground">{filled} / {MIN_REPORT_ENTRIES}–{MAX_REPORT_ENTRIES} filled</p>
        <div className="mt-3 hidden grid-cols-[125px_1fr_1fr_32px] gap-2 text-[11px] font-semibold uppercase text-muted-foreground sm:grid" aria-hidden>
          <span>Type</span><span>Word / Phrase</span><span>Definition / Note</span>
        </div>
        <div className="mt-2 space-y-3">
          {value.entries.map((entry, i) => (
            <div key={entry.id} className="grid min-w-0 grid-cols-[1fr_32px] gap-2 sm:grid-cols-[125px_1fr_1fr_32px]">
              <select aria-label={`Entry ${i + 1} type`} value={entry.type}
                onChange={e => update(entry.id, { type: e.target.value as ReportEntry["type"] })} className={inputClass}>
                {entryTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              <textarea aria-label={`Entry ${i + 1} word or phrase`} rows={2} maxLength={REPORT_TEXT_LIMIT}
                value={entry.term} onChange={e => update(entry.id, { term: e.target.value })}
                placeholder={placeholders[entry.type][0]} className={inputClass + " col-start-1 sm:col-start-auto"} />
              <textarea aria-label={`Entry ${i + 1} definition or note`} rows={2} maxLength={REPORT_TEXT_LIMIT}
                value={entry.explanation} onChange={e => update(entry.id, { explanation: e.target.value })}
                placeholder={placeholders[entry.type][1]} className={inputClass + " col-start-1 sm:col-start-auto"} />
              <button type="button" aria-label={`Remove entry ${i + 1}`} disabled={value.entries.length <= 1}
                onClick={() => onChange({ ...value, entries: value.entries.filter(e => e.id !== entry.id) })}
                className="col-start-2 row-start-1 flex h-9 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:opacity-40 sm:col-start-auto sm:row-start-auto">
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <button type="button" disabled={value.entries.length >= MAX_REPORT_ENTRIES}
          onClick={() => onChange({ ...value, entries: [...value.entries, newReportEntry()] })}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-foreground hover:bg-secondary disabled:opacity-40">
          <Plus size={16} aria-hidden /> Add new entry
        </button>
      </fieldset>
      <label className="block text-xs font-medium text-foreground">
        Instructions for the next session <span className="font-normal text-muted-foreground">(optional)</span>
        <textarea rows={2} maxLength={REPORT_TEXT_LIMIT} value={value.nextMove}
          onChange={e => onChange({ ...value, nextMove: e.target.value })}
          placeholder="What should the student prepare or practise before the next session?" className={inputClass + " mt-2"} />
      </label>
    </div>
  );
}
