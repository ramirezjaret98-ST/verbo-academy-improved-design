// "Ficha de lectura" (Reading) — second of the 4 Complementary Practice
// formats: a short passage with a side vocabulary glossary and 1-3
// comprehension-check exercises below. Same branding tokens as Comparativa
// (categoryTheme/categoryBackground, shadow-floating, verbo-stagger-in) and
// the exact same PracticeExerciseBlock for grading, so the two formats never
// drift apart in look or behavior.
//
// Score (reference only — never gates unit progress): each exercise grades
// independently through PracticeExerciseBlock; this card keeps a local tally
// of how many have been answered correctly so far and records that as a
// percentage each time one is graded. recordPracticeScore already keeps the
// best value reached, so re-attempts only ever improve it.
import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { categoryTheme, categoryBackground } from "@/lib/challenge-theme";
import { recordPracticeScore, type PracticeActivity, type ReadingContent } from "@/lib/practice-store";
import { PracticeExerciseBlock } from "./PracticeExerciseBlock";

function renderPassage(passage: string, highlights: string[] | undefined, accent: string) {
  const terms = (highlights ?? []).filter((h) => h.trim().length > 0);
  if (terms.length === 0) return passage;
  const escaped = [...terms].sort((a, b) => b.length - a.length).map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  return passage.split(re).map((part, i) =>
    terms.includes(part) ? (
      <strong key={i} style={{ color: accent }}>{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function PracticeReadingCard({
  practice,
  studentId,
  readOnly = false,
  className = "",
}: {
  practice: PracticeActivity;
  studentId: string;
  readOnly?: boolean;
  className?: string;
}) {
  const content = practice.content as ReadingContent;
  const theme = categoryTheme(practice.category);
  const exercises = practice.exercises;
  const [results, setResults] = useState<Record<number, boolean>>({});

  const passageNodes = useMemo(
    () => renderPassage(content.passage, content.highlights, theme.solid),
    [content.passage, content.highlights, theme.solid],
  );

  function handleGraded(index: number, ok: boolean) {
    const next = { ...results, [index]: ok };
    setResults(next);
    if (readOnly) return;
    const correct = Object.values(next).filter(Boolean).length;
    const score = Math.round((correct / exercises.length) * 100);
    recordPracticeScore(studentId, practice.id, score);
  }

  return (
    <div className={`verbo-stagger-in overflow-hidden rounded-[24px] border border-border bg-card shadow-floating ${className}`}>
      <div className="h-1.5 w-full" style={{ background: categoryBackground(practice.category) }} />

      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: theme.solid }}>
              {practice.category}{practice.subcategory ? ` · ${practice.subcategory}` : ""}
            </span>
          </div>
          <span className="text-sm font-bold">{practice.title}</span>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="verbo-stagger-in rounded-2xl border border-border bg-secondary/30 p-4 text-sm leading-relaxed text-foreground lg:col-span-2" style={{ animationDelay: "40ms" }}>
            {passageNodes}
          </div>

          <div
            className="verbo-stagger-in flex flex-col gap-3 rounded-2xl border p-4 lg:col-span-1"
            style={{ animationDelay: "80ms", borderColor: `${theme.solid}33`, backgroundColor: `${theme.solid}0f` }}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: theme.solid }}>
              <BookOpen className="h-3.5 w-3.5" />
              Glossary
            </div>
            <div className="space-y-2.5">
              {content.vocab.map((v, i) => (
                <div key={i}>
                  <div className="text-sm font-bold" style={{ color: theme.solid }}>{v.word}</div>
                  <p className="text-xs leading-snug text-muted-foreground">{v.definition}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {exercises.length > 0 && (
          <div className="mt-4 space-y-3">
            {exercises.map((ex, i) => (
              <div key={i} className="verbo-stagger-in" style={{ animationDelay: `${120 + i * 40}ms` }}>
                <PracticeExerciseBlock
                  exercise={ex}
                  themeColor={theme.solid}
                  label={exercises.length > 1 ? `Question ${i + 1} of ${exercises.length}` : undefined}
                  onGraded={(ok) => handleGraded(i, ok)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
