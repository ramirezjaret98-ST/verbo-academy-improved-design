import { useRef, useState, useSyncExternalStore } from "react";
import { GhostButton, SectionTitle } from "@/components/verbo/ui";
import {
  bestPracticeScoreFor,
  subscribePractice,
  usePracticeActivities,
} from "@/lib/practice-store";
import { PracticeComparativaCard } from "./PracticeComparativaCard";
import { PracticeReadingCard } from "./PracticeReadingCard";

export function PracticeCategorySection({
  category,
  studentId,
  readOnly = false,
}: {
  category: string;
  studentId?: string;
  readOnly?: boolean;
}) {
  const all = usePracticeActivities();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pending");
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const items = all.filter(
    (p) => p.category === category && (p.format === "comparativa" || p.format === "reading"),
  );
  const snapshot = useSyncExternalStore(
    subscribePractice,
    () => items.map((p) => bestPracticeScoreFor(studentId ?? "", p.id)).join(","),
    () => "",
  );
  const scores = snapshot.split(",").map(Number);
  const completed = new Set(items.filter((_, i) => scores[i] === 100).map((p) => p.id));
  const filtered = items.filter(
    (p) =>
      (!studentId ||
        status === "all" ||
        (status === "completed" ? completed.has(p.id) : !completed.has(p.id))) &&
      (!topic || p.subcategory === topic) &&
      (!format || p.format === format) &&
      `${p.title} ${p.subcategory ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const active = items.find((p) => p.id === selected);
  if (!items.length) return null;
  const control = "rounded-xl border border-border bg-background px-3 py-2 text-sm";
  return (
    <section
      className="space-y-4 rounded-2xl border border-orange-200 bg-orange-50/40 p-5"
      aria-label="Dynamic practice"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>Dynamic practice</SectionTitle>
          <p className="text-sm text-muted-foreground">
            Choose an exercise. Complete it at your own pace.
          </p>
        </div>
        {studentId && (
          <span className="text-sm font-semibold">
            {completed.size} / {items.length} completed
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Search exercises"
          className={control}
          placeholder="Search title or topic…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {studentId && (
          <select
            aria-label="Completion status"
            className={control}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="all">All exercises</option>
          </select>
        )}
        <select
          aria-label="Topic"
          className={control}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="">All topics</option>
          {Array.from(new Set(items.map((p) => p.subcategory).filter(Boolean)))
            .sort()
            .map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
        <select
          aria-label="Exercise type"
          className={control}
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="">All types</option>
          <option value="comparativa">Compare & practice</option>
          <option value="reading">Reading</option>
        </select>
      </div>
      <div className="flex items-center justify-between">
        <p role="status" className="text-sm text-muted-foreground">
          {filtered.length} exercises · Completed means all answers correct.
        </p>
        <div className="flex gap-2">
          <GhostButton
            aria-label="Previous exercises"
            onClick={() => rail.current?.scrollBy({ left: -320, behavior: "smooth" })}
          >
            ←
          </GhostButton>
          <GhostButton
            aria-label="Next exercises"
            onClick={() => rail.current?.scrollBy({ left: 320, behavior: "smooth" })}
          >
            →
          </GhostButton>
        </div>
      </div>
      <div ref={rail} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            aria-pressed={selected === p.id}
            className="w-72 shrink-0 snap-start space-y-3 rounded-2xl border border-orange-200 bg-card p-5 text-left shadow-sm hover:border-orange-500 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-xs font-semibold uppercase text-orange-700">
              {p.format === "reading" ? "Reading" : "Compare & practice"}
            </span>
            <span className="block font-semibold">{p.title}</span>
            <span className="block text-sm text-muted-foreground">{p.subcategory || category}</span>
            <span className="block text-sm font-semibold">
              {completed.has(p.id) ? "✓ Completed · Practice again" : "Start practice →"}
            </span>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <p className="py-3 text-sm">
          No exercises match these filters. Choose All exercises or change your search.
        </p>
      )}
      {active && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{active.title}</h3>
            <div className="flex gap-2">
              <GhostButton
                onClick={() =>
                  setSelected(
                    filtered.find((p) => p.id !== active.id && !completed.has(p.id))?.id ?? null,
                  )
                }
              >
                Next pending →
              </GhostButton>
              <GhostButton onClick={() => setSelected(null)}>Close exercise</GhostButton>
            </div>
          </div>
          {completed.has(active.id) && (
            <p role="status" className="text-sm font-semibold text-emerald-700">
              Completed! You can review your answers or choose the next pending exercise.
            </p>
          )}
          {active.format === "reading" ? (
            <PracticeReadingCard
              key={`${studentId}-${active.id}`}
              practice={active}
              studentId={studentId ?? ""}
              readOnly={readOnly || !studentId}
            />
          ) : (
            <PracticeComparativaCard
              key={`${studentId}-${active.id}`}
              practice={active}
              studentId={studentId ?? ""}
              readOnly={readOnly || !studentId}
            />
          )}
        </div>
      )}
    </section>
  );
}
