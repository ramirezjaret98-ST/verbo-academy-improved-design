// Shared "Skills we'll focus on" display for the student's Ready modal.
//
// Renders the sub-skills a teacher picked in PlanModal (LessonPlan.focus_subskills,
// keys formatted "Macro:Sub" — same convention as skills-taxonomy.ts / the
// Session Report's performance_ratings.subskills), grouped by macro-skill,
// as solid pills (per this project's design convention: pills are always
// solid, active/selected state = solid navy #01304a + white text).
//
// Pulled out into its own component (2026-09-16) instead of writing this a
// third time: the "what we'll cover" block already exists independently in
// student.sessions.tsx's EventDetailsModal, student.index.tsx's dashboard
// modal, and SessionPrepModal.tsx — all 3 read the same LessonPlan, so this
// keeps the grouping/style logic in one place for all 3 call sites.
import { MACRO_SKILLS, type MacroKey } from "@/lib/skills-taxonomy";

const NAVY = "#01304a";

/** Groups raw "Macro:Sub" keys back into { macro, subs[] }, in the fixed
 *  MACRO_SKILLS/sub order (not the order they were picked in), silently
 *  dropping any key whose macro/sub no longer exists in the taxonomy. */
export function groupFocusSubskills(keys?: string[]): Array<{ macro: MacroKey; subs: string[] }> {
  if (!keys || keys.length === 0) return [];
  const set = new Set(keys);
  const groups: Array<{ macro: MacroKey; subs: string[] }> = [];
  for (const m of MACRO_SKILLS) {
    const subs = m.subs.filter((s) => set.has(`${m.key}:${s.name}`)).map((s) => s.name);
    if (subs.length > 0) groups.push({ macro: m.key, subs });
  }
  return groups;
}

/** Renders nothing when there's nothing planned yet — callers can drop this
 *  in unconditionally right below the session type/topic block. */
export function FocusSkillsPills({ keys }: { keys?: string[] }) {
  const groups = groupFocusSubskills(keys);
  if (groups.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Skills we'll focus on
      </div>
      <div className="mt-1.5 space-y-1.5">
        {groups.map((g) => (
          <div key={g.macro} className="flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-xs font-semibold" style={{ color: NAVY }}>{g.macro}:</span>
            {g.subs.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: NAVY }}
              >
                {s}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
