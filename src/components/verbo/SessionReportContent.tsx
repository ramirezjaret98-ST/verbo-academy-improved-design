import { BookOpen, MessageCircle, Volume2, Lightbulb, FileText } from "lucide-react";
import {
  REPORT_SECTIONS,
  type SessionReportContent as ReportContent,
} from "@/lib/session-report-content";
import type { SessionReportSkills } from "@/lib/session-report-pdf";

const ICONS = [BookOpen, MessageCircle, Volume2, Lightbulb, FileText];

export function ReportPerformance({ skills }: { skills: SessionReportSkills }) {
  const rated = Object.entries(skills).filter(([, value]) => Number.isFinite(value) && value > 0);
  if (!rated.length) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4">
      <h4 className="text-sm font-bold text-foreground">Your performance</h4>
      <p className="text-xs text-muted-foreground">
        Teacher assessment for this session · scale 0–5
      </p>
      {rated.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[90px_1fr_40px] items-center gap-2 text-xs">
          <span className="capitalize text-foreground">{key}</span>
          <div
            role="meter"
            aria-label={key}
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={value}
            className="relative h-3 overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="h-full rounded-full bg-[#5fca16]"
              style={{ width: `${Math.max(0, Math.min(100, value * 20))}%` }}
            />
            <div aria-hidden className="absolute inset-0 grid grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="border-r border-background/70 last:border-0" />
              ))}
            </div>
          </div>
          <span className="text-right tabular-nums text-muted-foreground">{value}/5</span>
        </div>
      ))}
    </section>
  );
}

export function SessionReportContentView({
  content,
  skills,
}: {
  content: ReportContent;
  skills?: SessionReportSkills;
}) {
  return (
    <div className="space-y-5">
      {content.todayWin && (
        <section className="rounded-xl border border-[#f38934]/50 border-l-4 bg-[#f38934]/5 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wide text-foreground">Today's win</h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-foreground">
            {content.todayWin}
          </p>
        </section>
      )}
      {REPORT_SECTIONS.map((section, index) => {
        const entries = content.entries.filter((e) => e.type === section.type);
        if (!entries.length) return null;
        const Icon = ICONS[index];
        return (
          <section key={section.type} className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <span
                className="rounded-lg p-2"
                style={{
                  backgroundColor: section.color,
                  color: section.type === "Tip" ? "#01304a" : "white",
                }}
              >
                <Icon size={16} aria-hidden />
              </span>
              {section.title}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {entries.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`min-w-0 rounded-xl border border-border bg-secondary/20 p-4 shadow-sm ${i === entries.length - 1 && entries.length % 2 ? "sm:col-span-2" : ""}`}
                >
                  {entry.type === "Mistake" && (
                    <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      You said
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm font-semibold text-foreground">
                    {entry.term}
                  </p>
                  {entry.type === "Mistake" && (
                    <p className="mb-1 mt-3 text-[10px] font-semibold uppercase text-muted-foreground">
                      Try this
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                    {entry.explanation}
                  </p>
                  {entry.example && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs italic text-muted-foreground">
                      {entry.example}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {skills && <ReportPerformance skills={skills} />}
      {content.nextMove && (
        <section className="rounded-xl bg-[#01304a] p-5 text-white shadow-md">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[#f38934]">
            Your next move
          </h4>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium">
            {content.nextMove}
          </p>
        </section>
      )}
    </div>
  );
}
