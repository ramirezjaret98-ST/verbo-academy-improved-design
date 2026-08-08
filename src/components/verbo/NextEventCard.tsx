// Extracted from src/routes/student.sessions.tsx (pure extraction, no visual
// or behavioral changes) so the Teacher Dashboard can reuse the same card.
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { EVENT_KIND_META, type CalendarEvent } from "@/lib/calendar-events";
import { userById } from "@/lib/mock-data";
import { getLessonPlan } from "@/lib/lesson-plans-store";
import nextUpArt from "@/assets/Verbot_up_next.svg";

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function NextEventCard({ events, onEventClick }: { events: CalendarEvent[]; onEventClick: (ev: CalendarEvent) => void }) {
  const next = useMemo(() => {
    const now = Date.now();
    const skip = new Set(["cancelled", "absent", "completed"]);
    return [...events]
      .filter((e) => +new Date(e.date) > now && !(e.status && skip.has(e.status)))
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))[0] ?? null;
  }, [events]);

  if (!next) return null;

  const kindMeta = EVENT_KIND_META[next.kind];
  const teacherName = next.session ? userById(next.session.teacher_id)?.name : undefined;
  const plan = next.session ? getLessonPlan(next.session.id) : undefined;
  const headline = plan?.title?.trim() ? plan.title : next.title;
  const secondary = teacherName ? `${kindMeta.label} · with ${teacherName}` : kindMeta.label;
  const endTime = new Date(+new Date(next.date) + next.duration_minutes * 60000)
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <button
      type="button"
      onClick={() => onEventClick(next)}
      className="group relative flex h-full min-h-[200px] w-full cursor-pointer flex-col justify-between overflow-hidden rounded-3xl p-6 text-left transition-transform duration-200 verbo-card-hover active:scale-[0.99]"
    >
      <div className="card-gradient-lime pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-3xl border border-border shadow-floating" />
      <img
        src={nextUpArt}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 z-[1] h-[92%] w-auto select-none object-contain object-bottom"
      />
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(1, 48, 74, 0.7)" }}>
          Next up
        </div>
        <ChevronRight
          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
          style={{ color: "rgba(1, 48, 74, 0.6)" }}
        />
      </div>
      <div className="relative z-10 w-[58%] min-w-0">
        <div className="font-display text-2xl font-bold leading-[1.05] tracking-[-0.03em]" style={{ color: "#01304a" }}>
          {headline}
        </div>
        <div className="mt-1 truncate text-xs font-semibold" style={{ color: "rgba(1, 48, 74, 0.75)" }}>
          {secondary}
        </div>
        <div className="mt-3 truncate text-sm font-semibold" style={{ color: "rgba(1, 48, 74, 0.75)" }}>
          {fmtDT(next.date)} – {endTime}
        </div>
      </div>
    </button>
  );
}
