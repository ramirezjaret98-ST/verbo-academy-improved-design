import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { USERS, ASSIGNMENTS, SESSIONS, userById, type User, type Session } from "@/lib/mock-data";
import { getProduct } from "@/lib/student-model";
import {
  QUALIFIED_PRODUCTS, DEFAULT_HOURLY_RATE, AVAILABILITY_CHANGE_DAYS,
  teacherStatus, qualifiedProducts, assignedStudents, activeStudents,
  teachersForProduct, avgRating, flaggedReviews, pendingReviews,
  PAYMENT_FREQUENCIES, paymentFrequency, defaultPaymentRecords, financialSummary,
  patchTeacherProfile, hydrateTeachers,
  type QualifiedProduct, type TeacherStatus, type PaymentFrequency,
} from "@/lib/teacher-model";
import { effectiveHourlyRate, teacherTier } from "@/lib/teacher-tiers";
import { computeTeacherKpis } from "@/lib/teacher-kpis";
import { BonusBadge } from "@/components/verbo/BonusBadge";
import { useAvatar } from "@/lib/avatar-store";
import {
  activeStrikeCount, recentStrikes, justifyStrike, subscribeStrikes,
  CANCEL_REASON_LABEL, JUSTIFICATION_LABEL, type JustificationCause, type Strike,
} from "@/lib/strikes-store";
import {
  listChangeRequests, approveChangeRequest, rejectChangeRequest,
  getAvailability, subscribeAvailability,
  DAY_KEYS, DAY_LABELS, minutesToTime,
  type AvailabilityChangeRequest, type Weekly,
} from "@/lib/availability-store";
import {
  Plus, X, Eye, EyeOff, Star, Users, Clock, KeyRound, Snowflake, Ban, Play,
  Pencil, Search, Filter, ArrowUpDown, Check, AlertTriangle, Mail, ShieldAlert,
  CheckCircle2, CalendarClock, ChevronRight, UserX, Wallet, FileDown, CircleDollarSign, Trophy,
  ShieldCheck, Zap, Briefcase, Undo2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HeroStatCard, Pill, AccentModal, AccentModalFooter, GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import { getAdminType } from "@/lib/admin-roles";
import { KpiOverrideModal } from "@/components/verbo/KpiOverrideModal";
import type { KpiMetric } from "@/lib/teacher-kpi-overrides-store";

export const Route = createFileRoute("/admin/teachers")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): { teacher?: string } => ({
    teacher: typeof s.teacher === "string" ? s.teacher : undefined,
  }),
});

// ---------------------------------------------------------------------------
// Persistence (localStorage — swap for Lovable Cloud later)
// ---------------------------------------------------------------------------
const PROFILE_KEY = "verbo:teacher-profile-overrides";
const REGISTERED_KEY = "verbo:registered-teachers";
const REVIEW_KEY = "verbo:session-review-overrides";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function write(key: string, val: unknown) {
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(val));
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const STATUS_META: Record<TeacherStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-success/10 text-success" },
  frozen: { label: "Frozen", cls: "bg-blue-500/10 text-blue-600" },
  removed: { label: "Removed", cls: "bg-muted text-muted-foreground" },
};

