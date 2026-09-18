// Shared "check" block for a single PracticeExercise (fill_gaps or
// read_select) — the interactive footer every Complementary Practice format
// ends with. Extracted from PracticeComparativaCard so Reading (which can
// carry 1-3 exercises per card) and future Grid/Carousel formats reuse the
// exact same interaction, styling and grading path instead of re-implementing
// it per format.
//
// English UI copy throughout — matches the unit-activities runner convention
// (student.courses.tsx: "Check Answer", "Type your answer", "Nice work —
// moving on."). Only the exercise's own authored fields (question/hint/
// feedback) carry whatever language the admin wrote them in.
import { useState } from "react";
import { CheckCircle2, X, Sparkles, Lightbulb } from "lucide-react";
import { evaluatePracticeExercise, type PracticeExercise } from "@/lib/practice-store";

function headerLabel(exType: "fill_gaps" | "read_select", optionsCount: number): string {
  if (exType === "fill_gaps") return "Fill in the blank";
  return optionsCount <= 2 ? "True or False" : "Multiple Choice";
}

export function PracticeExerciseBlock({
  exercise,
  themeColor,
  label,
  onGraded,
  className = "",
}: {
  exercise: PracticeExercise;
  /** The category's accent color (categoryTheme(...).solid). */
  themeColor: string;
  /** Optional prefix shown before the type label, e.g. "Question 2 of 3". */
  label?: string;
  /** Fired once per "Check Answer" click — never fired again until Try Again
   *  is used. The caller decides whether/how to persist this (score, running
   *  tally across several exercises, etc). */
  onGraded: (ok: boolean, answerText: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState<{ ok: boolean } | null>(null);

  const canCheck = exercise.type === "fill_gaps" ? value.trim().length > 0 : value !== "";

  function check() {
    const ok = evaluatePracticeExercise(exercise, value);
    setChecked({ ok });
    const answerText = exercise.type === "read_select" ? (exercise.options?.[Number(value)] ?? value) : value;
    onGraded(ok, answerText);
  }

  function tryAgain() {
    setChecked(null);
    setValue("");
  }

  return (
    <div className={`overflow-hidden rounded-2xl border border-border ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: themeColor }}>
        <span>{label ? `${label} · ` : ""}{headerLabel(exercise.type, exercise.options?.length ?? 0)}</span>
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="space-y-3 bg-card p-4">
        {exercise.hint && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{exercise.hint}</span>
          </div>
        )}

        {exercise.type === "fill_gaps" ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/50 p-3 text-sm leading-relaxed text-foreground">
              {(exercise.paragraph ?? "").split("[blank]").map((p, i, arr) => (
                <span key={i}>
                  {p}
                  {i < arr.length - 1 && <span className="mx-1 inline-block min-w-[70px] border-b-2" style={{ borderColor: themeColor }} />}
                </span>
              ))}
            </div>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={!!checked}
              placeholder="Type your answer"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 disabled:opacity-60"
              style={{ ["--tw-ring-color" as string]: `${themeColor}55` }}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {exercise.question && <p className="text-sm font-semibold text-foreground">{exercise.question}</p>}
            <div className={`flex gap-2 ${(exercise.options?.length ?? 0) > 2 ? "flex-col" : ""}`}>
              {exercise.options?.map((opt, i) => {
                const selected = value === String(i);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!!checked}
                    onClick={() => setValue(String(i))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed ${selected ? "text-white" : "border-border text-foreground hover:border-current"}`}
                    style={selected ? { backgroundColor: themeColor, borderColor: themeColor } : undefined}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!checked ? (
          <button
            onClick={check}
            disabled={!canCheck}
            className="ml-auto flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: themeColor }}
          >
            Check Answer
          </button>
        ) : (
          <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${checked.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
            <div className="flex items-center gap-2.5">
              <span className={`verbo-pop-in flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${checked.ok ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
                {checked.ok ? <CheckCircle2 className="h-4.5 w-4.5" /> : <X className="h-4.5 w-4.5" />}
              </span>
              <div className="text-xs font-semibold">
                {checked.ok ? "Correct!" : (exercise.feedback?.trim() || "Not quite — take another look.")}
              </div>
            </div>
            <button onClick={tryAgain} className="shrink-0 text-xs font-semibold underline underline-offset-2 opacity-80 hover:opacity-100">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
