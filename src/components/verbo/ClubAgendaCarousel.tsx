import { useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageCircle,
} from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar-events";
import { clubAgendaState } from "@/lib/club-agenda";
import { academyTime, ACADEMY_TIME_ZONE } from "@/lib/academy-time";
import "./student-agenda.css";

/** Uses the calendar's scoped catalog and the existing reservation callback. */
export function ClubAgendaCarousel({
  events,
  onOpen,
  onExplore,
}: {
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
  onExplore: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const upcoming = events
    .filter((e) => e.club && !clubAgendaState(e, now).terminal)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const first = upcoming.findIndex((e) => !clubAgendaState(e, now).full || e.booked);
  const selectedIndex = upcoming.findIndex((e) => e.id === selectedId);
  const index = selectedIndex >= 0 ? selectedIndex : Math.max(0, first);
  const event = upcoming[index];
  const move = (offset: number) =>
    setSelectedId(upcoming[(index + offset + upcoming.length) % upcoming.length].id);
  const state = event ? clubAgendaState(event, now) : null;
  const club = event?.club;
  const Icon = event?.kind === "book_club" ? BookOpen : MessageCircle;
  return (
    <section
      className="agenda-clubs"
      aria-label="Your next club experience"
      aria-roledescription="carousel"
    >
      <div className="agenda-clubs-heading">
        <h2>Your next experience</h2>
        <button type="button" onClick={onExplore}>
          Explore all clubs <ChevronRight size={16} aria-hidden />
        </button>
      </div>
      {event && club && state ? (
        <>
          <div
            className="agenda-club-feature"
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${upcoming.length}: ${club.title}`}
          >
            <div className="agenda-club-cover">
              {club.cover_image ? (
                <img
                  src={club.cover_image}
                  alt=""
                  loading="lazy"
                  style={{
                    objectPosition: `${club.cover_position_x ?? 50}% ${club.cover_position_y ?? 50}%`,
                    transformOrigin: `${club.cover_position_x ?? 50}% ${club.cover_position_y ?? 50}%`,
                    transform: `scale(${club.cover_scale ?? 1})`,
                  }}
                />
              ) : (
                <Icon size={72} aria-hidden />
              )}
            </div>
            <div className="agenda-club-copy">
              <span className="agenda-club-eyebrow">
                <Icon size={18} aria-hidden />{" "}
                {club.type === "book" ? "BOOK CLUB" : "VERBO INSIGHT"}
              </span>
              <h3>{club.title}</h3>
              {(club.subtitle || club.description) && (
                <p className="agenda-club-description">{club.subtitle || club.description}</p>
              )}
              <div className="agenda-club-meta">
                <span>
                  <CalendarDays size={16} aria-hidden />
                  {new Date(club.date).toLocaleDateString("en-US", {
                    timeZone: ACADEMY_TIME_ZONE,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span>
                  <Clock size={16} aria-hidden />
                  {academyTime(club.date)} · {club.duration_minutes} min · CDMX
                </span>
                <span>
                  {state.reserved ? (
                    <Check size={16} aria-hidden />
                  ) : (
                    <span
                      className="agenda-club-dot"
                      style={{ background: state.full ? "#fb923c" : "#4ade80" }}
                    />
                  )}
                  {state.label === "Available" ? "Places available" : state.label}
                </span>
              </div>
            </div>
            <div className="agenda-club-actions">
              <button type="button" className="agenda-reserve" onClick={() => onOpen(event)}>
                {state.reserved || state.full || state.label === "Live"
                  ? "View details"
                  : "Reserve my place"}
                <ChevronRight size={17} aria-hidden />
              </button>
              {!state.reserved && !state.full && state.label !== "Live" && (
                <button type="button" className="agenda-details" onClick={() => onOpen(event)}>
                  View details
                </button>
              )}
            </div>
          </div>
          {upcoming.length > 1 && (
            <div className="agenda-carousel-controls">
              <button type="button" aria-label="Previous club" onClick={() => move(-1)}>
                <ChevronLeft size={18} aria-hidden />
              </button>
              <span aria-live="polite">
                {index + 1} / {upcoming.length}
              </span>
              <button type="button" aria-label="Next club" onClick={() => move(1)}>
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="agenda-clubs-empty">
          <MessageCircle size={24} aria-hidden />
          <p>New club experiences will appear here when they are published.</p>
          <button type="button" onClick={onExplore}>
            Explore clubs
          </button>
        </div>
      )}
    </section>
  );
}
