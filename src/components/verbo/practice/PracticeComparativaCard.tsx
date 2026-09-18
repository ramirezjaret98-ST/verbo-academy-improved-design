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
//
// The exercise + "Check Answer" footer is the shared PracticeExerciseBlock
// (see that file) — Reading uses the exact same block for its own
// comprehension checks, so grading/feedback/styling never drifts apart.
import { categoryTheme, categoryBackground } from "@/lib/challenge-theme";
import { recordPracticeScore, type PracticeActivity, type ComparativaContent } from "@/lib/practice-store";
import { PracticeExerciseBlock } from "./PracticeExerciseBlock";

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
          <div className="verbo-stagger-in mt-4" style={{ animationDelay: "120ms" }}>
            <PracticeExerciseBlock
              exercise={exercise}
              themeColor={theme.solid}
              onGraded={(ok, answerText) => {
                if (!readOnly) recordPracticeScore(studentId, practice.id, ok ? 100 : 0, answerText);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
