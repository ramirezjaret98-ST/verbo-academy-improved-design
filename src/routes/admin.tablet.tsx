// Tablet quick-actions view ("Tablet Mode") — 2026-08-19.
//
// Jaret's use case: he's driving, a teacher or student asks (via WhatsApp/
// call) to reschedule or change something, and whoever is riding with him
// (who may not know the platform at all) needs to resolve it from a
// bookmark on the tablet in a handful of taps. Nothing here is a new
// engine — every action below opens the SAME modal/component the real
// Admin pages already use (RescheduleModal, PlanModal, updateSession(),
// ClubFormPanel, ResetPasswordModal, the real Teacher/Student detail
// pages). This file only adds a simplified, big-tap-target ENTRY POINT
// into that existing machinery, plus the "today/tomorrow" list and a
// person/club picker so nobody has to know a name is spelled a certain
// way or which nav tab something lives under.
//
// Deliberately NOT listed in admin.tsx's NAV_GROUPS — reached only via the
// "Tablet View" button on the Dashboard (admin.index.tsx) or a direct URL,
// and gated to super_admin in admin-roles.ts (canAccessAdminPath).
//
// Freezing/suspending a teacher or student is intentionally NOT a one-tap
// button here: freezing a teacher who has active students requires
// reassigning each of them first (TeacherDetailModal's guided flow in
// admin.teachers.tsx) — that safeguard is real and shouldn't be bypassed
// for the sake of a shortcut. So "View profile" deep-links into the real
// Teachers/Students page, pre-opened to that person (the same
// `?teacher=<id>` / `?student=<id>` pattern the Dashboard's own urgency
// cards already use) — same one extra tap either way once you're on the
// right page. Resetting a password has no such dependency, so that one
// IS a direct one-tap action here via the real ResetPasswordModal.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Monitor, Search, MessageCircle, KeyRound, UserRoundCog, CalendarClock,
  Users2, AlertTriangle, ChevronRight, CalendarDays,
} from "lucide-react";
import { USERS, userById, type User } from "@/lib/mock-data";
import { Card } from "@/components/verbo/ui";
import { hydrateStudents, subscribeStudents } from "@/lib/students-store";
import { hydrateTeachers, subscribeTeachers } from "@/lib/teacher-model";
import { subscribeSessions } from "@/lib/sessions-store";
import {
  loadClubs, subscribeClubs, updateClub, type Club,
} from "@/lib/clubs-store";
import {
  allCalendarEvents, adminCalendarEvents, EVENT_KIND_META, type CalendarEvent,
} from "@/lib/calendar-events";
import { CalendarView } from "@/components/verbo/CalendarView";
import { EventDetailsModal } from "@/routes/admin.calendar";
import { ClubFormPanel } from "@/routes/admin.clubs";
import { ResetPasswordModal } from "@/components/verbo/ResetPasswordModal";
import { waLink } from "@/lib/phone-utils";
import { computeUrgencySignals } from "@/lib/urgent-items";
import { UrgencyList } from "@/components/verbo/UrgencyList";

export const Route = createFileRoute("/admin/tablet")({ component: TabletPage });

const BRAND = "#01304a";

function sectionCard(className = "") {
  return `!p-5 ${className}`;
}

/** Presentational only — which name(s) to show on a today/tomorrow card.
 *  Mirrors (a simplified read of) the same fields EventDetailsModal uses,
 *  not a second set of rules. */
function eventPeople(e: CalendarEvent): { primary: string; secondary: string } {
  const s = e.session;
  const c = e.club;
  if (s) {
    const teacher = userById(s.teacher_id)?.name ?? "—";
    if (s.origin === "workshop") return { primary: "Workshop cohort", secondary: teacher };
    if (s.group_id) return { primary: e.title, secondary: teacher };
    const student = userById(s.student_id)?.name ?? "—";
    return { primary: student, secondary: teacher };
  }
  if (c) {
    return { primary: c.title, secondary: c.teacher_id ? (userById(c.teacher_id)?.name ?? "—") : "Unassigned" };
  }
  return { primary: e.title, secondary: "" };
}

