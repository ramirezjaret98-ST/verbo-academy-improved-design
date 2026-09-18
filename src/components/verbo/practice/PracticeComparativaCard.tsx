// "Comparativa" (VS) card — first of the 4 Complementary Practice formats.
// Visual structure follows the artifact Jonah shared (two panels facing off,
// closing with one check exercise), but every color/shadow/animation here is
// pulled from tokens ALREADY in the codebase — nothing new was invented:
//   - categoryTheme()/categoryBackground() from challenge-theme.ts (the same
//     "single source of truth" Challenges already uses for category color).
//   - shadow-floating / shadow-soft (styles.css design tokens).
//   - verbo-stagger-in / verbo-pop-in (same animations used by the unit
//     activities runner and Challenges — see student.courses.tsx/student.challenges.tsx).
// The card is deliberately NOT styled like the plain unit-activity box
// (`rounded-xl bg-secondary/50 p-5` in ExerciseBody) — Jaret asked for a
// visually distinct, more "snack" feel while staying 100% on-brand.
import { useState } from "react";
import { CheckCircle2, X, Sparkles, Lightbulb } from "lucide-react";
import { categoryTheme, categoryBackground } from "@/lib/challenge-theme";
import {
  evaluatePracticeExercise,
  recordPracticeScore,
  type PracticeActivity,
  type ComparativaContent,
} from "@/lib/practice-store";

function ExerciseHeaderLabel(exType: "fill_gaps" | "read_select", optionsCount: number): string {
  if (exType === "fill_gaps") return "Completa";
  return optionsCount <= 2 ? "Verdadero o falso" : "Opción múltiple";
}

export function PracticeComparativaCard({
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
  const content = practice.content as ComparativaContent;
  const exercise = practice.exercises[0];
  const theme = categoryTheme(practice.category);

  const [value, setValue] = useState("");
  const [checked, setChecked] = useState<{ ok: boolean } | null>(null);

  const canCheck = !!exercise && (exercise.type === "fill_gaps" ? value.trim().length > 0 : value !== "");

  function check() {
    if (!exercise) return;
    const ok = evaluatePracticeExercise(exercise, value);
    setChecked({ ok });
    if (!readOnly) {
      // Store the human-readable answer (the option's label for read_select,
      // the typed text for fill_gaps) — reference only, never used to grade.
      const answerText = exercise.type === "read_select" ? (exercise.options?.[Number(value)] ?? value) : value;
      recordPracticeScore(studentId, practice.id, ok ? 100 : 0, answerText);
    }
  }

  function tryAgain() {
    setChecked(null);
    setValue("");
  }

  return (
    <div className={`verbo-stagger-in overflow-hidden rounded-[24px] border border-border bg-card shadow-floating ${className}`}>
      {/* Category accent strip — reuses the exact gradient Challenges uses for this category. */}
      <div className="h-1.5 w-full" style={{ background: categoryBackground(practice.category) }} />

      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: theme.solid }}>
              {practice.category}{practice.subcategory ? ` · ${practice.subcategory}` : ""}
            </span>
            {content.eyebrow && <div className="mt-0.5 text-xs text-muted-foreground">{content.eyebrow}</div>}
          </div>
          <span className="text-sm font-bold">{practice.title}</span>
        </div>

        <div className="relative grid grid-cols-2 gap-3">
          <div
            className="verbo-stagger-in flex flex-col gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4"
            style={{ animationDelay: "40ms" }}
          >
            <span className="w-fit rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              {content.left.tag}
            </span>
            <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">{content.left.word}</span>
            <p className="text-xs leading-relaxed text-muted-foreground">{content.left.definition}</p>
            <div className="rounded-lg bg-card px-3 py-2 text-xs italic text-foreground shadow-soft">"{content.left.example}"</div>
          </div>

          <div
            className="verbo-stagger-in flex flex-col gap-2 rounded-2xl border p-4"
            style={{ animationDelay: "80ms", borderColor: `${theme.solid}33`, backgroundColor: `${theme.solid}0f` }}
          >
            <span className="w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: `${theme.solid}26`, color: theme.solid }}>
              {content.right.tag}
            </span>
            <span className="text-lg font-bold" style={{ color: theme.solid }}>{content.right.word}</span>
            <p className="text-xs leading-relaxed text-muted-foreground">{content.right.definition}</p>
            <div className="rounded-lg bg-card px-3 py-2 text-xs italic text-foreground shadow-soft">"{content.right.example}"</div>
          </div>

          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#01304a] text-[11px] font-bold text-white shadow-floating">
            VS
          </span>
        </div>

        {exercise && (
          <div className="verbo-stagger-in mt-4 overflow-hidden rounded-2xl border border-border" style={{ animationDelay: "120ms" }}>
            <div className="flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: theme.solid }}>
              <span>{ExerciseHeaderLabel(exercise.type, exercise.options?.length ?? 0)}</span>
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
                        {i < arr.length - 1 && <span className="mx-1 inline-block min-w-[70px] border-b-2" style={{ borderColor: theme.solid }} />}
                      </span>
                    ))}
                  </div>
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={!!checked}
                    placeholder="Escribe tu respuesta"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 disabled:opacity-60"
                    style={{ ["--tw-ring-color" as string]: `${theme.solid}55` }}
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
                          style={selected ? { backgroundColor: theme.solid, borderColor: theme.solid } : undefined}
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
                  style={{ backgroundColor: theme.solid }}
                >
                  Comprobar
                </button>
              ) : (
                <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${checked.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`verbo-pop-in flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${checked.ok ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
                      {checked.ok ? <CheckCircle2 className="h-4.5 w-4.5" /> : <X className="h-4.5 w-4.5" />}
                    </span>
                    <div className="text-xs font-semibold">
                      {checked.ok ? "¡Correcto!" : (exercise.feedback?.trim() || "No es correcto, intenta de nuevo.")}
                    </div>
                  </div>
                  <button onClick={tryAgain} className="shrink-0 text-xs font-semibold underline underline-offset-2 opacity-80 hover:opacity-100">
                    Intentar de nuevo
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
