import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccentModal, AccentModalFooter, Card, GhostButton, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import type { LucideIcon } from "lucide-react";
import { USERS } from "@/lib/mock-data";
import {
  type Club, type ClubType, type ClubTitleFont, type TimeStatus, type ClubReleaseRequest,
  assignmentOf, clubTeacherName as teacherName,
  loadClubs, createClub, updateClub, deleteClub, subscribeClubs, releaseClub, approveClubRelease,
  loadReleaseRequests, subscribeReleaseRequests, removeReleaseRequest,
} from "@/lib/clubs-store";
import { notifySuccess, notifyError } from "@/lib/notify";
import { uploadClubFile, removeUploadedClubFiles, validateClubFile, type UploadedClubMedia } from "@/lib/club-media";
import { InsightsDashboard } from "@/components/verbo/InsightsDashboard";
import { ClubReservationModal } from "@/components/verbo/ClubReservationModal";
import { ClubCatalog } from "@/components/verbo/ClubCatalog";
import { loadAdminCatalogRequests, updateSuggestionStatus, type ClubSuggestion, type ClubRepeatRequest } from "@/lib/club-catalog-store";
import { CalendarView as StudentCalendarView } from "@/components/verbo/CalendarView";
import type { CalendarEvent } from "@/lib/calendar-events";
import {
  Sparkles,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  UploadCloud,
  X,
  Link as LinkIcon,
  Calendar,
  Image as ImageIcon,
  AlertTriangle,
  Search,
  List,
  CalendarDays,
  History,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Inbox,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/admin/clubs")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({
    new: s.new === true || s.new === "true" || s.new === "1",
  }),
});


const STATUS_TONE: Record<TimeStatus, "default" | "success" | "warning" | "danger" | "muted"> = {
  upcoming: "default",
  live: "success",
  completed: "muted",
  cancelled: "danger",
};