// ===========================================================================
// PAGE
// ===========================================================================
function Page() {
  const { user } = useAuth();
  const adminType = getAdminType(user);
  const canDiscard = adminType === "super_admin" || adminType === "coordinator_ops";
  const { teacher: focusTeacher } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [, forceTick] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<User | "new" | null>(null);

  useEffect(() => {
    const overrides = read<Record<string, Partial<User>>>(PROFILE_KEY, {});
    USERS.forEach((u) => { if (overrides[u.id]) Object.assign(u, overrides[u.id]); });
    read<User[]>(REGISTERED_KEY, []).forEach((u) => {
      if (!USERS.find((x) => x.id === u.id)) USERS.push(u);
    });
    const reviews = read<Record<string, Partial<Session>>>(REVIEW_KEY, {});
    SESSIONS.forEach((s) => { if (reviews[s.id]) Object.assign(s, reviews[s.id]); });
    hydrateTeachers();
    forceTick((n) => n + 1);
    const unsub = subscribeStrikes(() => forceTick((n) => n + 1));
    return () => unsub();
  }, []);

  // Deep-link from the Admin Overview snapshot (open a teacher profile).
  useEffect(() => {
    if (focusTeacher) {
      setDetailId(focusTeacher);
      navigate({ search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTeacher]);

  const teachers = USERS.filter((u) => u.role === "teacher");
  const detail = detailId ? teachers.find((t) => t.id === detailId) ?? null : null;

  // Filters
  const [q, setQ] = useState("");
  const [fProduct, setFProduct] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "">("");

  const filtered = useMemo(() => {
    let list = [...teachers];
    if (q.trim()) { const s = q.trim().toLowerCase(); list = list.filter((t) => t.name.toLowerCase().includes(s) || t.email.toLowerCase().includes(s)); }
    if (fProduct) list = list.filter((t) => qualifiedProducts(t).includes(fProduct as QualifiedProduct));
    if (fStatus) list = list.filter((t) => teacherStatus(t) === fStatus);
    if (sortBy === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "name-desc") list.sort((a, b) => b.name.localeCompare(a.name));
    return list;
  }, [teachers, q, fProduct, fStatus, sortBy]);

  // Mutations
  const persist = (updated: User) => {
    const idx = USERS.findIndex((u) => u.id === updated.id);
    if (idx >= 0) USERS[idx] = updated; else USERS.push(updated);
    const reg = read<User[]>(REGISTERED_KEY, []);
    const ri = reg.findIndex((u) => u.id === updated.id);
    if (ri >= 0) { reg[ri] = updated; write(REGISTERED_KEY, reg); }
    const { id, role, ...rest } = updated;
    patchTeacherProfile(updated.id, rest as Partial<User>);
    forceTick((n) => n + 1);
  };

  const reassignStudent = (studentId: string, teacherId: string) => {
    const existing = ASSIGNMENTS.find((a) => a.student_id === studentId);
    if (teacherId) {
      if (existing) existing.teacher_id = teacherId;
      else ASSIGNMENTS.push({ teacher_id: teacherId, student_id: studentId });
    } else if (existing) {
      ASSIGNMENTS.splice(ASSIGNMENTS.indexOf(existing), 1);
    }
    forceTick((n) => n + 1);
  };

  const markReviewed = (sessionId: string, note: string) => {
    const s = SESSIONS.find((x) => x.id === sessionId);
    if (s) { s.review_status = "reviewed"; s.review_note = note; }
    const reviews = read<Record<string, Partial<Session>>>(REVIEW_KEY, {});
    reviews[sessionId] = { review_status: "reviewed", review_note: note };
    write(REVIEW_KEY, reviews);
    forceTick((n) => n + 1);
  };

  const discardReview = (sessionId: string, note: string) => {
    const s = SESSIONS.find((x) => x.id === sessionId);
    if (s) { s.review_status = "discarded"; s.review_note = note; }
    const reviews = read<Record<string, Partial<Session>>>(REVIEW_KEY, {});
    reviews[sessionId] = { review_status: "discarded", review_note: note };
    write(REVIEW_KEY, reviews);
    forceTick((n) => n + 1);
  };

  const registerTeacher = (u: User, studentIds: string[]) => {
    USERS.push(u);
    studentIds.forEach((sid) => reassignStudent(sid, u.id));
    const reg = read<User[]>(REGISTERED_KEY, []);
    reg.push(u); write(REGISTERED_KEY, reg);
    setFormFor(null);
    forceTick((n) => n + 1);
  };

  const updateTeacher = (u: User) => {
    persist(u);
    setFormFor(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Teachers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Register, monitor and manage the teaching roster.</p>
        </div>
        <button
          onClick={() => setFormFor("new")}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Register teacher
        </button>
      </div>

      <AvailabilityChangeRequestsSection />

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search by teacher name…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Alphabetical order</option>
              <option value="name-asc">Name: A → Z</option>
              <option value="name-desc">Name: Z → A</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative">
            <select value={fProduct} onChange={(e) => setFProduct(e.target.value)} className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">All products</option>
              {QUALIFIED_PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Filter className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative">
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
              <option value="removed">Removed</option>
            </select>
            <Filter className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          {(q || sortBy || fProduct || fStatus) && (
            <button onClick={() => { setQ(""); setSortBy(""); setFProduct(""); setFStatus(""); }} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">Showing {filtered.length} of {teachers.length} teachers</div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t, i) => <TeacherCard key={t.id} teacher={t} index={i} onOpen={() => setDetailId(t.id)} />)}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
          <Search className="mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-foreground">No teachers found</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters or search query.</p>
        </div>
      )}

      {detail && (
        <TeacherDetailModal
          teacher={detail}
          teachers={teachers}
          onClose={() => setDetailId(null)}
          onPersist={persist}
          onReassign={reassignStudent}
          onMarkReviewed={markReviewed}
          onDiscardReview={discardReview}
          canDiscard={canDiscard}
          onEdit={() => { const t = detail; setDetailId(null); setFormFor(t); }}
        />
      )}

      {formFor && (
        <TeacherFormModal
          initial={formFor === "new" ? null : formFor}
          onClose={() => setFormFor(null)}
          onSave={formFor === "new" ? registerTeacher : (u) => updateTeacher(u)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// TEACHER CARD
// ===========================================================================
function TeacherCard({ teacher: t, index = 0, onOpen }: { teacher: User; index?: number; onOpen: () => void }) {
  const avatar = useAvatar(t.id);
  const status = teacherStatus(t);
  const products = qualifiedProducts(t);
  const rating = avgRating(t);
  const pending = pendingReviews(t.id).length;
  const active = activeStudents(t.id).length;
  const meta = STATUS_META[status];
  const dim = status === "removed";
  const glow = pending > 0 && status !== "removed";
  const strikes = activeStrikeCount(t.id);
  const frozenByStrikes = strikes >= 3;

  return (
    <button
      onClick={onOpen}
      data-status={status}
      data-review={glow ? "true" : undefined}
      title={glow ? `Needs review (${pending})` : undefined}
      style={{ "--verbo-card-i": index } as React.CSSProperties}
      className={`verbo-teacher-card group relative flex flex-col overflow-hidden rounded-[22px] border border-border/80 bg-card p-5 pl-6 text-left ${glow ? "verbo-review-glow" : ""} ${dim ? "verbo-teacher-card--off" : ""}`}

    >
      <span className="verbo-teacher-card__rail" aria-hidden />

      {/* Identity */}
      <div className="flex items-start gap-3.5">
        <div className="verbo-teacher-card__avatar relative shrink-0">
          {avatar ? (
            <img src={avatar} alt={t.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-[var(--st)]/25" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground ring-2 ring-[var(--st)]/25">{initials(t.name)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold tracking-tight text-foreground">{t.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{t.email}</div>
            </div>
            <span className="verbo-teacher-card__status shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              {meta.label}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {products.map((p) => <Tag key={p} className="bg-primary/10 text-primary">{getProduct(p)?.name ?? p}</Tag>)}
            {products.length === 0 && <span className="text-[11px] text-muted-foreground">No products qualified</span>}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-4 grid grid-cols-4 divide-x divide-border/70 rounded-xl border border-border/70 bg-background/60 py-2.5">
        <Metric value={rating != null ? rating.toFixed(1) : "—"} label="Rating" accent={<Star className="h-3 w-3 fill-current text-amber-500" />} />
        <Metric value={`${t.plan_punctuality ?? 0}%`} label="Planning" />
        <Metric value={String(active)} label="Students" />
        <Metric value={`${t.hours_month ?? 0}h`} label="This month" />
      </div>

      {/* Strikes */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">Strikes · 6 mo</span>
        <div className="flex flex-1 gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < Math.min(3, strikes)
                  ? strikes >= 3 ? "bg-destructive" : "bg-amber-500"
                  : "bg-border"
              }`}
            />
          ))}
        </div>
        <span className={`text-[11px] font-semibold tabular-nums ${strikes >= 3 ? "text-destructive" : strikes >= 1 ? "text-amber-600" : "text-muted-foreground"}`}>
          {Math.min(3, strikes)}/3
        </span>
      </div>

      {frozenByStrikes && (
        <div className="relative z-20 mt-3.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-semibold leading-snug text-destructive">
          Frozen — 3 unjustified strikes. Urgent substitute needed for this teacher's groups.
        </div>
      )}

      {/* Needs review is communicated by the pulsing red glow on the card itself */}


      {/* Frozen: the whole card reads as encased in ice */}
      {status === "frozen" && (
        <>
          <span className="verbo-ice" aria-hidden />
          <span className="verbo-ice__label" aria-hidden>Frozen</span>
        </>
      )}
    </button>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-1">
      <div className="flex items-center gap-1">
        {accent}
        <span className="text-[15px] font-semibold tabular-nums leading-none text-foreground">{value}</span>
      </div>
      <span className="truncate text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground/85">{label}</span>
    </div>
  );
}


function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>{children}</span>;
}

// ===========================================================================
// DETAIL MODAL
// ===========================================================================
type Tab = "overview" | "kpis" | "availability" | "financial" | "notes";

function TeacherDetailModal({
  teacher: t, teachers, onClose, onPersist, onReassign, onMarkReviewed, onDiscardReview, canDiscard, onEdit,
}: {
  teacher: User;
  teachers: User[];
  onClose: () => void;
  onPersist: (u: User) => void;
  onReassign: (studentId: string, teacherId: string) => void;
  onMarkReviewed: (sessionId: string, note: string) => void;
  onDiscardReview: (sessionId: string, note: string) => void;
  canDiscard: boolean;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const avatar = useAvatar(t.id);
  const status = teacherStatus(t);
  const meta = STATUS_META[status];

  // Editable fields
  const [rate, setRate] = useState(String(effectiveHourlyRate(t)));
  const [freq, setFreq] = useState<PaymentFrequency>(paymentFrequency(t));
  const [products, setProducts] = useState<QualifiedProduct[]>(qualifiedProducts(t));
  const [notes, setNotes] = useState(t.admin_notes ?? "");
  const [addAdjOpen, setAddAdjOpen] = useState(false);

  // KPI manual override (super_admin / coordinator_ops only)
  const { user: adminUser } = useAuth();
  const adminType = getAdminType(adminUser);
  const canOverride = adminType === "super_admin" || adminType === "coordinator_ops";
  const admin = adminUser
    ? { id: adminUser.id, name: adminUser.name, admin_type: adminType }
    : { id: "", name: "", admin_type: null };
  const [overrideTarget, setOverrideTarget] = useState<{ metric: KpiMetric; currentValue: number } | null>(null);
  const [, forceTick] = useState(0);


  // Guided freeze / remove flow
  const [flow, setFlow] = useState<null | "frozen" | "removed">(null);
  const [reassignMap, setReassignMap] = useState<Record<string, string>>({});

  // Inline reassign (from student list)
  const [reassignFor, setReassignFor] = useState<string | null>(null);

  const assigned = assignedStudents(t.id);
  const actives = activeStudents(t.id);
  const flagged = flaggedReviews(t.id);
  const pending = pendingReviews(t.id).length;

  const productsDirty = JSON.stringify([...products].sort()) !== JSON.stringify([...qualifiedProducts(t)].sort());
  const otherTeachers = teachers.filter((x) => x.id !== t.id && teacherStatus(x) !== "removed");

  const applyStatusPatch = (base: User, target: "active" | "frozen" | "removed"): User => {
    const current = teacherStatus(base);
    let patch: User = { ...base, teacher_status: target };
    if (current === "frozen" && target !== "frozen" && base.tier_frozen_since) {
      const since = new Date(base.tier_frozen_since);
      const days = isNaN(since.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - since.getTime()) / 86_400_000));
      patch = { ...patch, tier_frozen_since: null, tier_frozen_days: (base.tier_frozen_days ?? 0) + days };
    } else if (current !== "frozen" && target === "frozen") {
      patch = { ...patch, tier_frozen_since: new Date().toISOString() };
    }
    return patch;
  };

  const startFlow = (target: "frozen" | "removed") => {
    if (actives.length > 0) {
      setReassignMap(Object.fromEntries(actives.map((s) => [s.id, ""])));
      setFlow(target);
    } else {
      onPersist(applyStatusPatch(t, target));
    }
  };

  const flowReady = flow ? actives.every((s) => reassignMap[s.id]) : false;

  const confirmFlow = () => {
    if (!flow || !flowReady) return;
    actives.forEach((s) => onReassign(s.id, reassignMap[s.id]));
    onPersist(applyStatusPatch(t, flow));
    setFlow(null);
    onClose();
  };

  return (
    <Overlay onClose={onClose}>
      <div className="verbo-sdm relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-card shadow-floating">
        {/* Header */}
        <div className="shrink-0 px-6 pb-5 pt-6" style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              {avatar ? (
                <img src={avatar} alt={t.name} className="h-16 w-16 rounded-full object-cover ring-2 ring-white/25" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-base font-semibold text-white ring-2 ring-white/25">{initials(t.name)}</div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-white">{t.name}</h2>
                <p className="mt-0.5 truncate text-xs text-white/60">{t.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tag className={meta.cls}>{meta.label}</Tag>
              <button onClick={onClose} aria-label="Close" className="verbo-sdm-action rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Quick facts strip */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-4">
            {([
              ["Tier", teacherTier(t).name],
              ["Rate", `$${effectiveHourlyRate(t)} /h`],
              ["Students", `${actives.length}/${assigned.length}`],
              ["Rating", avgRating(t) != null ? avgRating(t)!.toFixed(1) : "—"],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="bg-[#02405f] px-3 py-2.5">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/45">{k}</div>
                <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-white">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex gap-1 overflow-x-auto border-b border-border px-6 pt-3 verbo-scroll-hidden">
          {([["overview", "Overview"], ["kpis", "KPIs & Performance"], ["availability", "Availability"], ["financial", "Financial"], ["notes", "Admin Notes"]] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`verbo-sdm-tab relative whitespace-nowrap px-3 py-2 text-sm font-medium ${tab === id ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
              {id === "kpis" && pending > 0 && <span className="ml-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">{pending}</span>}
              {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 report-modal-scroll">
          {tab === "overview" && (
            <div className="space-y-7">
              {/* Compensation */}
              <TSection title="Compensation" hint="Applies to future payment records" index={0}>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">Hourly rate (MXN)</div>
                    <div className="flex items-center rounded-xl border border-input bg-background">
                      <span className="pl-3 text-sm text-muted-foreground">$</span>
                      <input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className="w-16 bg-transparent py-2 px-1 text-sm font-semibold tabular-nums text-foreground focus:outline-none" />
                      <span className="pr-3 text-xs text-muted-foreground">/h</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">Payment frequency</div>
                    <div className="relative">
                      <select value={freq} onChange={(e) => setFreq(e.target.value as PaymentFrequency)} className={`${selectCls} w-40 appearance-none pr-8`}>
                        {PAYMENT_FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                      <CalendarClock className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                  {(String(effectiveHourlyRate(t)) !== rate || paymentFrequency(t) !== freq) && (
                    <PrimaryBtn onClick={() => {
                      const patch: User = { ...t, hourly_rate: Number(rate) || teacherTier(t).rate, payment_frequency: freq };
                      if (paymentFrequency(t) !== freq) patch.payment_records = defaultPaymentRecords(freq);
                      onPersist(patch);
                    }}>Save</PrimaryBtn>
                  )}
                </div>
              </TSection>

              {/* Qualified products */}
              <TSection title="Qualified products" hint="Hard rule for assignments" index={1}>
                <div className="flex flex-wrap gap-2">
                  {QUALIFIED_PRODUCTS.map((p) => {
                    const on = products.includes(p.id);
                    return (
                      <button key={p.id} onClick={() => setProducts((prev) => on ? prev.filter((x) => x !== p.id) : [...prev, p.id])} className={`verbo-sdm-action rounded-full px-3.5 py-1.5 text-xs font-semibold ${on ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-transparent text-muted-foreground hover:text-foreground"}`}>
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                {productsDirty && <div className="mt-3"><PrimaryBtn onClick={() => onPersist({ ...t, qualified_products: products })} disabled={products.length === 0}>Save products</PrimaryBtn></div>}
              </TSection>

              {/* Assigned students */}
              <TSection title="Assigned students" hint={`${assigned.length} total · ${actives.length} active`} index={2}>
                {assigned.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No students assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {assigned.map((s) => {
                      const prod = getProduct(s.product);
                      const eligible = teachersForProduct(otherTeachers, s.product);
                      return (
                        <div key={s.id} className="verbo-sdm-row rounded-xl border border-border bg-background px-3.5 py-3 hover:border-primary/25">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
                              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{prod && <Tag className="bg-primary/10 text-primary">{prod.name}</Tag>}{(s.status ?? "active") === "suspended" && <Tag className="bg-muted text-muted-foreground">Suspended</Tag>}</div>
                            </div>
                            <button onClick={() => setReassignFor(reassignFor === s.id ? null : s.id)} className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0f766e] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm"><Users className="h-3.5 w-3.5" strokeWidth={1.75} /> Reassign</button>
                          </div>
                          {reassignFor === s.id && (
                            <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
                              <div className="flex-1">
                                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">New teacher (qualified for {prod?.name ?? "product"})</label>
                                <select id={`ra-${s.id}`} defaultValue="" className={selectCls}>
                                  <option value="" disabled>Select teacher…</option>
                                  {eligible.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
                                </select>
                                {eligible.length === 0 && <p className="mt-1 text-[10.5px] text-destructive">No other qualified teachers available.</p>}
                              </div>
                              <PrimaryBtn onClick={() => { const el = document.getElementById(`ra-${s.id}`) as HTMLSelectElement | null; if (el?.value) { onReassign(s.id, el.value); setReassignFor(null); } }}>Apply</PrimaryBtn>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TSection>
            </div>
          )}


          {tab === "kpis" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiHeroStat
                  label="Avg. rating"
                  value={avgRating(t) != null ? avgRating(t)!.toFixed(1) : "—"}
                  icon={Star}
                  color="#d97706"
                  onAdjust={canOverride ? () => setOverrideTarget({ metric: "ratingNormalized", currentValue: computeTeacherKpis(t).ratingNormalized }) : undefined}
                />
                <KpiHeroStat
                  label="Planning on time"
                  value={`${computeTeacherKpis(t).planningPunctuality}%`}
                  icon={CalendarClock}
                  color="#01304a"
                  onAdjust={canOverride ? () => setOverrideTarget({ metric: "planningPunctuality", currentValue: computeTeacherKpis(t).planningPunctuality }) : undefined}
                />
                <KpiHeroStat
                  label="Responsiveness"
                  value={`${computeTeacherKpis(t).responsiveness}%`}
                  icon={Zap}
                  color="#3ebbad"
                  onAdjust={canOverride ? () => setOverrideTarget({ metric: "responsiveness", currentValue: computeTeacherKpis(t).responsiveness }) : undefined}
                />
                <KpiHeroStat label="Hours this month" value={`${t.hours_month ?? 0}h`} icon={Clock} color="#a34ac0" />
              </div>

              <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">Full breakdown and history live in the global <span className="font-medium text-foreground">KPIs</span> page.</p>

              <StrikesSection teacherId={t.id} />

              <div>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Flagged reviews ({flagged.length})
                </div>
                {flagged.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No 1–3 star sessions on record.</p>
                ) : (
                  <div className="space-y-2">
                    {flagged.map((s) => <FlaggedRow key={s.id} session={s} onMarkReviewed={onMarkReviewed} onDiscardReview={onDiscardReview} canDiscard={canDiscard} />)}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "availability" && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Declared availability</div>
                {(t.availability && t.availability.length > 0) ? (
                  <div className="space-y-2">
                    {t.availability.map((a) => (
                      <div key={a.day} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
                        <span className="text-sm font-medium text-foreground">{a.day}</span>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {a.slots.map((sl) => <Tag key={sl} className="bg-secondary text-secondary-foreground">{sl}</Tag>)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No availability declared yet.</p>}
              </div>

              {t.availability_request ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarClock className="h-4 w-4 text-amber-600" /> Pending change request</div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t.availability_request.note}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Requested on {new Date(t.availability_request.requested_on).toLocaleDateString()}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => onPersist({ ...t, availability_request: null })} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-success-foreground transition-opacity hover:opacity-90"><Check className="h-3.5 w-3.5" /> Approve</button>
                    <GhostBtn onClick={() => onPersist({ ...t, availability_request: null })}><X className="h-3.5 w-3.5" /> Reject</GhostBtn>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">No pending change requests.</p>
              )}

              <p className="text-[11px] text-muted-foreground">ℹ Teachers can only request availability changes once every {AVAILABILITY_CHANGE_DAYS} days.</p>
            </div>
          )}

          {tab === "financial" && (
            <FinancialTab t={t} onPersist={onPersist} onAddAdjustment={() => setAddAdjOpen(true)} />
          )}



          {tab === "notes" && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><ShieldAlert className="h-3.5 w-3.5" /> Internal notes (admin only)</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7} placeholder="Context for other admins, escalations, performance follow-ups…" className={inputCls} />
              <div className="mt-3 flex justify-end"><PrimaryBtn onClick={() => onPersist({ ...t, admin_notes: notes })}>Save notes</PrimaryBtn></div>
            </div>
          )}
        </div>

        {/* Guided freeze/remove flow */}
        {flow && (
          <div className="border-t border-border bg-secondary/40 px-6 py-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              {flow === "frozen" ? <Snowflake className="h-4 w-4 text-blue-600" /> : <UserX className="h-4 w-4 text-destructive" />}
              Reassign {actives.length} active student{actives.length === 1 ? "" : "s"} before {flow === "frozen" ? "freezing" : "removing"}
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto report-modal-scroll">
              {actives.map((s) => {
                const prod = getProduct(s.product);
                const eligible = teachersForProduct(otherTeachers, s.product);
                return (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{s.name}</div>
                      <div className="text-[10.5px] text-muted-foreground">{prod?.name}</div>
                    </div>
                    <select value={reassignMap[s.id] ?? ""} onChange={(e) => setReassignMap((m) => ({ ...m, [s.id]: e.target.value }))} className={`${selectCls} max-w-[45%]`}>
                      <option value="" disabled>New teacher…</option>
                      {eligible.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <GhostBtn onClick={() => setFlow(null)}>Cancel</GhostBtn>
              <PrimaryBtn onClick={confirmFlow} disabled={!flowReady}>Confirm {flow === "frozen" ? "Freeze" : "Remove access"}</PrimaryBtn>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {!flow && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 border-t border-border bg-secondary/30 px-6 py-4">
            <GhostBtn onClick={onEdit}><Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit profile</GhostBtn>
            <GhostBtn onClick={() => { onPersist({ ...t, must_change_password: true }); alert("This user will be asked to set a new password the next time they log in."); }}><KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} /> Require Password Reset</GhostBtn>
            <span className="flex-1" />
            {status === "frozen" ? (
              <GhostBtn onClick={() => onPersist(applyStatusPatch(t, "active"))}><Play className="h-3.5 w-3.5" strokeWidth={1.75} /> Reactivate</GhostBtn>
            ) : status === "active" ? (
              <button onClick={() => startFlow("frozen")} className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-full bg-[#38bdf8] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm"><Snowflake className="h-3.5 w-3.5" strokeWidth={1.75} /> Freeze</button>
            ) : null}
            {status !== "removed" && (
              <button onClick={() => startFlow("removed")} className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-full bg-destructive px-3.5 py-1.5 text-xs font-semibold text-destructive-foreground shadow-sm">
                <Ban className="h-3.5 w-3.5" strokeWidth={1.75} /> Remove access
              </button>
            )}
          </div>

        )}
      </div>

      {addAdjOpen && (
        <AddAdjustmentModal
          onClose={() => setAddAdjOpen(false)}
          onSave={(amount, reason) => {
            const adj = { id: `adj-${Date.now()}`, date: new Date().toISOString(), amount, reason };
            onPersist({ ...t, adjustments: [...(t.adjustments ?? []), adj] });
            setAddAdjOpen(false);
          }}
        />
      )}

      {overrideTarget && (
        <KpiOverrideModal
          teacher={t}
          metric={overrideTarget.metric}
          currentValue={overrideTarget.currentValue}
          admin={admin}
          onClose={() => setOverrideTarget(null)}
          onSaved={() => { forceTick((n) => n + 1); setOverrideTarget(null); }}
        />
      )}
    </Overlay>
  );
}

// ===========================================================================
// FINANCIAL TAB
// ===========================================================================
function money(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cycleLabel(base = new Date()) {
  return base.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function FinancialTab({ t, onPersist, onAddAdjustment }: { t: User; onPersist: (u: User) => void; onAddAdjustment: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Payment record pending a "revert to pending" confirmation (only for Paid).
  const [revertId, setRevertId] = useState<string | null>(null);
  const [bonusAmount, setBonusAmount] = useState("");
  const kpis = computeTeacherKpis(t);
  const bonusEligible = kpis.bonusEligible;
  const summary = financialSummary(t);
  const records = t.payment_records && t.payment_records.length > 0
    ? t.payment_records
    : defaultPaymentRecords(paymentFrequency(t));
  const adjustments = t.adjustments ?? [];

  const addBonusAdjustment = () => {
    const amount = Number(bonusAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const adj = {
      id: `adj-${Date.now()}`,
      date: new Date().toISOString(),
      amount,
      reason: "KPI compliance bonus",
    };
    onPersist({ ...t, adjustments: [...(t.adjustments ?? []), adj] });
    setBonusAmount("");
  };

  const ensureRecords = () => {
    if (!t.payment_records || t.payment_records.length === 0) {
      onPersist({ ...t, payment_records: records });
    }
  };

  const updateRecord = (id: string, patch: Partial<{ date: string; status: "pending" | "paid" }>) => {
    const next = records.map((r) => (r.id === id ? { ...r, ...patch } : r));
    onPersist({ ...t, payment_records: next });
  };

  // Close a cycle: mark the next pending payment date as paid, reset worked
  // hours and clear manual adjustments to start a fresh cycle.
  const closeCycle = () => {
    const idx = records.findIndex((r) => r.status !== "paid");
    const nextRecords = idx >= 0
      ? records.map((r, i) => (i === idx ? { ...r, status: "paid" as const } : r))
      : records;
    onPersist({ ...t, payment_records: nextRecords, hours_cycle: 0, hours_month: 0, adjustments: [] });
  };

  const confirmGenerate = async () => {
    await generatePDF();
    closeCycle();
    setConfirmOpen(false);
  };


  const generatePDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    const period = cycleLabel();

    const NAVY: [number, number, number] = [1, 48, 74];
    const ORANGE: [number, number, number] = [243, 137, 52];
    const W = doc.internal.pageSize.getWidth();

    /* Header band with the Verbo brand mark */
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 34, "F");
    doc.setFillColor(...ORANGE);
    doc.rect(0, 34, W, 1.6, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("VERBO", 14, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(243, 137, 52);
    doc.text("LANGUAGE SOLUTIONS", 14, 22, { charSpace: 1.6 });

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Payroll Report", W - 14, 16, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(period, W - 14, 22, { align: "right" });

    /* Teacher details block */
    autoTable(doc, {
      startY: 44,
      body: [
        ["Teacher", t.name],
        ["Email", t.email],
        ["Cycle", period],
        ["Payment frequency", paymentFrequency(t)],
      ],
      theme: "plain",
      styles: { fontSize: 9.5, cellPadding: { top: 1.6, bottom: 1.6, left: 0, right: 4 } },
      columnStyles: {
        0: { fontStyle: "bold", textColor: NAVY, cellWidth: 42 },
        1: { textColor: [60, 60, 60] },
      },
    });

    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    const sectionTitle = (label: string, atY: number) => {
      doc.setFillColor(...NAVY);
      doc.rect(14, atY - 5, 3, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text(label, 20, atY);
    };

    /* Sessions & earnings breakdown */
    sectionTitle("Sessions & earnings", y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Concept", "Detail", "Amount (MXN)"]],
      body: [
        ["Hours worked (this cycle)", `${summary.hours} h`, "—"],
        ["Hourly rate", "per hour", money(summary.rate)],
        ["Subtotal", `${summary.hours} h × ${money(summary.rate)}`, money(summary.subtotal)],
      ],
      theme: "grid",
      styles: { fontSize: 9.5, cellPadding: 2.6, lineColor: [226, 232, 240] },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 249, 251] },
      columnStyles: { 2: { halign: "right" } },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

    /* Adjustments */
    sectionTitle("Adjustments", y);
    autoTable(doc, {
      startY: y + 4,
      head: [["Date", "Reason", "Amount (MXN)"]],
      body: adjustments.length
        ? adjustments.map((a) => [new Date(a.date).toLocaleDateString(), a.reason, money(a.amount)])
        : [["—", "No adjustments applied", "—"]],
      foot: [["", "Adjustments total", money(summary.adjustments)]],
      theme: "grid",
      styles: { fontSize: 9.5, cellPadding: 2.6, lineColor: [226, 232, 240] },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [237, 243, 247], textColor: NAVY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 249, 251] },
      columnStyles: { 0: { cellWidth: 28 }, 2: { halign: "right" } },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

    /* Total banner */
    doc.setFillColor(...NAVY);
    doc.roundedRect(14, y, W - 28, 16, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Total to pay", 20, y + 10.5);
    doc.setFontSize(13);
    doc.setTextColor(243, 137, 52);
    doc.text(`${money(summary.total)} MXN`, W - 20, y + 10.5, { align: "right" });

    /* Footer */
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 150, 160);
    doc.text(
      `Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · verbolanguagesolutions.com`,
      W / 2,
      doc.internal.pageSize.getHeight() - 12,
      { align: "center" },
    );

    doc.save(`payroll-${t.name.replace(/\s+/g, "-").toLowerCase()}-${period.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };


  return (
    <div className="space-y-6">
      {/* Bonus streak status — visible for every state so admins understand
          why (or why not) the bonus authorization banner is showing. */}
      <div className="flex justify-end">
        <BonusBadge status={kpis.bonusStatus} glow={bonusEligible} />
      </div>
      {/* Authorized bonus banner (only when KPIs mark the teacher as eligible) */}
      {bonusEligible && (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <Trophy className="h-4 w-4" /> 🎉 Bonus authorized based on this period's KPIs
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This teacher exceeded the Composite Score threshold. Enter the bonus amount and add it to the adjustments.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Bonus amount (MXN)</label>
              <div className="flex items-center rounded-lg border border-input bg-background">
                <span className="pl-3 text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min={0}
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="e.g. 1000"
                  className="w-28 bg-transparent px-2 py-2 text-sm text-foreground focus:outline-none"
                />
              </div>
            </div>
            <button
              onClick={addBonusAdjustment}
              disabled={!(Number(bonusAmount) > 0)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-2 text-xs font-semibold text-success-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add as Adjustment
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cycle summary · {cycleLabel()}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BigStat label="Hours worked (this cycle)" value={`${summary.hours} h`} />
          <BigStat label="Hourly rate" value={money(summary.rate)} />
          <BigStat label="Subtotal" value={money(summary.subtotal)} />
        </div>
      </div>

      {/* Payment dates */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> Payment dates ({paymentFrequency(t)})
        </div>
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
              <input
                type="date"
                value={r.date.slice(0, 10)}
                onChange={(e) => { ensureRecords(); updateRecord(r.id, { date: e.target.value }); }}
                className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span
                title="Status updates automatically when the PDF report is generated"
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${r.status === "paid" ? "bg-success/15 text-success" : "bg-amber-500/15 text-amber-600"}`}
              >
                <span className={`h-2 w-2 rounded-full ${r.status === "paid" ? "bg-success" : "bg-amber-500"}`} />
                {r.status === "paid" ? "Paid" : "Pending"}
              </span>
              {r.status === "paid" && (
                <GhostBtn onClick={() => setRevertId(r.id)}>
                  <Undo2 className="h-3.5 w-3.5" /> Revert to Pending
                </GhostBtn>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Adjustments */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5" /> Manual adjustments
          </div>
          <GhostBtn onClick={onAddAdjustment}><Plus className="h-3.5 w-3.5" /> Add adjustment</GhostBtn>
        </div>
        {adjustments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No adjustments applied.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(a.date).toLocaleDateString()}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${a.amount < 0 ? "text-destructive" : "text-success"}`}>{money(a.amount)}</td>
                    <td className="px-3 py-2 text-foreground">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="rounded-xl border border-border bg-secondary/30 p-5 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total to pay</div>
        <div className="mt-1 text-4xl font-bold tracking-tight text-foreground">{money(summary.total)}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">MXN · subtotal {money(summary.subtotal)} {summary.adjustments >= 0 ? "+" : "−"} {money(Math.abs(summary.adjustments))} adjustments</div>
      </div>

      <div className="flex justify-end">
        <PrimaryBtn onClick={() => setConfirmOpen(true)}><FileDown className="h-3.5 w-3.5" /> Generate PDF report</PrimaryBtn>
      </div>

      {revertId && (
        <Overlay onClose={() => setRevertId(null)}>
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Undo2 className="h-4 w-4 text-amber-600" /> Revert payment to Pending
            </div>
            <p className="text-sm text-muted-foreground">
              This payment date will go back to <strong>Pending</strong>. Use it when the PDF report was
              generated by mistake. Worked hours and adjustments already reset are not restored.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <GhostBtn onClick={() => setRevertId(null)}>Cancel</GhostBtn>
              <button
                onClick={() => { ensureRecords(); updateRecord(revertId, { status: "pending" }); setRevertId(null); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Revert to Pending
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {confirmOpen && (
        <Overlay onClose={() => setConfirmOpen(false)}>
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileDown className="h-4 w-4 text-accent" /> Generate PDF report
            </div>
            <p className="text-sm text-muted-foreground">
              By generating the report the status changes to paid and the total hours are reset. Do you wish to continue?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <GhostBtn onClick={() => setConfirmOpen(false)}>Cancel</GhostBtn>
              <button
                onClick={confirmGenerate}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Confirm
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ===========================================================================
// ADD ADJUSTMENT MODAL (stacked over teacher detail)
// ===========================================================================
function AddAdjustmentModal({ onClose, onSave }: { onClose: () => void; onSave: (amount: number, reason: string) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const num = Number(amount);
  const valid = amount.trim() !== "" && !Number.isNaN(num) && num !== 0 && reason.trim() !== "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
        <div className="flex items-start justify-between border-b border-border px-6 py-5" style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">Financial</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">Add adjustment</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <Field label="Amount (MXN)">
            <div className="flex items-center rounded-lg border border-input bg-background">
              <span className="pl-3 text-sm text-muted-foreground">$</span>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500 or -200" className="w-full bg-transparent px-2 py-2 text-sm text-foreground focus:outline-none" />
            </div>
            <p className="mt-1 text-[10.5px] text-muted-foreground">Use a positive number for bonuses, negative for deductions.</p>
          </Field>
          <Field label="Reason">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Reason for the adjustment…" className={inputCls} />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-6 py-4">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={() => onSave(num, reason.trim())} disabled={!valid}>Save</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

export function FlaggedRow({
  session: s, onMarkReviewed, onDiscardReview, canDiscard,
}: {
  session: Session;
  onMarkReviewed: (id: string, note: string) => void;
  onDiscardReview: (id: string, note: string) => void;
  canDiscard: boolean;
}) {
  const status = s.review_status ?? "pending";
  const reviewed = status === "reviewed";
  const discarded = status === "discarded";
  const resolved = reviewed || discarded;
  const [mode, setMode] = useState<null | "review" | "discard">(null);
  const [note, setNote] = useState("");
  const student = userById(s.student_id);

  const rowCls = resolved
    ? "border-border bg-background"
    : "border-destructive/30 bg-destructive/5";
  const tag = reviewed
    ? <Pill style={{ backgroundColor: "rgba(95,202,22,0.15)", color: "#3f7d0a" }}>Reviewed</Pill>
    : discarded
      ? <Pill tone="muted">Discarded</Pill>
      : <Pill tone="danger">Pending Review</Pill>;

  const submit = () => {
    if (!note.trim()) return;
    if (mode === "review") onMarkReviewed(s.id, note.trim());
    else if (mode === "discard") onDiscardReview(s.id, note.trim());
    setMode(null);
    setNote("");
  };

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${rowCls}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{student?.name ?? "—"}</span>
            <span className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`h-3.5 w-3.5 ${i < (s.student_rating ?? 0) ? "fill-current text-amber-500" : "text-muted-foreground/30"}`} />
              ))}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">{new Date(s.date_time).toLocaleDateString()}</div>
        </div>
        {tag}
      </div>
      {s.student_comment && <p className="mt-2 text-sm text-foreground">“{s.student_comment}”</p>}
      {resolved && s.review_note && (
        <p className="mt-2 rounded-md bg-muted px-2.5 py-1.5 text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{discarded ? "Discard reason:" : "Resolution:"}</span> {s.review_note}
        </p>
      )}
      {!resolved && (
        mode ? (
          <div className="mt-2 space-y-2 border-t border-border pt-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "discard" ? "Discard reason (required)…" : "Resolution note (required)…"}
              className={inputCls}
            />
            <div className="flex justify-end gap-2">
              <GhostBtn onClick={() => { setMode(null); setNote(""); }}>Cancel</GhostBtn>
              <PrimaryBtn onClick={submit} disabled={!note.trim()}>
                {mode === "discard" ? "Confirm discard" : "Confirm reviewed"}
              </PrimaryBtn>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex justify-end gap-2">
            {canDiscard && (
              <GhostBtn onClick={() => setMode("discard")}><X className="h-3.5 w-3.5" /> Discard</GhostBtn>
            )}
            <GhostBtn onClick={() => setMode("review")}><Check className="h-3.5 w-3.5" /> Mark as Reviewed</GhostBtn>
          </div>
        )
      )}
    </div>
  );
}

// ===========================================================================
// REGISTER / EDIT FORM MODAL
// ===========================================================================
function TeacherFormModal({
  initial, onClose, onSave,
}: {
  initial: User | null;
  onClose: () => void;
  onSave: (u: User, studentIds: string[]) => void;
}) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [showPw, setShowPw] = useState(false);
  const [rate, setRate] = useState(String(initial ? effectiveHourlyRate(initial) : 120));
  const [products, setProducts] = useState<QualifiedProduct[]>(qualifiedProducts(initial ?? ({} as User)));
  const [hireDate, setHireDate] = useState(
    initial?.hire_date ?? new Date().toISOString().slice(0, 10),
  );
  const [studentIds, setStudentIds] = useState<string[]>([]);

  // Students with no teacher assigned (available for initial assignment)
  const unassigned = useMemo(
    () => USERS.filter((u) => u.role === "student" && !ASSIGNMENTS.some((a) => a.student_id === u.id)),
    [],
  );

  const valid = name.trim() && email.trim() && password.trim() && products.length > 0 && !!hireDate;

  const handleSave = () => {
    if (!valid) return;
    const u: User = {
      ...(initial ?? {}),
      id: initial?.id ?? `t${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      password,
      role: "teacher",
      hourly_rate: Number(rate) || 120,
      qualified_products: products,
      hire_date: hireDate,
      teacher_status: initial?.teacher_status ?? "active",
      plan_punctuality: initial?.plan_punctuality ?? 100,
      report_punctuality: initial?.report_punctuality ?? 100,
      hours_month: initial?.hours_month ?? 0,
      availability: initial?.availability ?? [],
      availability_request: initial?.availability_request ?? null,
    };
    onSave(u, editing ? [] : studentIds);
  };

  return (
    <AccentModal
      background="linear-gradient(135deg, #01304a 0%, #02466b 100%)"
      iconTint="#01304a"
      icon={Briefcase}
      eyebrow={editing ? "Edit teacher" : "New registration"}
      title={editing ? name || "Teacher" : "Register Teacher"}
      watermark={{ type: "text", value: "TEACHER" }}
      maxWidth="max-w-xl"
      onClose={onClose}
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5 report-modal-scroll">
        <SectionBanner color="#01304a" icon={Users} title="Teacher Info" />
        <Field label="Full name" icon={<Users className="h-3.5 w-3.5" />}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Jane Doe" />
        </Field>
        <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="jane@verbo.com" />
        </Field>
        <Field label="Initial password" icon={<KeyRound className="h-3.5 w-3.5" />}>
          <div className="relative">
            <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-muted-foreground">The teacher will be required to change it on their first sign-in.</p>
        </Field>

        <SectionBanner color="#d97706" icon={Briefcase} title="Contract & Products" />
        <Field label="Hourly rate (MXN)">
          <div className="flex items-center rounded-lg border border-input bg-background">
            <span className="px-3 text-sm text-muted-foreground">$</span>
            <input type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className="w-32 bg-transparent py-2 pr-3 text-sm text-foreground focus:outline-none" />
            <span className="pr-3 text-xs text-muted-foreground">MXN/h</span>
          </div>
        </Field>
        <Field label="Hire date">
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            KPI tracking activates in week 2 of the hire month. The 6-month bonus streak counts from the first full calendar month after the hire month.
          </p>
        </Field>
        <Field label="Qualified products (at least one)">
          <div className="flex flex-wrap gap-2">
            {QUALIFIED_PRODUCTS.map((p) => {
              const on = products.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProducts((prev) => on ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                  style={on ? { background: "#01304a" } : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${on ? "text-white" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </Field>

        {!editing && (
          <Field label="Assign initial students (optional)">
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unassigned students available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unassigned.map((s) => {
                  const on = studentIds.includes(s.id);
                  const prod = getProduct(s.product);
                  const eligible = !s.product || products.includes(s.product as QualifiedProduct);
                  return (
                    <button
                      key={s.id} type="button" disabled={!eligible}
                      onClick={() => setStudentIds((prev) => on ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                      style={on ? { background: "#01304a" } : undefined}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "text-white" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`}
                      title={eligible ? "" : `Mark ${prod?.name} first to assign this student`}
                    >
                      {s.name}{prod ? ` · ${prod.name}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-[10.5px] text-muted-foreground">Only students whose product matches a qualified product can be assigned.</p>
          </Field>
        )}
      </div>

      <AccentModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton accentColor="#5fca16" className="hover:!bg-[#4fb010]" onClick={handleSave} disabled={!valid}>
          {editing ? "Save changes" : "Save"}
        </PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}

function SectionBanner({ color, icon: Icon, title }: { color: string; icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: color }}>
      <Icon className="h-3.5 w-3.5 text-white" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white">{title}</span>
    </div>
  );
}


// ===========================================================================
// Shared building blocks
// ===========================================================================
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl">{children}</div>
    </div>
  );
}

function TSection({ title, hint, index = 0, children }: { title: string; hint?: string; index?: number; children: React.ReactNode }) {
  return (
    <section className="verbo-sdm-section" style={{ animationDelay: `${index * 45}ms` }}>
      <div className="mb-3 flex items-baseline gap-3">
        <h3 className="text-[13px] font-bold tracking-tight text-foreground">{title}</h3>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {

  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
    </div>
  );
}

function KpiHeroStat({
  label, value, icon: Icon, color, onAdjust,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; strokeWidth?: number }>;
  color: string;
  onAdjust?: () => void;
}) {
  return (
    <HeroStatCard className="!min-h-[132px] !items-start border border-border bg-card" style={{ boxShadow: `0 0 24px -8px ${color}66` }}>
      <div className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl">
        <Icon className="h-7 w-7" style={{ color }} strokeWidth={1.75} />
      </div>
      <div className="relative w-full">
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          {onAdjust && (
            <button
              onClick={onAdjust}
              title="Manual KPI override"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-2 text-4xl font-bold leading-none text-foreground">{value}</div>
      </div>
    </HeroStatCard>
  );
}


function BigStat({ label, value, onAdjust }: { label: string; value: string; onAdjust?: () => void }) {
  return (
    <div className="relative rounded-xl border border-border bg-background p-4 text-center">
      {onAdjust && (
        <button
          onClick={onAdjust}
          title="Manual KPI override"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

// ===========================================================================
// STRIKES SECTION (KPIs tab)
// ===========================================================================
function StrikesSection({ teacherId }: { teacherId: string }) {
  const [, forceTick] = useState(0);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const list = recentStrikes(teacherId);
  const active = list.filter((s) => !s.justified).length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> Cancellations / No-Shows — {Math.min(3, active)}/3 Strikes (6 months)
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cancellations in the last 6 months.</p>
      ) : (
        <div className="space-y-2">
          {list.map((s: Strike) => (
            <div key={s.id} className={`rounded-lg border px-3 py-2.5 ${s.justified ? "border-border bg-background opacity-70" : "border-destructive/30 bg-destructive/5"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {CANCEL_REASON_LABEL[s.reason]}
                    {s.needs_substitute && !s.substitute_found && (
                      <span className="ml-2 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">Needs Substitute</span>
                    )}
                    {s.justified && s.justification_cause && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: "rgba(95,202,22,0.15)", color: "#3f7d0a" }}
                      >
                        <ShieldCheck className="h-3 w-3" /> {JUSTIFICATION_LABEL[s.justification_cause]}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                    {s.medical_note_name ? ` · Medical Note: ${s.medical_note_name}` : ""}
                    {s.note ? ` · ${s.note}` : ""}
                  </div>
                </div>
                {!s.justified && (
                  <div className="flex items-center gap-1.5">
                    {openFor === s.id ? (
                      <>
                        <select
                          id={`jc-${s.id}`}
                          defaultValue=""
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          <option value="" disabled>— Justify with —</option>
                          {(Object.keys(JUSTIFICATION_LABEL) as JustificationCause[]).map((c) => (
                            <option key={c} value={c}>{JUSTIFICATION_LABEL[c]}</option>
                          ))}
                        </select>
                        <PrimaryBtn onClick={() => {
                          const el = document.getElementById(`jc-${s.id}`) as HTMLSelectElement | null;
                          if (el?.value) {
                            justifyStrike(s.id, el.value as JustificationCause);
                            setOpenFor(null);
                            forceTick((n) => n + 1);
                          }
                        }}>Apply</PrimaryBtn>
                        <GhostBtn onClick={() => setOpenFor(null)}>Cancel</GhostBtn>
                      </>
                    ) : (
                      <GhostBtn onClick={() => setOpenFor(s.id)}>
                        <ShieldCheck className="h-3.5 w-3.5" /> Mark as Justified
                      </GhostBtn>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const selectCls = `${inputCls} cursor-pointer`;

function Field({ label, icon, children, className }: { label: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{icon}{label}</label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability Change Requests (pending queue) — collapsible sub-section.
// ---------------------------------------------------------------------------
function AvailabilityChangeRequestsSection() {
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => subscribeAvailability(() => tick((n) => n + 1)), []);
  const pending = listChangeRequests("pending");

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between px-5 py-3 text-left ${
          pending.length > 0 ? "rounded-2xl card-gradient-orange text-white" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <CalendarClock className={`h-4 w-4 ${pending.length > 0 ? "text-white" : "text-accent"}`} />
          <span className={`text-sm font-semibold ${pending.length > 0 ? "text-white" : "text-foreground"}`}>
            Availability Change Requests
          </span>
          {pending.length > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">
              {pending.length} pending
            </span>
          )}
        </div>
        <ChevronRight
          className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""} ${
            pending.length > 0 ? "text-white/70" : "text-muted-foreground"
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4">
          {pending.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No pending requests.</p>
          ) : (
            <div className="space-y-4">
              {pending.map((r) => <ChangeRequestRow key={r.id} req={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function summarizeWeekly(w: Weekly): string {
  const parts: string[] = [];
  for (const d of DAY_KEYS) {
    const blocks = w[d];
    if (!blocks || blocks.length === 0) continue;
    parts.push(`${DAY_LABELS[d].slice(0, 3)} ${blocks.map((b) => `${minutesToTime(b.startMin)}–${minutesToTime(b.endMin)}`).join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : "No availability set";
}

function ChangeRequestRow({ req }: { req: AvailabilityChangeRequest }) {
  const teacher = userById(req.teacherId);
  const current = getAvailability(req.teacherId).weekly;
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{teacher?.name ?? req.teacherId}</div>
          <div className="text-[11px] text-muted-foreground">Submitted {new Date(req.createdAt).toLocaleString()}</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { approveChangeRequest(req.id); }}
            className="rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-success-foreground hover:opacity-90"
          >
            Approve
          </button>
          <button
            onClick={() => { rejectChangeRequest(req.id); }}
            className="rounded-lg border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            Reject
          </button>
        </div>
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <div className="rounded-lg bg-secondary/40 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Current</div>
          <div className="text-foreground">{summarizeWeekly(current)}</div>
        </div>
        <div className="rounded-lg bg-accent/5 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Proposed</div>
          <div className="text-foreground">{summarizeWeekly(req.proposed)}</div>
        </div>
      </div>
      {req.reason && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Reason:</span> {req.reason}
        </div>
      )}
    </div>
  );
}

function PrimaryBtn({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}>{children}</button>;
}

function GhostBtn({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40 ${className}`}>{children}</button>;
}
