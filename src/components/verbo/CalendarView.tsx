// Reusable calendar shared by Teacher and (later) Student panels.
//
// Consumers pass a flat list of `CalendarEvent` (see calendar-events.ts)
// and this component handles:
//   - Month grid + Day view toggle.
//   - Event-kind filter chips (1:1 Class / Book Club / Insight /
//     Spotlight / Workshop).
//   - Canonical 7-status legend.
//   - Origin badge (Course / Workshop) on each pill.
//
// It is presentation-only: it does not read from any store directly, so
// the Student panel can wire it later with its own event source.

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

import { GhostButton } from "@/components/verbo/ui";
import {
  CALENDAR_STATUS_META,
  CANONICAL_STATUS_ORDER,
  EVENT_KIND_META,
  eventPillDisplay,
  isClubFull,
  isMissedClubEvent,
  type CalendarEvent,
  type CalendarEventKind,
} from "@/lib/calendar-events";
import { SUB_STATUS_META, type ExtSessionStatus } from "@/lib/sessions-store";
import { SUBSTITUTION_COLOR } from "@/lib/status-palette";

export type CalendarViewMode = "month" | "day";

export interface CalendarViewProps {
  events: CalendarEvent[];
  onEventClick?: (ev: CalendarEvent) => void;
  initialMode?: CalendarViewMode;
  /** Restrict the filter chips to a subset (e.g. Student panel hides "workshop"). */
  availableKinds?: CalendarEventKind[];
  /** Which kinds start enabled. Defaults to every chip in `availableKinds`. */
  initialEnabledKinds?: CalendarEventKind[];
  /** Kinds whose event pills get a subtle attention pulse. */
  pulseKinds?: CalendarEventKind[];
  /** Month/day the calendar opens on. Defaults to today. */
  initialDate?: Date;
  /** Staff-only: paint covered pending sessions with the Substitution color. */
  substitutionAware?: boolean;
}