function TabletPage() {
  const navigate = useNavigate();
  const [, forceTick] = useState(0);

  useEffect(() => {
    hydrateStudents();
    hydrateTeachers();
    const unsubs = [
      subscribeStudents(() => forceTick((n) => n + 1)),
      subscribeTeachers(() => forceTick((n) => n + 1)),
      subscribeSessions(() => forceTick((n) => n + 1)),
      subscribeClubs(() => forceTick((n) => n + 1)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);

  // ---- Needs attention (same rules as the Dashboard, urgent-only) -------
  const { urgent } = computeUrgencySignals(navigate);

  // ---- Today / tomorrow sessions -----------------------------------------
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfTomorrow = new Date(startOfToday.getTime() + 2 * 24 * 60 * 60 * 1000);
  const todayTomorrow = allCalendarEvents()
    .filter((e) => {
      const d = new Date(e.date);
      return d >= startOfToday && d < endOfTomorrow;
    })
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  // ---- Person search (students & teachers) -------------------------------
  const [personQuery, setPersonQuery] = useState("");
  const [resetPwFor, setResetPwFor] = useState<User | null>(null);
  const personQueryTrimmed = personQuery.trim().toLowerCase();
  const peopleResults = personQueryTrimmed
    ? USERS
        .filter((u) => (u.role === "student" || u.role === "teacher") && u.name.toLowerCase().includes(personQueryTrimmed))
        .slice(0, 8)
    : [];

  // ---- Clubs ---------------------------------------------------------------
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const allClubsList = loadClubs();
  const upcomingClubs = allClubsList
    .filter((c) => c.status !== "completed" && c.status !== "cancelled" && +new Date(c.date) >= now.getTime())
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 10);

  // ---- Embedded Calendar Overview (same picker as Admin > Calendar) -----
  const [calTeacherId, setCalTeacherId] = useState("");
  const [calStudentId, setCalStudentId] = useState("");
  const calTeachers = USERS.filter((u) => u.role === "teacher");
  const calStudents = USERS.filter((u) => u.role === "student");
  const calHasFilter = !!calTeacherId || !!calStudentId;
  const calEvents = adminCalendarEvents({ teacherId: calTeacherId || undefined, studentId: calStudentId || undefined });

  return (
    <div className="space-y-8 pb-16">
      {/* Header — big, unmistakable "you're in Tablet Mode" band */}
      <div
        className="flex flex-col gap-4 rounded-2xl px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between"
        style={{ background: `linear-gradient(135deg, ${BRAND} 0%, #02466b 100%)` }}
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">Tablet Mode</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em]">Quick actions</h1>
          <p className="mt-1 text-sm font-light text-white/80">
            Tap a session, a person, or a club below — everything opens the real Admin tools, simplified.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin" })}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:bg-white/25 active:scale-[0.97]"
        >
          <Monitor className="h-4 w-4" /> Desktop View
        </button>
      </div>

      {/* Needs attention */}
      <section className="verbo-admin-section">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" style={{ color: "#b52904" }} />
          <h2 className="text-base font-semibold text-foreground">Needs attention</h2>
        </div>
        <Card className={sectionCard()}>
          <UrgencyList items={urgent} empty="All caught up — nothing urgent right now." />
        </Card>
      </section>

      {/* Today / tomorrow sessions */}
      <section className="verbo-admin-section">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4" style={{ color: BRAND }} />
          <h2 className="text-base font-semibold text-foreground">Today &amp; tomorrow</h2>
        </div>
        <Card className={sectionCard()}>
          {todayTomorrow.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled today or tomorrow.</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {todayTomorrow.map((e) => {
                const kindMeta = EVENT_KIND_META[e.kind];
                const people = eventPeople(e);
                const d = new Date(e.date);
                return (
                  <button
                    key={e.id}
                    onClick={() => setOpenEvent(e)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-transform hover:bg-secondary/40 active:scale-[0.98]"
                  >
                    <span
                      className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg text-white"
                      style={{ background: kindMeta.color }}
                    >
                      <span className="text-sm font-bold leading-none">
                        {d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span className="mt-1 text-[9px] font-medium uppercase tracking-wide opacity-90">
                        {d.toDateString() === startOfToday.toDateString() ? "Today" : "Tomorrow"}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{people.primary}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {kindMeta.label}{people.secondary ? ` · ${people.secondary}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* Person search */}
      <section className="verbo-admin-section">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4" style={{ color: BRAND }} />
          <h2 className="text-base font-semibold text-foreground">Find a student or teacher</h2>
        </div>
        <Card className={sectionCard()}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={personQuery}
              onChange={(e) => setPersonQuery(e.target.value)}
              placeholder="Type a name…"
              className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-base outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {personQuery.trim() && (
            <div className="mt-3 space-y-2">
              {peopleResults.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No match.</p>
              ) : peopleResults.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{u.name}</span>
                    <span
                      className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: u.role === "teacher" ? "#a34ac01f" : "#3ebbad1f",
                        color: u.role === "teacher" ? "#a34ac0" : "#3ebbad",
                      }}
                    >
                      {u.role === "teacher" ? "Teacher" : "Student"}
                    </span>
                  </span>
                  {u.phone && (
                    <a
                      href={waLink(u.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                  <button
                    onClick={() => setResetPwFor(u)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Reset password
                  </button>
                  <button
                    onClick={() => navigate({
                      to: u.role === "teacher" ? "/admin/teachers" : "/admin/students",
                      search: u.role === "teacher" ? { teacher: u.id } : { student: u.id },
                    })}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                    style={{ background: BRAND }}
                  >
                    <UserRoundCog className="h-3.5 w-3.5" /> View profile / Freeze
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Clubs */}
      <section className="verbo-admin-section">
        <div className="mb-3 flex items-center gap-2">
          <Users2 className="h-4 w-4" style={{ color: "#ffc802" }} />
          <h2 className="text-base font-semibold text-foreground">Clubs — next 10</h2>
        </div>
        <Card className={sectionCard()}>
          {upcomingClubs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No upcoming clubs.</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {upcomingClubs.map((c) => {
                const teacherName = c.teacher_id ? userById(c.teacher_id)?.name : undefined;
                return (
                  <button
                    key={c.id}
                    onClick={() => setEditingClub(c)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-transform hover:bg-secondary/40 active:scale-[0.98]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{c.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {new Date(c.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        {" · "}
                        {teacherName ?? <span className="italic">Unassigned</span>}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* Calendar Overview — same picker + CalendarView as Admin > Calendar */}
      <section className="verbo-admin-section">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4" style={{ color: BRAND }} />
          <h2 className="text-base font-semibold text-foreground">Calendar overview</h2>
        </div>
        <Card className={sectionCard()}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground">Teacher</label>
              <select
                className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                value={calTeacherId}
                onChange={(e) => setCalTeacherId(e.target.value)}
              >
                <option value="">Select a teacher</option>
                {calTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Student</label>
              <select
                className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                value={calStudentId}
                onChange={(e) => setCalStudentId(e.target.value)}
              >
                <option value="">Select a student</option>
                {calStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {calHasFilter ? (
            <div className="mt-4">
              <CalendarView events={calEvents} onEventClick={(ev) => setOpenEvent(ev)} substitutionAware />
            </div>
          ) : (
            <p className="mt-4 py-8 text-center text-sm text-muted-foreground">
              Select a teacher or a student to see their calendar.
            </p>
          )}
        </Card>
      </section>

      {openEvent && (
        <EventDetailsModal event={openEvent} onClose={() => setOpenEvent(null)} />
      )}
      {resetPwFor && (
        <ResetPasswordModal
          userId={resetPwFor.id}
          userName={resetPwFor.name}
          onClose={() => setResetPwFor(null)}
        />
      )}
      {editingClub && (
        <ClubFormPanel
          initial={editingClub}
          clubs={allClubsList}
          onClose={() => setEditingClub(null)}
          onSave={(data) => { void updateClub(editingClub.id, data); setEditingClub(null); }}
        />
      )}
    </div>
  );
}
