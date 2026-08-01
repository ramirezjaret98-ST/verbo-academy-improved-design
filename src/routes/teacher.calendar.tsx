import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileEdit, Video, Sparkles, BookOpen, Lightbulb, LogOut, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { userById } from "@/lib/mock-data";
import { Card, GhostButton, PrimaryButton, SectionTitle, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import {
  loadLessonPlans, saveLessonPlan, subscribeLessonPlans, type LessonPlan,
} from "@/lib/lesson-plans-store";
import {
  loadSessions, subscribeSessions, updateSession, type ExtSession,
} from "@/lib/sessions-store";
import { PlanModal } from "@/components/verbo/PlanModal";
import { CalendarView } from "@/components/verbo/CalendarView";
import {
  teacherCalendarEvents, CALENDAR_STATUS_META, EVENT_KIND_META, calendarEventTheme,
  type CalendarEvent,
} from "@/lib/calendar-events";
import { WORKSHOPS_KEY, loadWorkshops } from "@/lib/workshops-store";
import { SessionDetailsModal } from "@/components/verbo/SessionDetailsModal";
import { CantAttendModal } from "@/components/verbo/CantAttendModal";
import { subscribeStrikes } from "@/lib/strikes-store";
import { addReleaseRequest, type Club } from "@/lib/clubs-store";
import { ClubReportModal, type ClubReportEventInput } from "@/components/verbo/ClubReportModal";
import { getClubReport, subscribeClubReports } from "@/lib/club-reports-store";
import { getCoverageNoteForStudent } from "@/lib/coverage-notes-store";

export const Route = createFileRoute("/teacher/calendar")({ component: Page });

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<ExtSession[]>([]);
  const [plans, setPlans] = useState<Record<string, LessonPlan>>({});
  
  const [planning, setPlanning] = useState<ExtSession | null>(null);
  const [detailsFor, setDetailsFor] = useState<{ session: ExtSession; mode: "ready" | "completed"; title: string; event: CalendarEvent } | null>(null);
  const [cancelling, setCancelling] = useState<ExtSession | null>(null);
  const [clubModal, setClubModal] = useState<Club | null>(null);
  const [releaseFor, setReleaseFor] = useState<Club | null>(null);
  const [reportingClub, setReportingClub] = useState<ClubReportEventInput | null>(null);
  const [spotlightPreview, setSpotlightPreview] = useState<ExtSession | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    setSessions(loadSessions());
    setPlans(loadLessonPlans());
    const u1 = subscribeSessions(() => setSessions(loadSessions()));
    const u2 = subscribeLessonPlans(() => setPlans(loadLessonPlans()));
    const u4 = subscribeStrikes(() => tick((n) => n + 1));
    const u5 = subscribeClubReports(() => tick((n) => n + 1));
    const onWorkshops = (e: StorageEvent) => { if (e.key === WORKSHOPS_KEY) tick((n) => n + 1); };
    if (typeof window !== "undefined") window.addEventListener("storage", onWorkshops);
    return () => { u1(); u2(); u4(); u5(); if (typeof window !== "undefined") window.removeEventListener("storage", onWorkshops); };
  }, []);

  // Build calendar events (classes + workshops + clubs) via the shared adapter.
  const events: CalendarEvent[] = useMemo(() => {
    if (!user) return [];
    const templates = loadWorkshops();
    const cohortName = (cohortId: string): string => {
      for (const t of templates) {
        const c = t.cohorts.find((c) => c.id === cohortId);
        if (c) return `${t.name} · ${c.name}`;
      }
      return "Workshop";
    };
    return teacherCalendarEvents(user.id, {
      studentNameOf: (id) => userById(id)?.name,
      cohortNameOf: cohortName,
    });
  }, [user, sessions, plans]);

  // Active list: upcoming Scheduled/Ready class or workshop sessions only
  // (Session Report submission removes them; the calendar dot remains.).
  const upcoming = useMemo(
    () => events
      .filter((e) =>
        (e.kind === "class" || e.kind === "workshop") &&
        (e.status === "scheduled" || e.status === "ready" || e.status === "rescheduled") &&
        +new Date(e.date) >= Date.now() - 60 * 60_000,
      )
      .sort((a, b) => +new Date(a.date) - +new Date(b.date))
      .slice(0, 4),
    [events],
  );

  const handleEventClick = (ev: CalendarEvent) => {
    // Clubs — quick modal (Join Club / Can't Attend).
    if (ev.kind === "insight" || ev.kind === "book_club") {
      const end = +new Date(ev.date) + ev.duration_minutes * 60_000;
      const alreadyReported = !!getClubReport(ev.id);
      const canReport = end <= Date.now() && !alreadyReported && ev.status !== "cancelled";
      if (canReport) {
        setReportingClub({
          id: ev.id,
          type: ev.kind === "book_club" ? "book" : "insight",
          title: ev.title,
          date: ev.date,
          enrolled_names: ev.enrolled_names ?? [],
        });
      } else if (ev.club) {
        setClubModal(ev.club);
      }
      return;
    }
    if (ev.kind === "spotlight") {
      const end = +new Date(ev.date) + ev.duration_minutes * 60_000;
      if (end <= Date.now()) {
        if (!getClubReport(ev.id)) {
          setReportingClub({
            id: ev.id,
            type: "spotlight",
            title: ev.title,
            date: ev.date,
            enrolled_names: ev.enrolled_names ?? [],
          });
        }
        return;
      }
      if (ev.session) setSpotlightPreview(ev.session);
      return;
    }

    if (!ev.session) return;
    const s = ev.session;
    if (s.status === "completed") {
      setDetailsFor({ session: s, mode: "completed", title: ev.title, event: ev });
      return;
    }
    if (s.status === "ready") {
      setDetailsFor({ session: s, mode: "ready", title: ev.title, event: ev });
      return;
    }
    if (s.status === "absent" || s.status === "no_show" || s.status === "cancelled") return;
    // Scheduled → open Lesson Plan modal to move to Ready.
    setPlanning(s);
  };

  const handleSavePlan = (plan: LessonPlan) => {
    saveLessonPlan(plan);
    updateSession(plan.session_id, { status: "ready" });
    setPlans((prev) => ({ ...prev, [plan.session_id]: plan }));
    setPlanning(null);
  };

  const goReport = (sessionId: string) => {
    // The Session Report modal lives on the dashboard's actionable list;
    // deep-link there so the same shared flow handles it.
    navigate({ to: "/teacher", search: { report: sessionId } as never });
  };

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendar</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          All of your assigned events in one place: Performance Sessions, Focus Workshops,
          Verbo Insights, Book Clubs and Spotlight Sessions. Click a Scheduled session to plan it.
        </p>
      </div>

      <Card>
        <CalendarView events={events} onEventClick={handleEventClick} substitutionAware />
      </Card>

      <div>
        <SectionTitle>Upcoming Sessions</SectionTitle>
        <div className="space-y-3">
          {upcoming.length === 0 && (
            <Card><p className="text-sm text-muted-foreground">No upcoming sessions on your calendar.</p></Card>
          )}
          {upcoming.map((ev, index) => {
            const statusKey = ((ev.status ?? "scheduled") as keyof typeof CALENDAR_STATUS_META);
            const meta = CALENDAR_STATUS_META[statusKey] ?? CALENDAR_STATUS_META.scheduled;
            const kindMeta = EVENT_KIND_META[ev.kind];
            const theme = calendarEventTheme(ev, { substitutionAware: true });
            const isNext = index === 0;
            const needsPlan = ev.status === "scheduled" || ev.status === "rescheduled";
            const ended = ev.session ? +new Date(ev.date) + ev.session.duration_minutes * 60_000 <= Date.now() : false;
            const d = new Date(ev.date);
            const day = d.toLocaleDateString([], { day: "2-digit" });
            const month = d.toLocaleDateString([], { month: "short" }).toUpperCase();
            const weekday = d.toLocaleDateString([], { weekday: "short" });
            const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const actionable = !!ev.session && (
              (ended && ev.status === "ready") || ev.status === "scheduled" || ev.status === "rescheduled"
            );
            return (
              <div
                key={ev.id}
                className={cn(
                  "verbo-card-hover group relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-card p-4 pl-6 transition-shadow hover:shadow-floating",
                  !isNext && "shadow-soft",
                )}
                style={isNext ? { boxShadow: `0 0 22px -4px color-mix(in srgb, ${theme.solid} 28%, transparent)` } : undefined}
              >
                {/* Status accent rail */}
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: theme.background }} aria-hidden />
                <div className="flex items-center gap-4">
                  {/* Date block — the date/time is now the protagonist */}
                  <div
                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-white"
                    style={{ background: theme.background, color: theme.textTone === "dark" ? "#01304a" : undefined }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{month}</span>
                    <span className="text-xl font-bold leading-none">{day}</span>
                  </div>
                  <div>
                    <div className="text-base font-semibold leading-tight tracking-tight text-foreground">
                      {ev.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{weekday} · {time}</span>
                      {ev.subtitle && <span className="text-xs text-muted-foreground">{ev.subtitle}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: kindMeta.color }}>
                        {kindMeta.label}
                      </span>
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: theme.solid, borderColor: `${theme.solid}55`, background: `${theme.solid}14` }}
                      >
                        {meta.label}
                      </span>
                      {isNext && needsPlan && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ background: theme.solid, color: theme.textTone === "dark" ? "#01304a" : undefined }}
                        >
                          Plan now
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {actionable ? (
                    <button
                      type="button"
                      onClick={() => (ended && ev.status === "ready" ? goReport(ev.session!.id) : setPlanning(ev.session!))}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-[box-shadow,filter] duration-200 ease-out hover:shadow-floating hover:brightness-110"
                      style={{ background: theme.background, color: theme.textTone === "dark" ? "#01304a" : undefined }}
                    >
                      {ended && ev.status === "ready" ? (<><FileEdit className="h-4 w-4" /> Fill Session Report</>) : "Plan"}
                    </button>
                  ) : (
                    <GhostButton disabled className="cursor-not-allowed opacity-50">—</GhostButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {planning && (
        <PlanModal
          session={planning}
          existing={plans[planning.id]}
          onClose={() => setPlanning(null)}
          onSave={handleSavePlan}
        />
      )}

      {detailsFor && (() => {
        const theme = calendarEventTheme(detailsFor.event, { substitutionAware: true });
        return (
        <SessionDetailsModal
          background={theme.background}
          iconTint={theme.solid}
          textTone={theme.textTone}
          session={detailsFor.session}
          plan={plans[detailsFor.session.id]}
          title={detailsFor.title}
          mode={detailsFor.mode}
          coverageNote={getCoverageNoteForStudent(detailsFor.session.student_id)}
          onClose={() => setDetailsFor(null)}
          onCantAttend={() => { const s = detailsFor.session; setDetailsFor(null); setCancelling(s); }}
          onEditPlan={() => { const s = detailsFor.session; setDetailsFor(null); setPlanning(s); }}
        />
        );
      })()}

      {cancelling && (
        <CantAttendModal
          session={cancelling}
          teacherId={user.id}
          onClose={() => setCancelling(null)}
          onDone={({ needsSubstitute }) => {
            setCancelling(null);
            toast.success(needsSubstitute
              ? "Cancellation submitted. WhatsApp message ready — send it to notify Admin (substitute needed)."
              : "Cancellation submitted. WhatsApp message ready — send it to notify Admin.");
          }}
        />
      )}

      {clubModal && (
        <ClubQuickModal
          club={clubModal}
          onClose={() => setClubModal(null)}
          onCantAttend={() => { const c = clubModal; setClubModal(null); setReleaseFor(c); }}
        />
      )}

      {releaseFor && (
        <RequestReleaseModal
          club={releaseFor}
          onClose={() => setReleaseFor(null)}
          onSubmit={(reason) => {
            if (user) addReleaseRequest({ club_id: releaseFor.id, teacher_id: user.id, reason });
            setReleaseFor(null);
            toast.success("Release request submitted for admin approval");
          }}
        />
      )}

      {reportingClub && user && (
        <ClubReportModal
          event={reportingClub}
          teacherId={user.id}
          onClose={() => setReportingClub(null)}
        />
      )}

      {spotlightPreview && (
        <SpotlightPreviewModal session={spotlightPreview} onClose={() => setSpotlightPreview(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spotlight preview modal — shown before the session ends, with connect link.
// ---------------------------------------------------------------------------
function SpotlightPreviewModal({ session, onClose }: { session: ExtSession; onClose: () => void }) {
  const student = userById(session.student_id);
  const connect = () => { if (session.teams_link) window.open(session.teams_link, "_blank"); };
  return (
    <AccentModal
      background={EVENT_KIND_META.spotlight.color}
      iconTint={EVENT_KIND_META.spotlight.color}
      icon={Sparkles}
      eyebrow="Spotlight"
      title={`Spotlight with ${student?.name ?? "Student"}`}
      watermark={{ type: "icon", icon: Sparkles }}
      onClose={onClose}
    >
      <div className="px-6 py-5">
        <p className="text-sm text-muted-foreground">{fmtDateTime(session.date_time)} · {session.duration_minutes} min</p>
        {session.notes && (
          <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-3 text-sm text-foreground">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What the student needs</div>
            {session.notes}
          </div>
        )}
      </div>
      <AccentModalFooter accent={EVENT_KIND_META.spotlight.color}>
        <GhostButton onClick={onClose}>Close</GhostButton>
        <PrimaryButton onClick={connect} disabled={!session.teams_link}>
          <Video className="h-4 w-4" /> Connect
        </PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}

/** Club identity, mirroring calendarEventTheme() for insight / book_club. */
function clubTheme(type: Club["type"]) {
  return type === "book"
    ? { background: "linear-gradient(135deg, #c2410c 0%, #000000 100%)", solid: "#c2410c", icon: BookOpen, label: "Book Club" }
    : { background: "linear-gradient(135deg, #01304a 0%, #05070a 100%)", solid: "#01304a", icon: Lightbulb, label: "Insight" };
}

// ---------------------------------------------------------------------------
// Club quick modal — Join / Can't Attend shortcut on the calendar. The
// "Can't Attend" branch reuses the existing Request Release flow from
// Fase 6 so there is exactly one release pipeline.
// ---------------------------------------------------------------------------
function ClubQuickModal({ club, onClose, onCantAttend }: {
  club: Club; onClose: () => void; onCantAttend: () => void;
}) {
  const theme = clubTheme(club.type);
  return (
    <AccentModal
      background={theme.background}
      iconTint={theme.solid}
      icon={theme.icon}
      eyebrow={theme.label}
      title={club.title}
      watermark={{ type: "icon", icon: theme.icon }}
      onClose={onClose}
    >
      <div className="px-5 py-4 text-sm text-muted-foreground">
        {new Date(club.date).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        {" · "}{club.spots_taken}/{club.spots_total} Seats
      </div>
      <AccentModalFooter accent={theme.solid}>
        <GhostButton onClick={onCantAttend}>Can't Attend</GhostButton>
        <a
          href={club.link || "#"} target="_blank" rel="noopener noreferrer"
          onClick={(e) => { if (!club.link) e.preventDefault(); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Video className="h-3.5 w-3.5" /> Join Club
        </a>
      </AccentModalFooter>
    </AccentModal>
  );
}

function RequestReleaseModal({ club, onClose, onSubmit }: {
  club: Club; onClose: () => void; onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const theme = clubTheme(club.type);
  return (
    <AccentModal
      background={theme.background}
      iconTint={theme.solid}
      icon={LogOut}
      eyebrow={`${theme.label} · Release`}
      title="Request Release"
      watermark={{ type: "icon", icon: LogOut }}
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-5">
        <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">{club.title}</div>
          <div>{theme.label} · {new Date(club.date).toLocaleString()}</div>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Why you need to release this club…" className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <p className="text-[11px] text-muted-foreground">This does not release the club immediately — an admin will review. If approved, a penalty may be applied.</p>
      </div>
      <AccentModalFooter accent={theme.solid}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={() => onSubmit(reason.trim())}>Submit Request</PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}