function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toLocalDateTime(iso: string) {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

// Simple normalized similarity — no AI. Exact-ish match ignoring case/spacing.
function normalizeTitle(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function similarTitle(a: string, b: string) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  // token overlap
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const overlap = inter / Math.max(ta.size, tb.size);
  return overlap >= 0.75;
}

type ViewMode = "list" | "calendar" | "history" | "requests";

function Page() {
  const { new: openNew } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [clubs, setClubs] = useState<Club[]>(() => loadClubs());
  const [requests, setRequests] = useState<ClubReleaseRequest[]>(() => loadReleaseRequests());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Club | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [studentPreview, setStudentPreview] = useState<"home" | "calendar" | "catalog" | null>(null);
  const [previewClub, setPreviewClub] = useState<Club | null>(null);

  useEffect(() => {
    setClubs(loadClubs());
    setRequests(loadReleaseRequests());
    const u1 = subscribeClubs(() => setClubs(loadClubs()));
    const u2 = subscribeReleaseRequests(() => setRequests(loadReleaseRequests()));
    return () => { u1(); u2(); };
  }, []);

  // Open the create modal when arriving from a Quick Action (?new=1).
  useEffect(() => {
    if (openNew) {
      setEditing(null);
      setOpen(true);
      navigate({ search: {}, replace: true });
    }
  }, [openNew, navigate]);

  const onCreate = () => { setEditing(null); setOpen(true); };
  const onEdit = (c: Club) => { setEditing(c); setOpen(true); };
  const onDelete = (id: string) => {
    void deleteClub(id).then((ok) => {
      if (ok) notifySuccess("Club deleted.");
      else notifyError("Couldn't delete the club — try again.", { context: "Deleting club" });
    });
  };

  const onSave = async (data: Omit<Club, "id" | "spots_taken" | "status">): Promise<boolean> => {
    if (editing) {
      const res = await updateClub(editing.id, data);
      if (!res) return false;
      notifySuccess("Club updated.");
    } else {
      const res = await createClub(data);
      if (!res) return false;
      notifySuccess("Club published.");
    }
    setOpen(false);
    return true;
  };

  if (studentPreview) {
    const events: CalendarEvent[] = clubs.filter((c) => c.type === "insight" && c.status !== "cancelled").map((c) => ({ id: c.id, kind: "insight", date: c.date, duration_minutes: c.duration_minutes, title: c.title, subtitle: "Insight", status: c.status, spots_taken: c.spots_taken, spots_total: c.spots_total, club: c }));
    return <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-5 py-3"><div><strong className="text-sm text-foreground">Insights student preview</strong><p className="text-xs text-muted-foreground">Live Academy content; quota, reservations and actions are disabled.</p></div><GhostButton onClick={() => { setPreviewClub(null); setStudentPreview(null); }}>Back to Manage Clubs</GhostButton></div>
      <div className="flex gap-2"><GhostButton onClick={() => setStudentPreview("calendar")}>Calendar</GhostButton><GhostButton onClick={() => setStudentPreview("catalog")}>Catalog</GhostButton></div>
      {studentPreview === "home" ? <InsightsDashboard name="student" preview onExplore={() => setStudentPreview("calendar")} /> : studentPreview === "catalog" ? <ClubCatalog clubs={clubs} studentId="" preview /> : <div className="space-y-4"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Explore Insights</h1><p className="text-sm text-muted-foreground">Read-only calendar preview.</p></div><GhostButton onClick={() => { setPreviewClub(null); setStudentPreview("home"); }}>Dashboard</GhostButton></div><Card><StudentCalendarView events={events} availableKinds={["insight"]} onEventClick={(event) => { if (event.club) setPreviewClub(event.club); }} /></Card></div>}
      {previewClub && <ClubReservationModal club={previewClub} studentId="" preview onClose={() => setPreviewClub(null)} />}
    </div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Manage Clubs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and curate Verbo Insights and Book Clubs that appear on the student calendar.</p>
        </div>
        <div className="flex flex-wrap gap-2"><GhostButton onClick={() => setStudentPreview("catalog")}>Preview catalog as student</GhostButton><PrimaryButton accentColor="#5fca16" onClick={onCreate}>
          <Plus className="h-4 w-4" /> Create New Club Event
        </PrimaryButton></div>
      </div>
      <ReleaseRequestsPanel requests={requests} clubs={clubs} />

      {/* View switcher */}
      <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1">
        {([
          { id: "list", label: "List View", icon: List },
          { id: "calendar", label: "Calendar View", icon: CalendarDays },
          { id: "history", label: "Topic History", icon: History },
          { id: "requests", label: "Catalog Requests", icon: Inbox },
        ] as { id: ViewMode; label: string; icon: typeof List }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all ${
              view === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {view === "list" && <ListView clubs={clubs} onEdit={onEdit} onDelete={onDelete} />}
      {view === "calendar" && <CalendarView clubs={clubs} onEdit={onEdit} />}
      {view === "history" && <TopicHistory clubs={clubs} />}
      {view === "requests" && <CatalogRequestsPanel clubs={clubs} />}


      {open && <ClubFormPanel initial={editing} clubs={clubs} onClose={() => setOpen(false)} onSave={onSave} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view (existing table + Assignment column)
// ---------------------------------------------------------------------------
function CatalogRequestsPanel({ clubs }: { clubs: Club[] }) {
  const [suggestions, setSuggestions] = useState<ClubSuggestion[]>([]);
  const [repeats, setRepeats] = useState<ClubRepeatRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = async () => {
    try {
      const data = await loadAdminCatalogRequests();
      setSuggestions(data.suggestions);
      setRepeats(data.repeats);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load requests.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const reasonLabel: Record<string, string> = {
    missed: "Missed it", full: "It was full", again: "Would join again",
  };
  const repeatGroups = Object.values(repeats.reduce<Record<string, ClubRepeatRequest[]>>((groups, request) => {
    (groups[String(request.club_id)] ??= []).push(request);
    return groups;
  }, {})).sort((a, b) => b.length - a.length);
  const changeStatus = async (id: number, status: "new" | "reviewed" | "planned" | "closed") => {
    try {
      await updateSuggestionStatus(id, status);
      await refresh();
      notifySuccess("Suggestion updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update."); }
  };
  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Card><div className="flex items-center justify-between gap-3"><div><SectionTitle>Suggestions from students</SectionTitle><p className="mt-1 text-sm text-muted-foreground">Ideas for Insights and Book Clubs. Review before adding a scheduled club.</p></div><GhostButton onClick={() => void refresh()}>Refresh</GhostButton></div>
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : suggestions.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No suggestions yet.</p> :
        <div className="mt-4 space-y-3">{suggestions.map((item) => <div key={item.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-wider text-accent">{item.type === "book" ? "Book Club" : "Insight"}</span><h3 className="text-base font-semibold">{item.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.details || "No additional details."}</p><p className="mt-2 text-xs text-muted-foreground">{USERS.find((u) => u.id === item.student_id)?.name ?? "Student"} · {formatDate(item.created_at)}</p></div>
            <select aria-label={`Status for ${item.title}`} value={item.status} onChange={(e) => void changeStatus(item.id, e.target.value as "new" | "reviewed" | "planned" | "closed")} className="rounded-lg border border-border bg-background px-3 py-2 text-xs"><option value="new">New</option><option value="reviewed">Reviewed</option><option value="planned">Planned</option><option value="closed">Closed</option></select>
          </div></div>)}</div>}</Card>
    <Card><SectionTitle>Requests for another Insight</SectionTitle><p className="mt-1 text-sm text-muted-foreground">Internal signal: consider a new edition after four distinct students request it. No event is created automatically.</p>
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : repeatGroups.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No repeat requests yet.</p> :
        <div className="mt-4 space-y-3">{repeatGroups.map((group) => {
          const club = clubs.find((item) => item.id === String(group[0].club_id));
          return <div key={group[0].club_id} className="rounded-xl border border-border p-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{club?.title ?? `Insight #${group[0].club_id}`}</h3><p className="mt-1 text-xs text-muted-foreground">{club && formatDate(club.date)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${group.length >= 4 ? "bg-green-100 text-green-800" : "bg-secondary text-muted-foreground"}`}>{group.length} request{group.length === 1 ? "" : "s"}{group.length >= 4 ? " · Consider scheduling" : ""}</span></div><div className="mt-3 space-y-1 text-xs text-muted-foreground">{group.map((item) => <p key={item.id}>{USERS.find((u) => u.id === item.student_id)?.name ?? "Student"} · {reasonLabel[item.reason] ?? item.reason}</p>)}</div></div>;
        })}</div>}</Card>
  </div>;
}

function ListView({ clubs, onEdit, onDelete }: { clubs: Club[]; onEdit: (c: Club) => void; onDelete: (id: string) => void }) {
  return (
    <Card className="!p-0">
      <div className="border-b border-border px-6 py-4">
        <SectionTitle>All scheduled events</SectionTitle>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-6 py-3 font-medium">Type</th>
            <th className="px-6 py-3 font-medium">Title</th>
            <th className="px-6 py-3 font-medium">Teacher</th>
            <th className="px-6 py-3 font-medium">Scheduled</th>
            <th className="px-6 py-3 font-medium">Spots</th>
            <th className="px-6 py-3 font-medium">Assignment</th>
            <th className="px-6 py-3 font-medium">Status</th>
            <th className="px-6 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((c) => {
            const assignment = assignmentOf(c);
            const tName = teacherName(c.teacher_id);
            return (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-6 py-4">
                  <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.type === "insight" ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary"}`}>
                    {c.type === "insight" ? <Sparkles className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-foreground">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.type === "insight" ? "Verbo Insight" : "Book Club"}</div>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{tName ?? <span className="italic text-muted-foreground/70">Unassigned</span>}</td>
                <td className="px-6 py-4 text-muted-foreground">{formatDate(c.date)}</td>
                <td className="px-6 py-4 text-foreground">{c.spots_taken}/{c.spots_total}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${assignment === "assigned" ? "" : "bg-warning text-warning-foreground"}`}
                    style={assignment === "assigned" ? { background: "#5fca16", color: "#fff" } : undefined}
                  >
                    {assignment === "assigned" ? "Assigned" : "Created"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Pill
                    tone={STATUS_TONE[c.status]}
                    style={
                      c.status === "live"
                        ? { background: "#5fca16", color: "#fff" }
                        : c.status === "cancelled"
                          ? { background: "#ef4444", color: "#fff" }
                          : undefined
                    }
                  >
                    {c.status}
                  </Pill>
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => onEdit(c)} aria-label="Edit" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => onDelete(c.id)} aria-label="Delete" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {clubs.length === 0 && (
            <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-muted-foreground">No club events yet. Create your first one.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Calendar view (monthly grid)
// ---------------------------------------------------------------------------
function CalendarView({ clubs, onEdit }: { clubs: Club[]; onEdit: (c: Club) => void }) {
  const initial = clubs.length ? new Date(clubs[0].date) : new Date();
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0 Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = useMemo(() => {
    const map: Record<number, Club[]> = {};
    clubs.forEach((c) => {
      const d = new Date(c.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        (map[day] ??= []).push(c);
      }
    });
    return map;
  }, [clubs, year, month]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <Card className="!p-0">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <SectionTitle>{monthLabel}</SectionTitle>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <GhostButton className="!px-3 !py-1.5 text-xs" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</GhostButton>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((day, i) => (
            <div key={i} className={`min-h-[104px] rounded-lg border p-2 ${day ? "border-border bg-background" : "border-transparent"}`}>
              {day && (
                <>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{day}</div>
                  <div className="space-y-1">
                    {(byDay[day] ?? []).map((c) => {
                      const assigned = assignmentOf(c) === "assigned";
                      return (
                        <button
                          key={c.id}
                          onClick={() => onEdit(c)}
                          title={`${c.title} · ${assigned ? "Assigned" : "Created"}`}
                          className={`flex w-full items-center gap-1 truncate rounded-md px-2 py-1 text-left text-[11px] font-medium transition-opacity hover:opacity-80 ${
                            assigned ? "" : "bg-warning text-warning-foreground"
                          }`}
                          style={assigned ? { background: "#5fca16", color: "#fff" } : undefined}
                        >
                          {c.type === "insight" ? <Sparkles className="h-3 w-3 shrink-0" /> : <BookOpen className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{c.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: "#5fca16" }} /> Assigned</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-warning" /> Created</span>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Topic History (read-only, searchable, filterable by type)
// ---------------------------------------------------------------------------
function TopicHistory({ clubs }: { clubs: Club[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ClubType>("all");

  const rows = useMemo(() => {
    return clubs
      .filter((c) => typeFilter === "all" || c.type === typeFilter)
      .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [clubs, query, typeFilter]);

  return (
    <Card className="!p-0">
      <div className="flex flex-col gap-4 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <SectionTitle>Topic history</SectionTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics…" className="w-56 rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1 text-sm">
            {([
              { id: "all", label: "All" },
              { id: "insight", label: "Insights" },
              { id: "book", label: "Book Clubs" },
            ] as { id: "all" | ClubType; label: string }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className={`rounded-md px-3 py-1 font-medium transition-all ${typeFilter === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-6 py-3 font-medium">Type</th>
            <th className="px-6 py-3 font-medium">Title</th>
            <th className="px-6 py-3 font-medium">Teacher</th>
            <th className="px-6 py-3 font-medium">Delivered</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <td className="px-6 py-4">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${c.type === "insight" ? "bg-[#f38934] text-white" : "bg-[#01304a] text-white"}`}>
                  {c.type === "insight" ? <Sparkles className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
                  {c.type === "insight" ? "Verbo Insight" : "Book Club"}
                </span>
              </td>
              <td className="px-6 py-4 font-medium text-foreground">{c.title}</td>
              <td className="px-6 py-4 text-muted-foreground">{teacherName(c.teacher_id) ?? <span className="italic text-muted-foreground/70">Unassigned</span>}</td>
              <td className="px-6 py-4 text-muted-foreground">{formatDay(c.date)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-muted-foreground">No topics match your search.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Create / Edit form panel
// ---------------------------------------------------------------------------
function useLocalFileUrl(file: File | null): string | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return preview?.file === file ? preview.url : null;
}

// 2026-08-19: exported so the Tablet quick-actions view can reuse this exact
// form for "assign a teacher to a club" instead of building a parallel mini
// editor — the companion sees the full club form (per Jaret's choice) but
// only ever needs to touch the "Assigned teacher" field.
export function ClubFormPanel({
  initial,
  clubs,
  onClose,
  onSave,
}: {
  initial: Club | null;
  clubs: Club[];
  onClose: () => void;
  onSave: (data: Omit<Club, "id" | "spots_taken" | "status">) => Promise<boolean>;
}) {
  const [type, setType] = useState<ClubType>(initial?.type ?? "insight");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [titleFont, setTitleFont] = useState<ClubTitleFont>(initial?.title_font ?? "sans");
  const [coverPositionX, setCoverPositionX] = useState(initial?.cover_position_x ?? 50);
  const [coverPositionY, setCoverPositionY] = useState(initial?.cover_position_y ?? 50);
  const [coverScale, setCoverScale] = useState(initial?.cover_scale ?? 1);
  const [topicTag, setTopicTag] = useState(initial?.topic_tag ?? "");
  const [catalogFeatured, setCatalogFeatured] = useState(initial?.catalog_featured ?? false);
  const [link, setLink] = useState(initial?.link ?? "");
  const [material, setMaterial] = useState(initial?.material ?? "");
  const [materialName, setMaterialName] = useState(initial?.material ?? "");
  const [cover, setCover] = useState(initial?.cover_image ?? "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [teacherId, setTeacherId] = useState(initial?.teacher_id ?? "");
  const [date, setDate] = useState(initial?.date ? toLocalDateTime(initial.date) : "");
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60);
  const [spotsTotal, setSpotsTotal] = useState(initial?.spots_total ?? (type === "book" ? 6 : 4));
  const coverInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const coverObjectUrl = useLocalFileUrl(coverFile);
  const materialObjectUrl = useLocalFileUrl(materialFile);
  const coverPreviewSrc = coverFile ? coverObjectUrl : cover;
  const [teacherPayment, setTeacherPayment] = useState<string>(
    initial?.teacher_payment != null ? String(initial.teacher_payment) : "",
  );

  const teachers = useMemo(() => USERS.filter((u) => u.role === "teacher"), []);

  // Similar-topic detection against same-type history (exclude the item being edited).
  const similarMatch = useMemo(() => {
    if (!title.trim()) return null;
    return clubs.find((c) => c.id !== initial?.id && c.type === type && similarTitle(c.title, title)) ?? null;
  }, [title, type, clubs, initial]);

  const formData = (mediaCover: string, mediaMaterial: string): Omit<Club, "id" | "spots_taken" | "status"> => ({
    type, title: title.trim(), subtitle: subtitle.trim(), description: description.trim(), instructions: instructions.trim(),
    title_font: titleFont, cover_position_x: coverPositionX, cover_position_y: coverPositionY, cover_scale: coverScale,
    topic_tag: topicTag.trim() || undefined, catalog_featured: catalogFeatured, link: link.trim(),
    material: mediaMaterial, cover_image: mediaCover,
    teacher_id: teacherId || undefined, date: new Date(date).toISOString(), duration_minutes: duration,
    spots_total: spotsTotal,
    teacher_payment: teacherPayment.trim() === "" ? null : Math.max(0, parseFloat(teacherPayment) || 0),
  });

  const validate = (): string | null => {
    if (!title.trim()) return "Add a title.";
    if (!date || Number.isNaN(new Date(date).getTime())) return "Choose a valid date and time.";
    if (duration < 5 || spotsTotal < 1) return "Check the duration and capacity.";
    if (initial && spotsTotal < initial.spots_taken) return "Capacity cannot be below existing reservations.";
    if (link.trim() && !/^https:\/\//i.test(link.trim())) return "The meeting link must begin with https://.";
    if (coverFile) { const issue = validateClubFile(coverFile, "cover"); if (issue) return issue; }
    if (materialFile) { const issue = validateClubFile(materialFile, "material"); if (issue) return issue; }
    return null;
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const issue = validate();
    if (issue) { setFormError(issue); return; }
    setBusy(true);
    setFormError("");
    const uploaded: UploadedClubMedia[] = [];
    try {
      const nextCover = coverFile ? await uploadClubFile(coverFile, "cover") : null;
      if (nextCover) uploaded.push(nextCover);
      const nextMaterial = materialFile ? await uploadClubFile(materialFile, "material") : null;
      if (nextMaterial) uploaded.push(nextMaterial);
      const saved = await onSave(formData(nextCover?.url ?? cover, nextMaterial?.url ?? material));
      if (!saved) throw new Error("The club could not be saved. Your edits are still here; please retry.");
    } catch (error) {
      await removeUploadedClubFiles(uploaded);
      setFormError(error instanceof Error ? error.message : "Could not save the club.");
    } finally { setBusy(false); }
  };

  const isInsight = type === "insight";

  return (
    <AccentModal
      background={isInsight
        ? "linear-gradient(150deg, var(--orange-400) 0%, var(--orange-500) 55%, var(--orange-600) 100%)"
        : "linear-gradient(135deg, #01304a 0%, #02466b 100%)"}
      iconTint={isInsight ? "#f38934" : "#01304a"}
      icon={isInsight ? Sparkles : BookOpen}
      eyebrow="Manage Clubs"
      title={initial ? "Edit Club Event" : "Create New Club Event"}
      watermark={{ type: "text", value: "CLUB" }}
      maxWidth="max-w-xl"
      onClose={() => { if (!busy) onClose(); }}
    >
      <form onSubmit={submit} className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-6">
        <ClubSectionBanner color="#01304a" textColor="#ffffff" icon={Sparkles} title="Event Details" />

        {/* Type toggle */}
        <div>
          <label className="text-xs font-medium text-foreground">Event type</label>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/40 p-1">
            {(["insight", "book"] as ClubType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); if (!initial) setSpotsTotal(t === "book" ? 6 : 4); }}
                className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  type === t ? "bg-[#01304a] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "insight" ? <Sparkles className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                {t === "insight" ? "Verbo Insight" : "Book Club"}
              </button>
            ))}
          </div>
        </div>

        <Field label="Club title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Public Speaking Essentials" className={fieldCls} required />
          {similarMatch && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-xs text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                A similar topic was already taught: <strong>"{similarMatch.title}"</strong> on {formatDay(similarMatch.date)}. You can continue if you want to repeat it.
              </span>
            </div>
          )}
        </Field>

        <Field label="Subtitle">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} placeholder="A short line beneath the title" className={fieldCls} />
        </Field>

        <Field label="Title typography">
          <select value={titleFont} onChange={(e) => setTitleFont(e.target.value as ClubTitleFont)} className={fieldCls}>
            <option value="sans">Verbo Sans</option>
            <option value="serif">Editorial Serif</option>
            <option value="display">Display</option>
          </select>
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What students will learn or discuss." className={`${fieldCls} resize-none`} />
        </Field>
        <Field label="Instructions" help="Preparation, reading or participation instructions shown separately to students.">
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} placeholder="What should students do before joining?" className={`${fieldCls} resize-none`} />
        </Field>
        <Field label="Catalog category" help="Used to organize the student catalog. For example Culture, Mindset or Fiction."><input value={topicTag} onChange={(e) => setTopicTag(e.target.value)} maxLength={40} placeholder="Culture" className={fieldCls} /></Field>
        <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm text-foreground">
          <input type="checkbox" checked={catalogFeatured} onChange={(e) => setCatalogFeatured(e.target.checked)} />
          Feature this club in the student catalog carousel
        </label>

        <ClubSectionBanner color="#3ebbad" textColor="#0b2b28" icon={ImageIcon} title="Media & Materials" />

        <Field label="Cover image" help="Adjust the card crop here, then open the student modal preview to see the full cover.">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-8 text-center">
            <ImageIcon className="h-7 w-7 text-muted-foreground" />
            {coverPreviewSrc ? (
              <div className="relative mb-2 aspect-[17/11] w-full max-w-[340px] overflow-hidden rounded-lg bg-[#0b2c3d]">
                <img src={coverPreviewSrc} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-lg" />
                <img src={coverPreviewSrc} alt="Cover preview" className="absolute inset-0 h-full w-full object-contain" style={{ objectPosition: `${coverPositionX}% ${coverPositionY}%`, transformOrigin: `${coverPositionX}% ${coverPositionY}%`, transform: `scale(${coverScale})` }} />
                {isInsight && <><div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#061c2be8] via-[#061c2b70] to-transparent" /><div className="pointer-events-none absolute left-5 top-1/2 w-[47%] -translate-y-1/2 text-left font-serif text-xl leading-tight text-white">{title || "Club title"}</div></>}
              </div>
            ) : (
              <div className="mt-2 text-sm font-medium text-foreground">{coverFile ? "Preparing image preview…" : "Choose an image"}</div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">JPG, PNG or WebP, up to 8 MB. The full image is visible in the detail modal.</div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const issue = validateClubFile(file, "cover");
                if (issue) setFormError(issue);
                else { setCoverFile(file); setFormError(""); }
                e.target.value = "";
              }}
            />
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <GhostButton type="button" onClick={() => coverInputRef.current?.click()}>{cover || coverFile ? "Change image" : "Choose file"}</GhostButton>
              {(cover || coverFile) && <GhostButton type="button" onClick={() => { setCover(""); setCoverFile(null); }}>Remove image</GhostButton>}
            </div>
          </div>
        </Field>

        {(cover || coverFile) && <div className="grid grid-cols-3 gap-3">
          <Field label={`Horizontal ${coverPositionX}%`}><input type="range" aria-label="Horizontal cover position" min={0} max={100} value={coverPositionX} onChange={(e) => setCoverPositionX(Number(e.target.value))} className="w-full" /></Field>
          <Field label={`Vertical ${coverPositionY}%`}><input type="range" aria-label="Vertical cover position" min={0} max={100} value={coverPositionY} onChange={(e) => setCoverPositionY(Number(e.target.value))} className="w-full" /></Field>
          <Field label={`Card zoom ${coverScale.toFixed(2)}×`}><input type="range" aria-label="Cover card zoom" min={1} max={2} step={0.05} value={coverScale} onChange={(e) => setCoverScale(Number(e.target.value))} className="w-full" /></Field>
        </div>}

        <Field label="Pre-club material">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-8 text-center">
            <UploadCloud className="h-7 w-7 text-muted-foreground" />
            <div className="mt-2 text-sm font-medium text-foreground">{materialName || "Choose a PDF"}</div>
            <div className="mt-1 text-xs text-muted-foreground">Shared with students before the event · PDF up to 20 MB</div>
            <input
              ref={materialInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const issue = validateClubFile(file, "material");
                if (issue) setFormError(issue);
                else { setMaterialFile(file); setMaterialName(file.name); setFormError(""); }
                e.target.value = "";
              }}
            />
            <GhostButton
              type="button"
              className="mt-3"
              onClick={() => {
                if (material || materialFile) {
                  setMaterial("");
                  setMaterialFile(null);
                  setMaterialName("");
                } else {
                  materialInputRef.current?.click();
                }
              }}
            >
              {material || materialFile ? "Remove file" : "Choose file"}
            </GhostButton>
          </div>
        </Field>

        <ClubSectionBanner color="#d97706" textColor="#ffffff" icon={Calendar} title="Schedule, Capacity & Payment" />

        <Field label="Assigned teacher" help="Optional — assigning a teacher marks this event as “Assigned”.">
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={`${fieldCls} pl-9`}>
              <option value="">— Unassigned —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Session link">
          <div className="relative">
            <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://teams.microsoft.com/..." className={`${fieldCls} pl-9`} />
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Field label="Date & time">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className={`${fieldCls} pl-9`} required />
              </div>
            </Field>
          </div>
          <Field label="Duration (min)">
            <input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 60)} className={fieldCls} />
          </Field>
        </div>

        <div className="max-w-[160px]">
          <Field label="Capacity">
            <input type="number" min={1} value={spotsTotal} onChange={(e) => setSpotsTotal(parseInt(e.target.value) || 1)} className={fieldCls} />
          </Field>
        </div>

        <Field label="Teacher Payment (MXN)" help="Optional — how much the teacher earns for delivering this club. Used as the default penalty when an admin approves a release request.">
          <input
            type="number"
            min={0}
            step="0.01"
            value={teacherPayment}
            onChange={(e) => setTeacherPayment(e.target.value)}
            placeholder="e.g. 350"
            className={fieldCls}
          />
        </Field>
      </form>

      {formError && <p role="alert" className="px-6 text-sm text-red-700">{formError}</p>}
      <AccentModalFooter>
        <GhostButton onClick={onClose} type="button" disabled={busy}>Cancel</GhostButton>
        <GhostButton type="button" onClick={() => { const issue = validate(); if (issue) setFormError(issue); else { setFormError(""); setShowPreview(true); } }} disabled={busy}>Preview student modal</GhostButton>
        <PrimaryButton accentColor="#5fca16" className="hover:!bg-[#4fb010]" onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Publish event"}
        </PrimaryButton>
      </AccentModalFooter>
      {showPreview && <ClubReservationModal club={{ ...formData(coverObjectUrl || cover, materialObjectUrl || material), id: initial?.id ?? "preview", spots_taken: initial?.spots_taken ?? 0, status: initial?.status ?? "upcoming" }} studentId="" preview onClose={() => setShowPreview(false)} />}
    </AccentModal>
  );
}

function ClubSectionBanner({
  color, textColor, icon: Icon, title, className = "",
}: { color: string; textColor: string; icon: LucideIcon; title: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${className}`} style={{ background: color }}>
      <Icon className="h-3.5 w-3.5" style={{ color: textColor }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: textColor }}>{title}</span>
    </div>
  );
}

const fieldCls = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground">{label}</label>
      {help && <p className="mt-0.5 text-[11px] text-muted-foreground">{help}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Release Requests — Admin side of the "Request Release" flow
// ---------------------------------------------------------------------------


function ReleaseRequestsPanel({ requests, clubs }: { requests: ClubReleaseRequest[]; clubs: Club[] }) {
  const [approving, setApproving] = useState<ClubReleaseRequest | null>(null);

  const rows = useMemo(() => requests.map((r) => {
    const club = clubs.find((c) => c.id === r.club_id);
    const teacher = USERS.find((u) => u.id === r.teacher_id);
    return { r, club, teacher };
  }), [requests, clubs]);

  const urgent = requests.length > 0;

  return (
    <Card className={`!p-0 ${urgent ? "card-gradient-crimson verbo-focus-pulse [--verbo-focus-pulse-color:#b52904] !border-transparent" : ""}`}>
      <div className={`flex items-center justify-between px-6 py-4 ${urgent ? "" : "border-b border-border"}`}>
        <SectionTitle>
          <span className={`inline-flex items-center gap-2 ${urgent ? "text-white" : ""}`}>
            <Inbox className="h-4 w-4" /> Release Requests
            <span className={`ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${urgent ? "bg-white text-[#b52904]" : "bg-warning/20 text-warning-foreground"}`}>
              {requests.length}
            </span>
          </span>
        </SectionTitle>
      </div>
      {rows.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-muted-foreground">No pending release requests.</div>
      ) : (
        <div className="mx-4 mb-4 overflow-hidden rounded-xl bg-white/95">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-6 py-3 font-medium">Teacher</th>
              <th className="px-6 py-3 font-medium">Club</th>
              <th className="px-6 py-3 font-medium">Reason</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, club, teacher }) => (
              <tr key={r.id} className="border-b border-border last:border-0 align-top">
                <td className="px-6 py-4 text-foreground">{teacher?.name ?? "—"}</td>
                <td className="px-6 py-4">
                  {club ? (
                    <>
                      <div className="font-medium text-foreground">
                        <span className={`mr-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${club.type === "insight" ? "bg-[#f38934]" : "bg-[#01304a]"}`}>
                          {club.type === "insight" ? <Sparkles className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
                          {club.type === "insight" ? "Insight" : "Book Club"}
                        </span>
                        {club.title}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(club.date)}</div>
                    </>
                  ) : <span className="italic text-muted-foreground">Club deleted</span>}
                </td>
                <td className="px-6 py-4 text-muted-foreground">{r.reason || <span className="italic">No reason provided</span>}</td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    <GhostButton onClick={() => removeReleaseRequest(r.id)}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </GhostButton>
                    <PrimaryButton accentColor="#5fca16" onClick={() => setApproving(r)}>
                      <Check className="h-3.5 w-3.5" /> Approve
                    </PrimaryButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}


      {approving && (
        <ApproveReleaseModal
          request={approving}
          club={clubs.find((c) => c.id === approving.club_id) ?? null}
          onClose={() => setApproving(null)}
          onConfirm={async (amount) => {
            if (await approveClubRelease(approving.id, amount)) {
              notifySuccess("Release approved.");
              setApproving(null);
            }
          }}
        />
      )}
    </Card>
  );
}

function ApproveReleaseModal({
  request, club, onClose, onConfirm,
}: {
  request: ClubReleaseRequest;
  club: Club | null;
  onClose: () => void;
  onConfirm: (amount: number) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState<string>(
    club?.teacher_payment != null ? String(club.teacher_payment) : "",
  );
  const valid = amount.trim() !== "" && !isNaN(parseFloat(amount)) && parseFloat(amount) >= 0;

  return (
    <AccentModal
      background="linear-gradient(150deg, #c2410c 0%, #b52904 55%, #760137 100%)"
      iconTint="#b52904"
      icon={AlertTriangle}
      eyebrow="Release Request"
      title="Approve release"
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-5">
        <p className="text-xs text-muted-foreground">
          The club will return to “Created” and a negative adjustment will be recorded in the teacher’s Financial tab.
        </p>
        {club && (
          <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{club.title}</div>
            <div>{club.type === "insight" ? "Insight" : "Book Club"} · {formatDate(club.date)}</div>
          </div>
        )}
        <Field label="Penalty amount (MXN)" help={club?.teacher_payment == null ? "This club has no Teacher Payment configured — enter the amount manually." : "Pre-filled from the club’s Teacher Payment. Adjust if needed."}>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 350"
            className={fieldCls}
            autoFocus
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-secondary/30 px-6 py-4">
        <GhostButton onClick={onClose} disabled={saving}>Cancel</GhostButton>
        <PrimaryButton accentColor="#5fca16" disabled={!valid || saving} onClick={async () => {
          if (saving) return;
          setSaving(true);
          try { await onConfirm(parseFloat(amount)); } finally { setSaving(false); }
        }}>
          {saving ? "Saving…" : "Confirm approval"}
        </PrimaryButton>
      </div>
    </AccentModal>
  );

}
