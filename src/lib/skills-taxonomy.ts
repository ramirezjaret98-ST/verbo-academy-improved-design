// Canonical macro/sub-skill taxonomy shared by every surface that reads or
// writes student performance:
//   - Student "Linguistic Asset Performance" (dashboard 4-tile summary)
//   - Student "Advanced Performance Analytics" (per-subskill grid)
//   - Teacher "Mis Alumnos" overall-skills widget / modal
//   - Teacher Session Report — Step 1 (Student Performance Evaluation)
//
// This is intentionally the single source of truth. Any new subskill goes
// here and every surface picks it up.

import { BookOpen, Ear, Mic, PenLine, type LucideIcon } from "lucide-react";
export type BaseKey = "fluency" | "vocabulary" | "confidence" | "grammar";

export interface SubSkill { name: string; base: BaseKey }
export type MacroKey = "Speaking" | "Writing" | "Listening" | "Reading";

export interface MacroSkill {
  key: MacroKey;
  icon: LucideIcon;
  subs: SubSkill[];
}

export const MACRO_SKILLS: MacroSkill[] = [
  {
    key: "Speaking", icon: Mic,
    subs: [
      { name: "Fluency", base: "fluency" },
      { name: "Confidence", base: "confidence" },
      { name: "Range", base: "vocabulary" },
      { name: "Accuracy", base: "grammar" },
      { name: "Pace", base: "fluency" },
      { name: "Tone", base: "confidence" },
    ],
  },
  {
    key: "Writing", icon: PenLine,
    subs: [
      { name: "Organization", base: "grammar" },
      { name: "Accuracy", base: "grammar" },
      { name: "Vocabulary Range", base: "vocabulary" },
      { name: "Task Achievement", base: "grammar" },
      { name: "Cohesion", base: "grammar" },
      { name: "Professional Tone", base: "vocabulary" },
    ],
  },
  {
    key: "Listening", icon: Ear,
    subs: [
      { name: "Comprehension", base: "confidence" },
      { name: "Inference", base: "confidence" },
      { name: "Response Accuracy", base: "grammar" },
      { name: "Speed of Processing", base: "fluency" },
      { name: "Confidence", base: "confidence" },
    ],
  },
  {
    key: "Reading", icon: BookOpen,
    subs: [
      { name: "Comprehension", base: "vocabulary" },
      { name: "Inference", base: "vocabulary" },
      { name: "Vocabulary Recognition", base: "vocabulary" },
      { name: "Critical Understanding", base: "grammar" },
    ],
  },
];

/** Canonical key used inside `PerformanceRating.subskills`. Format: "Macro:Sub". */
export function skillKey(macro: MacroKey, sub: string): string {
  return `${macro}:${sub}`;
}