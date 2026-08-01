import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccentModal, AccentModalFooter, Card, GhostButton, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import type { LucideIcon } from "lucide-react";
import { USERS } from "@/lib/mock-data";
import { appendTeacherAdjustment } from "@/lib/teacher-tiers";
import {
  type Club, type ClubType, type TimeStatus, type ClubReleaseRequest,
  assignmentOf, clubTeacherName as teacherName,
  loadClubs, persistClubs, subscribeClubs, updateClub, releaseClub,
  loadReleaseRequests, subscribeReleaseRequests, removeReleaseRequest,
} from "@/lib/clubs-store";
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

type ViewMode = "list" | "calendar" | "history";

function Page() {
  const { new: openNew } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [clubs, setClubs] = useState<Club[]>(() => loadClubs());
  const [requests, setRequests] = useState<ClubReleaseRequest[]>(() => loadReleaseRequests());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Club | null>(null);
  const [view, setView] = useState<ViewMode>("list");

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
    const next = loadClubs().filter((c) => c.id !== id);
    persistClubs(next);
  };

  const onSave = (data: Omit<Club, "id" | "spots_taken" | "status">) => {
    const current = loadClubs();
    const next = editing
      ? current.map((c) => (c.id === editing.id ? { ...c, ...data } : c))
      : [
          {
            id: `c${Date.now()}`,
            spots_taken: 0,
            status: "upcoming" as TimeStatus,
            created_at: new Date().toISOString(),
            ...data,
          },
          ...current,
        ];
    persistClubs(next);
    setOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Manage Clubs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and curate Verbo Insights and Book Clubs that appear on the student calendar.</p>
        </div>
        <PrimaryButton accentColor="#5fca16" onClick={onCreate}>
          <Plus className="h-4 w-4" /> Create New Club Event
        </PrimaryButton>
      </div>
      <ReleaseRequestsPanel requests={requests} clubs={clubs} />

      {/* View switcher */}
      <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1">
        {([
          { id: "list", label: "List View", icon: List },
          { id: "calendar", label: "Calendar View", icon: CalendarDays },
          { id: "history", label: "Topic History", icon: History },
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


      {open && <ClubFormPanel initial={editing} clubs={clubs} onClose={() => setOpen(false)} onSave={onSave} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view (existing table + Assignment column)
// ---------------------------------------------------------------------------
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
function ClubFormPanel({
  initial,
  clubs,
  onClose,
  onSave,
}: {
  initial: Club | null;
  clubs: Club[];
  onClose: () => void;
  onSave: (data: Omit<Club, "id" | "spots_taken" | "status">) => void;
}) {
  const [type, setType] = useState<ClubType>(initial?.type ?? "insight");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [material, setMaterial] = useState(initial?.material ?? "");
  const [materialName, setMaterialName] = useState(initial?.material ?? "");
  const [cover, setCover] = useState(initial?.cover_image ?? "");
  const [teacherId, setTeacherId] = useState(initial?.teacher_id ?? "");
  const [date, setDate] = useState(initial?.date?.slice(0, 16) ?? "");
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60);
  const [spotsTotal, setSpotsTotal] = useState(initial?.spots_total ?? (type === "book" ? 4 : 30));
  const coverInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const [teacherPayment, setTeacherPayment] = useState<string>(
    initial?.teacher_payment != null ? String(initial.teacher_payment) : "",
  );

  const teachers = useMemo(() => USERS.filter((u) => u.role === "teacher"), []);

  // Similar-topic detection against same-type history (exclude the item being edited).
  const similarMatch = useMemo(() => {
    if (!title.trim()) return null;
    return clubs.find((c) => c.id !== initial?.id && c.type === type && similarTitle(c.title, title)) ?? null;
  }, [title, type, clubs, initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;
    onSave({
      type, title, description, link,
      material: material || undefined,
      cover_image: cover || undefined,
      teacher_id: teacherId || undefined,
      date: new Date(date).toISOString(),
      duration_minutes: duration,
      spots_total: spotsTotal,
      teacher_payment: teacherPayment.trim() === "" ? undefined : Math.max(0, parseFloat(teacherPayment) || 0),
    });
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
      onClose={onClose}
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
                onClick={() => setType(t)}
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

        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What students will learn or discuss." className={`${fieldCls} resize-none`} />
        </Field>

        <ClubSectionBanner color="#3ebbad" textColor="#0b2b28" icon={ImageIcon} title="Media & Materials" />

        <Field label="Cover image" help="Cover image students will see on their calendar.">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-8 text-center">
            <ImageIcon className="h-7 w-7 text-muted-foreground" />
            {cover ? (
              <img src={cover} alt="Cover preview" className="mb-2 h-32 w-full max-w-xs rounded-lg object-cover" />
            ) : (
              <div className="mt-2 text-sm font-medium text-foreground">Drag & drop or choose an image</div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">JPG or PNG shown on the student calendar</div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setCover(String(reader.result));
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <GhostButton
              type="button"
              className="mt-3"
              onClick={() => {
                if (cover) setCover("");
                else coverInputRef.current?.click();
              }}
            >
              {cover ? "Remove image" : "Choose file"}
            </GhostButton>
          </div>
        </Field>

        <Field label="Pre-club material">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30 p-8 text-center">
            <UploadCloud className="h-7 w-7 text-muted-foreground" />
            <div className="mt-2 text-sm font-medium text-foreground">{materialName || "Drop a PDF or image"}</div>
            <div className="mt-1 text-xs text-muted-foreground">Shared with students before the event</div>
            <input
              ref={materialInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  setMaterial(String(reader.result));
                  setMaterialName(file.name);
                };
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <GhostButton
              type="button"
              className="mt-3"
              onClick={() => {
                if (material) {
                  setMaterial("");
                  setMaterialName("");
                } else {
                  materialInputRef.current?.click();
                }
              }}
            >
              {material ? "Remove file" : "Choose file"}
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

      <AccentModalFooter>
        <GhostButton onClick={onClose} type="button">Cancel</GhostButton>
        <PrimaryButton accentColor="#5fca16" className="hover:!bg-[#4fb010]" onClick={submit as unknown as () => void}>
          {initial ? "Save changes" : "Publish event"}
        </PrimaryButton>
      </AccentModalFooter>
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
          onConfirm={(amount) => {
            const club = clubs.find((c) => c.id === approving.club_id);
            if (club) {
              const label = club.type === "insight" ? "Insight" : "Book Club";
              const dateStr = new Date(club.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              appendTeacherAdjustment(
                approving.teacher_id,
                -Math.abs(amount),
                `Club release penalty — ${label}: ${club.title} on ${dateStr}`,
              );
              releaseClub(club.id);
            }
            removeReleaseRequest(approving.id);
            setApproving(null);
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
  onConfirm: (amount: number) => void;
}) {
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
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton accentColor="#5fca16" disabled={!valid} onClick={() => onConfirm(parseFloat(amount))}>
          Confirm approval
        </PrimaryButton>
      </div>
    </AccentModal>
  );

}
