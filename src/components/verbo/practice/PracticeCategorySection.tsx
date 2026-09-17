// Slots the Complementary Practice engine into the SAME per-category view
// students already use for Material Complementario (MaterialLibrary.tsx) —
// Jaret asked for these to live side by side, not replace one another, and
// this keeps the navigation identical: open "Grammar" and see both the
// downloadable materials AND quick-practice cards for Grammar.
//
// Renders nothing when there's no practice content yet for this category —
// most categories will be empty until content gets authored, and this
// section should never show an empty-state box competing with Materials'.
import { SectionTitle } from "@/components/verbo/ui";
import { usePracticeActivities } from "@/lib/practice-store";
import { PracticeComparativaCard } from "./PracticeComparativaCard";

export function PracticeCategorySection({
  category,
  studentId,
  readOnly = false,
}: {
  category: string;
  /** Legacy student id (same id space as materials-store/activities-store).
   *  Omitted (or readOnly=true) for Teacher/Admin previewing the category. */
  studentId?: string;
  readOnly?: boolean;
}) {
  const all = usePracticeActivities();
  // Only "comparativa" is built so far (v1) — grid/reading/carousel land in
  // later phases per the agreed build order. Unknown formats are ignored
  // rather than crashing, so this section degrades gracefully as more
  // formats ship.
  const items = all.filter((p) => p.category === category && p.format === "comparativa");

  if (items.length === 0) return null;

  const noTrack = readOnly || !studentId;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Quick Practice</SectionTitle>
        <span className="text-xs text-muted-foreground">
          Snackable exercises — doesn't affect your unit progress or unlock anything.
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <PracticeComparativaCard key={p.id} practice={p} studentId={studentId ?? ""} readOnly={noTrack} />
        ))}
      </div>
    </div>
  );
}