function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function buildMonthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CalendarView({
  events,
  onEventClick,
  initialMode = "month",
  availableKinds,
  initialEnabledKinds,
  pulseKinds,
  initialDate,
  substitutionAware = false,
}: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarViewMode>(initialMode);
  const [cursor, setCursor] = useState(() => { const d = initialDate ? new Date(initialDate) : new Date(); d.setDate(1); return d; });
  const [dayCursor, setDayCursor] = useState(() => (initialDate ? new Date(initialDate) : new Date()));

  const [enabledKinds, setEnabledKinds] = useState<Set<CalendarEventKind>>(
    () => new Set(initialEnabledKinds ?? availableKinds ?? (Object.keys(EVENT_KIND_META) as CalendarEventKind[])),
  );

  const kindsToShow = availableKinds ?? (Object.keys(EVENT_KIND_META) as CalendarEventKind[]);


  const filtered = useMemo(
    () => events.filter((e) => enabledKinds.has(e.kind)),
    [events, enabledKinds],
  );

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const k = dayKey(new Date(e.date));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    for (const list of m.values()) list.sort((a, b) => +new Date(a.date) - +new Date(b.date));
    return m;
  }, [filtered]);

  const toggleKind = (k: CalendarEventKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {(["month", "day"] as CalendarViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`cursor-pointer rounded-md px-3 py-1 text-xs font-semibold capitalize transition-all duration-150 active:scale-[0.97] ${
                  mode === m ? "bg-[#01304a] text-white" : "text-muted-foreground hover:bg-white/60 hover:text-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === "month" ? (
            <div className="flex items-center gap-2">
              <GhostButton onClick={() => setCursor(addMonths(cursor, -1))} className="!px-2.5 cursor-pointer"><ChevronLeft className="h-4 w-4" /></GhostButton>
              <GhostButton onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} className="cursor-pointer">Today</GhostButton>
              <GhostButton onClick={() => setCursor(addMonths(cursor, 1))} className="!px-2.5 cursor-pointer"><ChevronRight className="h-4 w-4" /></GhostButton>
              <span className="ml-1 rounded-full bg-[#cb6ce6]/15 px-3.5 py-1 text-lg font-bold text-[#01304a]">
                {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <GhostButton onClick={() => setDayCursor(addDays(dayCursor, -1))} className="!px-2.5 cursor-pointer"><ChevronLeft className="h-4 w-4" /></GhostButton>
              <GhostButton onClick={() => setDayCursor(new Date())} className="cursor-pointer">Today</GhostButton>
              <GhostButton onClick={() => setDayCursor(addDays(dayCursor, 1))} className="!px-2.5 cursor-pointer"><ChevronRight className="h-4 w-4" /></GhostButton>
              <span className="ml-1 rounded-full bg-[#cb6ce6]/15 px-3.5 py-1 text-lg font-bold text-[#01304a]">
                {dayCursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </span>
            </div>
          )}
        </div>

        {/* Event-kind filter chips */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filter by type
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {kindsToShow.map((k) => {
              const meta = EVENT_KIND_META[k];
              const on = enabledKinds.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  title={on ? `Click to hide ${meta.label} events` : `Click to show ${meta.label} events`}
                  aria-pressed={on}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 hover:-translate-y-px active:scale-[0.96] ${
                    on ? "border-transparent text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                  style={on ? { background: meta.color, color: meta.borderColor ? "#01304a" : "#ffffff", borderColor: meta.borderColor ?? "transparent" } : undefined}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${on && !meta.borderColor ? "bg-white" : ""}`} style={on && !meta.borderColor ? undefined : { background: meta.color, border: meta.borderColor ? `1px solid ${meta.borderColor}` : undefined }} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      {mode === "month" ? (
        <MonthGrid cursor={cursor} eventsByDay={eventsByDay} onEventClick={onEventClick} pulseKinds={pulseKinds} substitutionAware={substitutionAware} />
      ) : (
        <DayList day={dayCursor} events={eventsByDay.get(dayKey(dayCursor)) ?? []} onEventClick={onEventClick} pulseKinds={pulseKinds} substitutionAware={substitutionAware} />

      )}

      {/* Canonical 7-status legend */}
      <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Status legend
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
          {CANONICAL_STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: CALENDAR_STATUS_META[s].color,
                  border: CALENDAR_STATUS_META[s].borderColor ? `1px solid ${CALENDAR_STATUS_META[s].borderColor}` : undefined,
                }}
              />
              <span>{CALENDAR_STATUS_META[s].label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SUB_STATUS_META.cancelled_holiday.color }} />
            <span>{SUB_STATUS_META.cancelled_holiday.label}</span>
          </div>
          {substitutionAware && (
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SUBSTITUTION_COLOR }} />
              <span>Substitution</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function MonthGrid({
  cursor, eventsByDay, onEventClick, pulseKinds, substitutionAware,
}: {
  cursor: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  onEventClick?: (ev: CalendarEvent) => void;
  pulseKinds?: CalendarEventKind[];
  substitutionAware?: boolean;
}) {

  const grid = buildMonthGrid(cursor);
  return (
    <div
      key={`${cursor.getFullYear()}-${cursor.getMonth()}`}
      className="verbo-cal-in grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border text-xs shadow-elevated"
    >
      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
        <div key={d} className="bg-secondary px-2 py-2 text-center font-medium text-muted-foreground">{d}</div>
      ))}
      {grid.map((day, i) => {
        const inMonth = day.getMonth() === cursor.getMonth();
        const dayEvents = eventsByDay.get(dayKey(day)) ?? [];
        const isToday = dayKey(day) === dayKey(new Date());
        return (
          <div
            key={i}
            className={`group/day relative min-h-[110px] p-1.5 transition-[box-shadow,background-color,transform] duration-200 ease-out ${
              isToday ? "bg-[var(--navy-50)] ring-2 ring-inset ring-[#f38934]" : "bg-card"
            } ${inMonth ? "" : "opacity-40"} ${
              dayEvents.length > 0 ? "hover:relative hover:z-10 hover:-translate-y-0.5 hover:shadow-floating" : "hover:bg-secondary/50"
            }`}
          >
            <div className="mb-1 flex items-center">
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                  isToday ? "bg-[#f38934] text-white" : "text-foreground"
                }`}
              >
                {day.getDate()}
              </span>
            </div>
            <div className="space-y-1">
              {dayEvents.slice(0, 3).map((e, idx) => (
                <EventPill key={e.id} index={idx} ev={e} onClick={() => onEventClick?.(e)} pulse={(!!pulseKinds?.includes(e.kind) || e.status === "pending_reschedule") && !isClubFull(e)} substitutionAware={substitutionAware} />
              ))}
              {dayEvents.length > 3 && (
                <div className="px-1.5 text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div>
              )}
            </div>
          </div>
        );
      })}

    </div>
  );
}

function DayList({
  day, events, onEventClick, pulseKinds, substitutionAware,
}: {
  day: Date;
  events: CalendarEvent[];
  onEventClick?: (ev: CalendarEvent) => void;
  pulseKinds?: CalendarEventKind[];
  substitutionAware?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No events on {day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.
      </div>
    );
  }
  return (
    <div key={dayKey(day)} className="verbo-cal-in overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
      {events.map((e, idx) => {
        const pulse = (!!pulseKinds?.includes(e.kind) || e.status === "pending_reschedule") && !isClubFull(e);
        const display = eventPillDisplay(e, { substitutionAware });
        return (
        <button
          key={e.id}
          onClick={() => onEventClick?.(e)}
          style={{ animationDelay: `${idx * 35}ms`, ...(pulse ? { ["--verbo-focus-pulse-color" as string]: display.color } : {}) }}
          className={`verbo-cal-pill flex w-full items-center gap-4 border-b border-border p-3 text-left transition-[background-color,transform] duration-200 ease-out last:border-0 hover:bg-secondary/60 hover:translate-x-0.5 active:scale-[0.995] ${
            pulse ? "verbo-focus-pulse" : ""
          }`}
        >


          <div className="w-16 shrink-0 text-sm font-semibold tabular-nums" style={{ color: "#01304a" }}>
            {fmtTime(e.date)}
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: display.color,
              color: display.borderColor ? "#01304a" : "#ffffff",
              borderColor: display.borderColor ?? "transparent",
            }}
          >
            {EVENT_KIND_META[e.kind].label}
          </span>
          {e.booked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" title="You're in">
              <Check className="h-3 w-3" strokeWidth={3} /> You're in
            </span>
          )}
          {e.is_group && (
            <span className="inline-flex items-center rounded-full bg-[#01304a] px-2 py-0.5 text-[10px] font-bold text-white" title="Group session">
              G
            </span>
          )}
          {e.holiday_makeup && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800" title="Replacement for a session that fell on a holiday">
              Holiday Makeup
            </span>
          )}


          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{e.title}</div>
            {e.subtitle && <div className="truncate text-xs text-muted-foreground">{e.subtitle}</div>}
          </div>
          {e.status && (e.kind === "class" || e.kind === "workshop") && (
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: display.color,
                color: display.borderColor ? "#01304a" : "#ffffff",
                borderColor: display.borderColor ?? "transparent",
              }}
              title={e.sub_status ? SUB_STATUS_META[e.sub_status].label : undefined}
            >
              {e.sub_status
                ? SUB_STATUS_META[e.sub_status].initials
                : display.cellLabel ||
                  (CALENDAR_STATUS_META[e.status as ExtSessionStatus]?.label ?? e.status)}
            </span>
          )}
          {e.origin === "workshop" && (
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">WS</span>
          )}
        </button>
        );
      })}

    </div>
  );
}

function EventPill({ ev, onClick, pulse = false, substitutionAware = false, index = 0 }: { ev: CalendarEvent; onClick: () => void; pulse?: boolean; substitutionAware?: boolean; index?: number }) {
  const display = eventPillDisplay(ev, { substitutionAware });
  const kindMeta = EVENT_KIND_META[ev.kind];
  const isClub = ev.kind === "insight" || ev.kind === "book_club";
  const seats = isClub && ev.spots_total != null
    ? `${ev.spots_taken ?? 0}/${ev.spots_total} Seats`
    : null;
  const cellLabelInline = display.cellLabel && !ev.sub_status
    ? ` · ${display.cellLabel}`
    : "";
  const full = isClub && isClubFull(ev);
  const missed = isMissedClubEvent(ev);
  const showBooked = !!ev.booked && !missed;
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-1 truncate rounded-lg border px-1.5 py-1 text-left text-[10.5px] font-medium shadow-sm verbo-cal-pill transition-[transform,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px hover:shadow-md active:scale-[0.97] cursor-pointer ${
          showBooked ? "ring-2 ring-[#f38934] ring-offset-1 ring-offset-card" : ""
        } ${pulse ? "verbo-focus-pulse" : ""} ${full ? "opacity-55 grayscale-[0.4]" : ""}`}
        style={{
          background: display.color,
          color: display.borderColor ? "#01304a" : "#ffffff",
          borderColor: display.borderColor ?? "transparent",
          animationDelay: `${index * 40}ms`,
          ...(pulse ? { ["--verbo-focus-pulse-color" as string]: display.color } : {}),
        }}

        title={
          (ev.sub_status
            ? `${SUB_STATUS_META[ev.sub_status].label} — ${ev.title}`
            : `${showBooked ? "Reserved — " : ""}${missed ? "Missed" : ev.is_group ? "Group" : kindMeta.label} — ${ev.title}`) +
          (full ? " · Full" : "")
        }
      >

        {showBooked ? (
          <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#f38934] text-white" title="You're in">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        ) : (
          <span className={`rounded px-1 text-[9px] font-bold leading-none ${display.borderColor ? "bg-[#01304a]/10" : "bg-white/20"}`}>
            {display.short}
          </span>
        )}
        <span className="truncate">
          {isClub
            ? `${fmtTime(ev.date)} · ${ev.title}${missed ? " · Missed" : seats ? ` · ${seats}` : ""}`
            : `${fmtTime(ev.date)} · ${ev.is_group ? ev.title : ev.title.split(" ")[0]}${cellLabelInline}`}
        </span>
        {ev.holiday_makeup && (
          <span className="ml-auto shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold leading-none text-amber-800" title="Holiday Makeup">
            HM
          </span>
        )}

      </button>

      {isClub && ev.enrolled_names && ev.enrolled_names.length > 0 && (
        <div className="pointer-events-none absolute left-full top-0 z-20 ml-2 hidden w-52 rounded-lg border border-border bg-card p-3 text-left text-[11px] shadow-floating group-hover:block">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Enrolled Students</div>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-foreground">
            {ev.enrolled_names.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}