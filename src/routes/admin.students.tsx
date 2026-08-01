import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  USERS, SESSIONS, ASSIGNMENTS, userById, type User,
} from "@/lib/mock-data";
import {
  PRODUCTS, FOCUSES, ACCESS_PLANS, ACCESS_PLAN_IDS, RESCHEDULE_PRESETS,
  SESSIONS_PER_LEVEL, MAX_INSIGHT_STRIKES, MAX_BOOKCLUB_STRIKES,
  getProduct, focusesForProduct, getFocus, getAccessPlan,
  suggestDuration, nextPaymentDate, nextPaymentDateAfterToday, daysUntil, paymentUrgency,
  type ProductId, type AccessPlanId,
  accessPlanPillStyle,
} from "@/lib/student-model";
import { teachersForProduct, teachersForProductSorted } from "@/lib/teacher-model";
import { teacherTier } from "@/lib/teacher-tiers";
import { PLAN_DEFAULTS } from "@/lib/club-bookings-store";

import { AccentModal, AccentModalFooter, Card, GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { useAvatar } from "@/lib/avatar-store";
import {
  Plus, X, Eye, EyeOff, KeyRound, Mail, Building2, CalendarDays, GraduationCap,
  Users, Briefcase, Compass, Globe, Crown, Copy, Check, Snowflake, Ban, Play, Unlock,
  Sparkles, Wand2, Pencil, Video, Repeat, Clock, CreditCard, ShieldAlert,
  Search, ArrowUpDown, Filter, Gauge, Lightbulb, Layers,
} from "lucide-react";
import {
  type WorkshopCohort, type WorkshopTemplate,
  addStudentToCohort, cohortsForStudent, loadWorkshops,
  removeParticipantFromCohort, subscribeWorkshops,
} from "@/lib/workshops-store";
import { groupsByStudentId, groupOfStudent, removeMember, subscribeGroups, effectiveSessionCounts, sessionProgressFor } from "@/lib/groups-store";
import { studentAttendance } from "@/lib/sessions-store";
import { logPayment, expectedAmountForStudent, loadPayments } from "@/lib/payments-log";
import { setLevelReopened } from "@/lib/students-store";
import { RotateCcw, Unlock as UnlockIcon, Lock as LockIcon, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadCourses, subscribeCourses, type CourseLevel } from "@/lib/product-courses-store";
import { reportsForStudent, subscribeStudentReports } from "@/lib/student-reports-store";
import {
  isMilestoneUnit, getUnitAccessOverride, setUnitAccess,
} from "@/lib/activities-store";
import {
  loadBadges as loadProfileBadgeCatalog,
  type BadgeDef as ProfileBadgeDef,
} from "@/lib/profile-badges-store";
import {
  loadBadges as loadChallengeBadgeCatalog,
  type BadgeDef as ChallengeBadgeDef,
} from "@/lib/badges-store";
import {
  getBadgeOverride, setBadgeOverride, type BadgeSystem,
} from "@/lib/badge-override-store";

export const Route = createFileRoute("/admin/students")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): { new?: boolean; student?: string } => ({
    new: s.new === true || s.new === "true" || s.new === "1",
    student: typeof s.student === "string" ? s.student : undefined,
  }),
});

// ---------------------------------------------------------------------------
// Persistence (localStorage — swap for Lovable Cloud later)
// ---------------------------------------------------------------------------
const PROFILE_KEY = "verbo:student-profile-overrides";
const REGISTERED_KEY = "verbo:registered-students";

function readProfileOverrides(): Record<string, Partial<User>> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"); } catch { return {}; }
}
function writeProfileOverrides(map: Record<string, Partial<User>>) {
  if (typeof window !== "undefined") localStorage.setItem(PROFILE_KEY, JSON.stringify(map));
}
function readRegisteredStudents(): User[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(REGISTERED_KEY) || "[]"); } catch { return []; }
}
function writeRegisteredStudents(list: User[]) {
  if (typeof window !== "undefined") localStorage.setItem(REGISTERED_KEY, JSON.stringify(list));
}

const LEVEL_OPTIONS = [
  { value: "A1", label: "A1 — Beginner" },
  { value: "A2", label: "A2 — Elementary" },
  { value: "B1", label: "B1 — Intermediate" },
  { value: "B2", label: "B2 — Upper Intermediate" },
  { value: "C1", label: "C1 — Advanced" },
  { value: "C2", label: "C2 — Mastery" },
];

const PRODUCT_ICON = { briefcase: Briefcase, compass: Compass, globe: Globe, crown: Crown } as const;

const PRODUCT_TYPE_OPTIONS: {
  id: "performance" | "workshops" | "insights";
  name: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "performance", name: "Performance Sessions", blurb: "Live 1:1 English program (Enterprise, GO, International, VIP).", icon: Gauge },
  { id: "workshops", name: "Focus Workshops", blurb: "Short-form workshops only. No live 1:1 sessions.", icon: Layers },
  { id: "insights", name: "Insights", blurb: "Insights access only. No live sessions or workshops.", icon: Lightbulb },
];

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function computeNextPayment(u: User): Date | null {
  if (u.next_payment) return new Date(u.next_payment);
  if (!u.payment_day) return null;
  // Always compute from today so the "next" payment stays forward-looking
  // even when cycle_start is old and the student has never been marked paid.
  return nextPaymentDate(u.payment_day, new Date());
}

// ===========================================================================
// PAGE
// ===========================================================================
function Page() {
  const { new: openNew, student: focusStudent } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [, forceTick] = useState(0);
  const [detail, setDetail] = useState<User | null>(null);
  const [formFor, setFormFor] = useState<User | "new" | null>(null);

  useEffect(() => {
    const overrides = readProfileOverrides();
    USERS.forEach((u) => { if (overrides[u.id]) Object.assign(u, overrides[u.id]); });
    readRegisteredStudents().forEach((u) => {
      if (!USERS.find((x) => x.id === u.id)) USERS.push(u);
    });
    forceTick((n) => n + 1);
  }, []);

  // Deep-link handling from the Admin Overview Quick Actions / snapshot links.
  useEffect(() => {
    if (openNew) {
      setFormFor("new");
      navigate({ search: {}, replace: true });
    } else if (focusStudent) {
      const s = USERS.find((u) => u.id === focusStudent && u.role === "student");
      if (s) setDetail(s);
      navigate({ search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew, focusStudent]);

  const allStudents = USERS.filter((u) => u.role === "student");
  // Group members also appear here as their own cards (read/manage individually);
  // creating/registering group members still happens under the Groups tab.
  const groupMap = groupsByStudentId();
  const teachers = USERS.filter((u) => u.role === "teacher");

  useEffect(() => subscribeGroups(() => forceTick((n) => n + 1)), []);

  // ---------------------------------------------------------------------------
  // Filter & search state
  // ---------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "">("");
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [filterProduct, setFilterProduct] = useState<string>("");

  const companies = useMemo(() => {
    const set = new Set<string>();
    allStudents.forEach((s) => { if (s.company) set.add(s.company); });
    return Array.from(set).sort();
  }, [allStudents]);

  const filteredStudents = useMemo(() => {
    let list = allStudents.slice();

    // search by name
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    // filter by company
    if (filterCompany) {
      list = list.filter((s) => s.company === filterCompany);
    }

    // filter by product
    if (filterProduct) {
      list = list.filter((s) => s.product === filterProduct);
    }

    // sort
    if (sortBy === "name-asc") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "name-desc") {
      list.sort((a, b) => b.name.localeCompare(a.name));
    }

    return list;
  }, [allStudents, searchQuery, filterCompany, filterProduct, sortBy]);

  const persist = (updated: User) => {
    const idx = USERS.findIndex((u) => u.id === updated.id);
    if (idx >= 0) USERS[idx] = updated; else USERS.push(updated);
    const overrides = readProfileOverrides();
    const { id, name, role, ...rest } = updated;
    overrides[updated.id] = { name, ...rest };
    writeProfileOverrides(overrides);
    // keep registered list fresh if this is a locally-created student
    const registered = readRegisteredStudents();
    const rIdx = registered.findIndex((u) => u.id === updated.id);
    if (rIdx >= 0) { registered[rIdx] = updated; writeRegisteredStudents(registered); }
    forceTick((n) => n + 1);
  };

  const handleRegister = (u: User, teacherId?: string) => {
    USERS.push(u);
    if (teacherId) ASSIGNMENTS.push({ teacher_id: teacherId, student_id: u.id });
    const registered = readRegisteredStudents();
    registered.push(u);
    writeRegisteredStudents(registered);
    setFormFor(null);
    forceTick((n) => n + 1);
    setDetail(null);
  };

  const handleUpdate = (u: User, teacherId?: string) => {
    persist(u);
    if (teacherId) {
      const existing = ASSIGNMENTS.find((a) => a.student_id === u.id);
      if (existing) existing.teacher_id = teacherId;
      else ASSIGNMENTS.push({ teacher_id: teacherId, student_id: u.id });
    }
    setFormFor(null);
    // keep detail modal in sync
    setDetail((d) => (d && d.id === u.id ? u : d));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">Register, manage and monitor student memberships.</p>
        </div>
        <button
          onClick={() => setFormFor("new")}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Register student
        </button>
      </div>

      {/* Filters & search bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name-asc" | "name-desc" | "")}
              className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Alphabetical order</option>
              <option value="name-asc">Name: A → Z</option>
              <option value="name-desc">Name: Z → A</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Company filter */}
          <div className="relative">
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Product filter */}
          <div className="relative">
            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All products</option>
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>

          {/* Clear filters */}
          {(searchQuery || sortBy || filterCompany || filterProduct) && (
            <button
              onClick={() => { setSearchQuery(""); setSortBy(""); setFilterCompany(""); setFilterProduct(""); }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredStudents.length} of {allStudents.length} students
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {filteredStudents.map((s, i) => (
          <StudentCard key={s.id} student={s} index={i} onOpen={() => setDetail(s)} />
        ))}
      </div>


      {filteredStudents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center shadow-sm">
          <Search className="mb-3 h-8 w-8 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium text-foreground">No students found</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters or search query.</p>
        </div>
      )}

      {detail && (
        <StudentDetailModal
          student={detail}
          teachers={teachers}
          onClose={() => setDetail(null)}
          onUpdate={handleUpdate}
          onEdit={() => { const s = detail; setDetail(null); setFormFor(s); }}
        />
      )}

      {formFor && (
        <StudentFormModal
          initial={formFor === "new" ? null : formFor}
          teachers={teachers}
          onClose={() => setFormFor(null)}
          onSave={formFor === "new" ? handleRegister : handleUpdate}
        />
      )}
    </div>
  );
}

// ===========================================================================
// STUDENT CARD
// ===========================================================================
const TIER_ACCENT: Record<string, { accent: string; label: string }> = {
  Core: { accent: "#f38934", label: "Core" },
  Advance: { accent: "#01304a", label: "Advance" },
  Elite: { accent: "#d4af37", label: "Elite" },
  Signature: { accent: "#d4af37", label: "Signature" },
};

function StudentCard({ student: s, onOpen, index = 0 }: { student: User; onOpen: () => void; index?: number }) {
  const avatar = useAvatar(s.id);
  const product = getProduct(s.product);
  const groupInfo = groupOfStudent(s.id);
  const strikes = s.insights_strikes ?? 0;
  const blocked = strikes >= MAX_INSIGHT_STRIKES;
  const bcStrikes = s.bookclub_strikes ?? 0;
  const bcBlocked = bcStrikes >= MAX_BOOKCLUB_STRIKES;
  const hasBookClubs = (s.addon_bookclubs_per_month ?? 0) > 0;
  const counts = effectiveSessionCounts(s.id, { hired: s.hired_sessions, remaining: s.remaining_sessions });
  const hired = counts.hired;
  const remaining = counts.remaining;
  const { pct } = sessionProgressFor(hired, remaining);

  const nextPay = computeNextPayment(s);
  const payState = paymentUrgency(nextPay);
  const payDue = payState !== null;
  const overdue = payState === "overdue";

  const statusBadge =
    s.status === "suspended" ? { cls: "bg-destructive/10 text-destructive", label: "Suspended" }
    : s.status === "frozen" ? { cls: "bg-blue-500/10 text-blue-600", label: "Frozen" }
    : { cls: "bg-success/10 text-success", label: "Active" };

  const productType = s.product_type ?? "performance";
  // Insights strike badge stays for anyone with Insights access — Performance
  // students (kept as before) and standalone Insights customers.
  const showInsightsBadge = productType === "performance" || productType === "insights";

  const tier = s.access_plan ? TIER_ACCENT[s.access_plan] : undefined;
  const accent = tier?.accent ?? "var(--navy-400, #64748b)";
  const isPremiumTier = s.access_plan === "Elite" || s.access_plan === "Signature";
  const cardVars = {
    "--tier": accent,
    "--verbo-card-i": index,
  } as React.CSSProperties;

  if (productType !== "performance") {
    const typeLabel = productType === "workshops" ? "Focus Workshops" : "Insights";
    const TypeIcon = productType === "workshops" ? Layers : Lightbulb;
    return (
      <button
        onClick={onOpen}
        style={{ ...cardVars, "--tier": "var(--primary)" } as React.CSSProperties}
        className="verbo-student-card group relative flex flex-col overflow-hidden rounded-[22px] border border-border/80 bg-card p-5 text-left"
      >
        <span className="verbo-student-card__rail" aria-hidden />
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt={s.name} className="verbo-student-card__avatar h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="verbo-student-card__avatar flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials(s.name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold tracking-[-0.01em] text-foreground">{s.name}</div>
            <div className="truncate text-xs font-light text-muted-foreground">{s.email}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Tag className="inline-flex gap-1 bg-primary/10 text-primary">
            <TypeIcon className="h-3 w-3" strokeWidth={1.8} /> {typeLabel}
          </Tag>
          <Tag className={statusBadge.cls}>{statusBadge.label}</Tag>
          {showInsightsBadge && (
            <Tag className={blocked ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}>
              {blocked ? <>Insights Blocked</> : <>Insights {strikes}/{MAX_INSIGHT_STRIKES}</>}
            </Tag>
          )}
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onOpen}
      style={cardVars}
      data-group={groupInfo ? "true" : undefined}
      data-premium={isPremiumTier ? "true" : undefined}
      className={`verbo-student-card group relative flex flex-col overflow-hidden rounded-[22px] border border-border/80 bg-card p-5 text-left ${overdue ? "verbo-pay-overdue-glow" : payDue ? "verbo-pay-glow" : ""}`}
    >
      {/* Tier rail — the card's identity at a glance */}
      <span className="verbo-student-card__rail" aria-hidden />
      {isPremiumTier && <span className="verbo-student-card__sheen" aria-hidden />}

      {payDue && (
        <span
          className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${overdue ? "text-white" : "bg-destructive/10 text-destructive"}`}
          style={overdue ? { background: "#b52904" } : undefined}
        >
          <CreditCard className="h-3 w-3" /> {overdue ? "Overdue" : "Payment due"}
        </span>
      )}

      {/* Identity row */}
      <div className="flex items-start gap-3 pl-1">
        <div className="relative shrink-0">
          {avatar ? (
            <img src={avatar} alt={s.name} className="verbo-student-card__avatar h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="verbo-student-card__avatar flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initials(s.name)}
            </div>
          )}
          {/* Solo vs group is legible on the avatar itself */}
          {groupInfo && (
            <span
              className="verbo-student-card__groupdot absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-blue-500 text-white"
              aria-hidden
            >
              <Users className="h-2.5 w-2.5" strokeWidth={2.4} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold tracking-[-0.01em] text-foreground">{s.name}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-light text-muted-foreground">
            {product && <span className="truncate">{product.name}</span>}
            {s.product === "enterprise" && s.company && (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate">{s.company}</span>
              </>
            )}
          </div>
        </div>

        {/* Tier chip, right-aligned so tiers line up across the grid */}
        {s.access_plan && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.04em]"
            style={accessPlanPillStyle(s.access_plan)}
          >
            {s.access_plan}
          </span>
        )}
      </div>

      {/* Group vs individual — an explicit line, not just a pill in the pile */}
      <div className="mt-3.5 flex items-center gap-2 pl-1">
        {groupInfo ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-600">
            <Users className="h-3 w-3 shrink-0" strokeWidth={1.9} />
            <span className="truncate">{groupInfo.group.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" aria-hidden />
            Individual
          </span>
        )}
        {s.focus && <span className="truncate text-[11px] font-light text-muted-foreground">{s.focus}</span>}
      </div>

      {/* Sessions — the number people scan for */}
      <div className="mt-4 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Sessions</span>
          <span className="font-display text-base font-semibold tabular-nums tracking-[-0.01em] text-foreground">
            {remaining}
            <span className="text-xs font-light text-muted-foreground">/{hired}</span>
          </span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="verbo-student-card__bar h-full rounded-full"
            style={{ width: `${Math.min(100, pct)}%`, background: accent }}
          />
        </div>
        {s.current_roadmap_level && (
          <div className="mt-2 truncate text-[11px] font-light text-muted-foreground">{s.current_roadmap_level}</div>
        )}
      </div>

      {/* Status strip */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-1">
        <Tag className={statusBadge.cls}>{statusBadge.label}</Tag>
        <Tag className={blocked ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}>
          {blocked ? <>Insights Blocked</> : <>Insights {strikes}/{MAX_INSIGHT_STRIKES}</>}
        </Tag>
        {hasBookClubs && (
          <Tag className={bcBlocked ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}>
            {bcBlocked ? <>Book Clubs Blocked</> : <>Book Clubs {bcStrikes}/{MAX_BOOKCLUB_STRIKES}</>}
          </Tag>
        )}
      </div>
    </button>
  );
}

function Tag({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span style={style} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${className}`}>
      {children}
    </span>
  );
}


// ===========================================================================
// REGISTER / EDIT FORM MODAL  (stepped card selection)
// ===========================================================================
type FormState = {
  name: string; email: string; password: string; member_since: string;
  company: string;
  product_type: "performance" | "workshops" | "insights";
  product: ProductId | "";
  focus: string;
  contracted_levels: string[];
  access_plan: AccessPlanId | "";
  current_level: string;
  hired_sessions: number; remaining_sessions: number; sessions_auto: boolean;
  sessions_per_week: number; session_duration: number;
  reschedule_policy: string; reschedule_custom_hours: number; reschedule_custom_pct: number;
  payment_day: number; cycle_start: string;
  video_call_link: string;
  teacher_id: string;
  // Add-ons
  addon_insights_per_month: number;
  addon_bookclubs_per_month: number;
  addon_spotlight_per_month: number;
  addon_workshops_enabled: boolean;
  selected_cohort_ids: string[];
};

function StudentFormModal({
  initial, teachers, onClose, onSave,
}: {
  initial: User | null;
  teachers: User[];
  onClose: () => void;
  onSave: (u: User, teacherId?: string) => void;
}) {
  const editing = !!initial;
  const existingTeacher = initial ? ASSIGNMENTS.find((a) => a.student_id === initial.id)?.teacher_id ?? "" : "";

  const [f, setF] = useState<FormState>(() => ({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    password: initial?.password ?? "",
    member_since: initial?.member_since ?? "",
    company: initial?.company ?? "",
    product_type: (initial?.product_type as FormState["product_type"]) ?? "performance",
    product: (initial?.product as ProductId) ?? "",
    focus: initial?.focus ?? "",
    contracted_levels: initial?.contracted_levels ?? [],
    access_plan: (initial?.access_plan as AccessPlanId) ?? "",
    current_level: initial?.current_level ?? "",
    hired_sessions: initial?.hired_sessions ?? 0,
    remaining_sessions: initial?.remaining_sessions ?? 0,
    sessions_auto: initial?.sessions_auto ?? true,
    sessions_per_week: initial?.sessions_per_week ?? 2,
    session_duration: initial?.session_duration ?? 60,
    reschedule_policy: initial?.reschedule_policy ?? "",
    reschedule_custom_hours: initial?.reschedule_custom_hours ?? 24,
    reschedule_custom_pct: initial?.reschedule_custom_pct ?? 25,
    payment_day: initial?.payment_day ?? 1,
    cycle_start: initial?.cycle_start ?? "",
    video_call_link: initial?.video_call_link ?? "",
    teacher_id: existingTeacher,
    addon_insights_per_month: initial?.addon_insights_per_month ?? 0,
    addon_bookclubs_per_month: initial?.addon_bookclubs_per_month ?? 0,
    addon_spotlight_per_month: initial?.addon_spotlight_per_month ?? 0,
    addon_workshops_enabled: initial?.addon_workshops_enabled ?? false,
    selected_cohort_ids: initial ? cohortsForStudent(initial.id).map((x) => x.cohort.id) : [],
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [tab, setTab] = useState<"academic" | "financial" | "info">("academic");
  const prevPerWeek = useRef(f.sessions_per_week);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const product = getProduct(f.product);
  const isEnterprise = f.product === "enterprise";
  const productLevels = product?.levels ?? [];

  // --- Product change: reset dependent axes ---
  const pickProduct = (id: ProductId) => {
    const p = getProduct(id)!;
    setF((prev) => ({
      ...prev,
      product: id,
      focus: "",
      company: id === "enterprise" ? prev.company : "",
      contracted_levels: [],
      access_plan: p.defaultAccessPlan ?? "",
      reschedule_policy: getAccessPlan(p.defaultAccessPlan)?.reschedulePolicy ?? "",
      hired_sessions: 0,
      remaining_sessions: 0,
      sessions_auto: true,
      ...applyPlanAddonDefaults(p.defaultAccessPlan ?? ""),
    }));
  };


  // --- Focus change: pre-mark suggested levels ---
  const pickFocus = (name: string) => {
    const focus = getFocus(name);
    const n = focus?.suggestedLevels ?? 0;
    const preset = productLevels.slice(0, n);
    setF((prev) => {
      const hired = preset.length * SESSIONS_PER_LEVEL;
      return {
        ...prev, focus: name, contracted_levels: preset,
        ...(prev.sessions_auto ? { hired_sessions: hired, remaining_sessions: editing ? prev.remaining_sessions : hired } : {}),
      };
    });
  };

  const toggleLevel = (lvl: string) => {
    setF((prev) => {
      const has = prev.contracted_levels.includes(lvl);
      const next = has ? prev.contracted_levels.filter((l) => l !== lvl) : [...prev.contracted_levels, lvl];
      const hired = next.length * SESSIONS_PER_LEVEL;
      return {
        ...prev, contracted_levels: next,
        ...(prev.sessions_auto ? { hired_sessions: hired, remaining_sessions: editing ? prev.remaining_sessions : hired } : {}),
      };
    });
  };

  // Track which add-on inputs the admin has typed into during this session,
  // so pickAccessPlan never overwrites a value the admin has already tuned.
  const [addonTouched, setAddonTouched] = useState({ insights: false, bookclubs: false, spotlight: false });
  const setAddon = (kind: "insights" | "bookclubs" | "spotlight", v: number) => {
    setAddonTouched((t) => ({ ...t, [kind]: true }));
    if (kind === "insights") set("addon_insights_per_month", v);
    else if (kind === "bookclubs") set("addon_bookclubs_per_month", v);
    else set("addon_spotlight_per_month", v);
  };

  const applyPlanAddonDefaults = (id: AccessPlanId | ""): Partial<FormState> => {
    if (!id) return {};
    const d = PLAN_DEFAULTS[id];
    // Signature is unlimited (Infinity) — not representable in a number input.
    // Store 999 as a "practically unlimited" sentinel the admin can override.
    const toInput = (n: number) => (isFinite(n) ? n : 999);
    return {
      ...(addonTouched.insights ? {} : { addon_insights_per_month: toInput(d.insight) }),
      ...(addonTouched.bookclubs ? {} : { addon_bookclubs_per_month: toInput(d.book) }),
      ...(addonTouched.spotlight ? {} : { addon_spotlight_per_month: toInput(d.spotlight) }),
    };
  };

  const pickAccessPlan = (id: AccessPlanId) => {
    setF((prev) => ({
      ...prev,
      access_plan: id,
      reschedule_policy: getAccessPlan(id)?.reschedulePolicy ?? prev.reschedule_policy,
      ...applyPlanAddonDefaults(id),
    }));
  };


  const changePerWeek = (val: number) => {
    const suggested = suggestDuration(prevPerWeek.current, f.session_duration, val);
    prevPerWeek.current = val;
    setF((prev) => ({ ...prev, sessions_per_week: val, session_duration: suggested }));
  };

  const editSessions = (k: "hired_sessions" | "remaining_sessions", v: number) => {
    setF((prev) => ({ ...prev, [k]: v, sessions_auto: false }));
  };

  const isCustomReschedule = f.reschedule_policy === "Custom";
  const nextPayPreview = f.payment_day
    ? nextPaymentDate(f.payment_day, f.cycle_start ? new Date(f.cycle_start) : new Date())
    : null;

  const baseValid = f.name.trim() && isValidEmail(f.email) && f.password.trim();
  const emailFormatError = (emailTouched || attemptedSave) && f.email.trim() && !isValidEmail(f.email);
  const isValid = f.product_type === "performance"
    ? (baseValid && f.product && f.video_call_link.trim() && (!isEnterprise || f.company.trim()))
    : f.product_type === "workshops"
      ? baseValid // participants can be added later, but a cohort selection is recommended
      : baseValid; // insights standalone

  const pickProductType = (pt: FormState["product_type"]) => {
    setF((prev) => {
      if (pt === "performance") return { ...prev, product_type: pt };
      // Switching to a standalone branch — clear Performance-only fields so
      // downstream displays don't show stale product/plan/teacher badges.
      return {
        ...prev,
        product_type: pt,
        product: "",
        focus: "",
        company: "",
        contracted_levels: [],
        access_plan: "",
        current_level: "",
        hired_sessions: 0,
        remaining_sessions: 0,
        sessions_auto: true,
        reschedule_policy: "",
        payment_day: 1,
        cycle_start: "",
        video_call_link: "",
        teacher_id: "",
        addon_insights_per_month: pt === "insights" ? (prev.addon_insights_per_month || 1) : 0,
        addon_bookclubs_per_month: 0,
        addon_spotlight_per_month: 0,
        addon_workshops_enabled: pt === "workshops",
      };
    });
  };

  const handleSave = () => {
    setAttemptedSave(true);
    if (!isValid) return;
    const accessPlan = (f.access_plan || undefined) as AccessPlanId | undefined;
    const id = initial?.id ?? `u${Date.now()}`;
    const isPerf = f.product_type === "performance";
    const u: User = {
      id,
      name: f.name.trim(),
      email: f.email.trim(),
      password: f.password,
      role: "student",
      product_type: f.product_type,
      company: isPerf && isEnterprise ? f.company.trim() || undefined : undefined,
      product: isPerf ? (f.product as ProductId) : undefined,
      focus: isPerf && !isEnterprise ? f.focus || undefined : undefined,
      access_plan: isPerf ? accessPlan : undefined,
      hired_plan: isPerf ? accessPlan : undefined, // legacy display alias
      contracted_levels: isPerf ? f.contracted_levels : [],
      current_roadmap_level: isPerf ? (initial?.current_roadmap_level ?? f.contracted_levels[0]) : undefined,
      current_level: isPerf ? (f.current_level || undefined) : undefined,
      member_since: f.member_since || undefined,
      hired_sessions: isPerf ? (Number(f.hired_sessions) || 0) : 0,
      remaining_sessions: isPerf ? (Number(f.remaining_sessions) || 0) : 0,
      sessions_auto: isPerf ? f.sessions_auto : undefined,
      sessions_per_week: isPerf ? (Number(f.sessions_per_week) || 1) : undefined,
      session_duration: isPerf ? (Number(f.session_duration) || 60) : undefined,
      reschedule_policy: isPerf ? (f.reschedule_policy || undefined) : undefined,
      reschedule_custom_hours: isPerf && isCustomReschedule ? Number(f.reschedule_custom_hours) : undefined,
      reschedule_custom_pct: isPerf && isCustomReschedule ? Number(f.reschedule_custom_pct) : undefined,
      payment_day: isPerf ? (Number(f.payment_day) || undefined) : undefined,
      cycle_start: isPerf ? (f.cycle_start || undefined) : undefined,
      video_call_link: isPerf ? f.video_call_link.trim() : undefined,
      status: initial?.status ?? "active",
      must_change_password: initial ? initial.must_change_password : true,
      insights_strikes: initial?.insights_strikes ?? 0,
      admin_notes: initial?.admin_notes,
      next_payment: initial?.next_payment,
      addon_insights_per_month: Number(f.addon_insights_per_month) || 0,
      addon_bookclubs_per_month: isPerf ? (Number(f.addon_bookclubs_per_month) || 0) : 0,
      addon_spotlight_per_month: isPerf ? (Number(f.addon_spotlight_per_month) || 0) : 0,
      addon_workshops_enabled: f.product_type === "workshops" ? true : (isPerf && f.addon_workshops_enabled),
    };

    // Sync cohort memberships against workshops store (source of truth).
    const wantsCohorts = u.product_type === "workshops" || (u.product_type === "performance" && u.addon_workshops_enabled);
    const targetIds = new Set(wantsCohorts ? f.selected_cohort_ids : []);
    const currentIds = new Set(cohortsForStudent(id).map((x) => x.cohort.id));
    for (const cid of currentIds) if (!targetIds.has(cid)) removeParticipantFromCohort(cid, id);
    for (const cid of targetIds) if (!currentIds.has(cid)) addStudentToCohort(cid, id, u.name);

    onSave(u, isPerf ? (f.teacher_id || undefined) : undefined);
  };

  const isPerf = f.product_type === "performance";
  const TAB_ACCENT: Record<string, string> = { academic: "#01304a", financial: "#d97706", info: "#3ebbad" };
  const accent = TAB_ACCENT[tab];
  const academicMissing = attemptedSave && !isValid && isPerf
    && (!f.product || !f.video_call_link.trim() || (isEnterprise && !f.company.trim()));
  const infoMissing = attemptedSave && !isValid
    && (!f.name.trim() || !isValidEmail(f.email) || !f.password.trim());
  const tabs: { id: "academic" | "financial" | "info"; label: string; dot: boolean }[] = [
    { id: "academic", label: "Academic", dot: !!academicMissing },
    ...(isPerf ? [{ id: "financial" as const, label: "Financial", dot: false }] : []),
    { id: "info", label: "Student Info", dot: !!infoMissing },
  ];
  const SectionTitleTab = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-sm font-semibold" style={{ color: accent }}>{children}</h3>
  );

  return (
    <AccentModal
      background="linear-gradient(135deg, #01304a 0%, #02466b 100%)"
      iconTint="#01304a"
      icon={GraduationCap}
      eyebrow={editing ? "Edit student" : "New registration"}
      title={editing ? f.name || "Edit Student" : "Register Student"}
      watermark={{ type: "text", value: "STUDENT" }}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border px-6 pt-3">
        {tabs.map((t) => {
          const active = tab === t.id;
          const color = TAB_ACCENT[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-sm font-semibold transition-colors ${active ? "" : "text-muted-foreground hover:text-foreground"}`}
              style={active ? { color } : undefined}
            >
              {t.label}
              {t.dot && <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />}
              {active && (
                <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full" style={{ background: color }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="max-h-[64vh] space-y-7 overflow-y-auto px-6 py-6 report-modal-scroll">
        {/* ================= ACADEMIC ================= */}
        {tab === "academic" && (
          <>
            {/* STEP 1 — Product Type */}
            <Step n={1} title="Product Type">
              <div className="grid grid-cols-3 gap-3">
                {PRODUCT_TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = f.product_type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => pickProductType(opt.id)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-center transition-all ${active ? "border-[#01304a] bg-[#01304a]" : "border-border bg-background hover:border-[#01304a]/40 hover:bg-secondary/40"}`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-white/15 text-white" : "bg-secondary text-muted-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className={`text-sm font-semibold ${active ? "text-white" : "text-foreground"}`}>{opt.name}</span>
                      <span className={`text-[10.5px] leading-tight ${active ? "text-white/80" : "text-muted-foreground"}`}>{opt.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </Step>

            {/* BRANCH: FOCUS WORKSHOPS — standalone */}
            {f.product_type === "workshops" && (
              <Step n={2} title="Workshop Cohorts">
                <p className="mb-3 text-[11px] text-muted-foreground">Standalone workshop customer. Add them to one or more cohorts from the Focus Workshops tab.</p>
                <CohortChipsPicker
                  selectedIds={f.selected_cohort_ids}
                  currentUserId={initial?.id}
                  onChange={(ids) => set("selected_cohort_ids", ids)}
                />
              </Step>
            )}

            {/* BRANCH: INSIGHTS — standalone */}
            {f.product_type === "insights" && (
              <Step n={2} title="Insights Access">
                <p className="mb-3 text-[11px] text-muted-foreground">Standalone Insights customer. Set the monthly cap for this person.</p>
                <Field label="Insights (per month)" icon={<Lightbulb className="h-3.5 w-3.5" />}>
                  <input type="number" min={0} value={f.addon_insights_per_month} onChange={(e) => setAddon("insights", Number(e.target.value))} className={inputCls} />
                </Field>
              </Step>
            )}

            {/* BRANCH: PERFORMANCE SESSIONS */}
            {isPerf && (
              <>
                <Step n={2} title="Product">
                  <div className="grid grid-cols-3 gap-3">
                    {PRODUCTS.map((p) => {
                      const Icon = PRODUCT_ICON[p.icon];
                      const active = f.product === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickProduct(p.id)}
                          className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-center transition-all ${active ? "border-[#01304a] bg-[#01304a]" : "border-border bg-background hover:border-[#01304a]/40 hover:bg-secondary/40"}`}
                        >
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-white/15 text-white" : "bg-secondary text-muted-foreground"}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className={`text-sm font-semibold ${active ? "text-white" : "text-foreground"}`}>{p.name}</span>
                          <span className={`text-[10.5px] leading-tight ${active ? "text-white/80" : "text-muted-foreground"}`}>{p.blurb}</span>
                        </button>
                      );
                    })}
                  </div>

                  {isEnterprise && (
                    <div className="verbo-fade-up mt-4">
                      <Field label="Company" icon={<Building2 className="h-3.5 w-3.5" />}>
                        <input value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="Organization (required)" className={inputCls} />
                      </Field>
                    </div>
                  )}
                </Step>

                {product?.hasFocus && (
                  <Step n={3} title="Focus">
                    <div className="flex flex-wrap gap-2">
                      {focusesForProduct(f.product).map((focus) => {
                        const active = f.focus === focus.name;
                        return (
                          <button
                            key={focus.id}
                            type="button"
                            onClick={() => pickFocus(focus.name)}
                            className={`rounded-full border-2 px-4 py-2 text-sm font-medium transition-all ${active ? "border-[#01304a] bg-[#01304a] text-white" : "border-border bg-background text-foreground hover:border-[#01304a]/40"}`}
                          >
                            {focus.name}
                          </button>
                        );
                      })}
                    </div>
                  </Step>
                )}

                {f.product && (
                  <Step n={product?.hasFocus ? 4 : 3} title="Contracted levels (roadmap)">
                    <div className="flex flex-wrap gap-2">
                      {productLevels.map((lvl) => {
                        const active = f.contracted_levels.includes(lvl);
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => toggleLevel(lvl)}
                            className={`rounded-full border-2 px-4 py-2 text-sm font-medium transition-all ${active ? "border-[#01304a] bg-[#01304a] text-white" : "border-border bg-background text-foreground hover:border-[#01304a]/40"}`}
                          >
                            {active && <Check className="mr-1 inline h-3.5 w-3.5 text-white" />}{lvl}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Each level ≈ {SESSIONS_PER_LEVEL} live sessions.</p>
                  </Step>
                )}

                {f.product && (
                  <Step n={product?.hasFocus ? 5 : 4} title="Access plan">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {ACCESS_PLAN_IDS.map((id) => {
                        const active = f.access_plan === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => pickAccessPlan(id)}
                            className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition-all ${active ? "border-[#01304a] bg-[#01304a] text-white" : "border-border bg-background text-foreground hover:border-[#01304a]/40"}`}
                          >
                            {id}
                          </button>
                        );
                      })}
                    </div>
                    {f.access_plan && (
                      <p className="mt-2 text-[11px] text-muted-foreground">{getAccessPlan(f.access_plan)?.blurb}</p>
                    )}
                  </Step>
                )}

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field label="Sessions per week" icon={<Repeat className="h-3.5 w-3.5" />}>
                    <input type="number" min={1} value={f.sessions_per_week} onChange={(e) => changePerWeek(Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Session duration (min)" icon={<Clock className="h-3.5 w-3.5" />}>
                    <input type="number" min={15} step={5} value={f.session_duration} onChange={(e) => set("session_duration", Number(e.target.value))} className={inputCls} />
                    <p className="mt-1 text-[10.5px] text-muted-foreground">{f.sessions_per_week * f.session_duration} min/week total.</p>
                  </Field>

                  <Field label="Reschedule policy" icon={<CalendarDays className="h-3.5 w-3.5" />} className="md:col-span-2">
                    <select value={f.reschedule_policy} onChange={(e) => set("reschedule_policy", e.target.value)} className={`${inputCls} cursor-pointer`}>
                      <option value="">Select a policy</option>
                      {RESCHEDULE_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                      <option value="Custom">Custom…</option>
                    </select>
                  </Field>
                  {isCustomReschedule && (
                    <>
                      <Field label="Minimum hours of notice">
                        <input type="number" min={0} value={f.reschedule_custom_hours} onChange={(e) => set("reschedule_custom_hours", Number(e.target.value))} className={inputCls} />
                      </Field>
                      <Field label="Max % of monthly sessions">
                        <input type="number" min={0} max={100} value={f.reschedule_custom_pct} onChange={(e) => set("reschedule_custom_pct", Number(e.target.value))} className={inputCls} />
                      </Field>
                    </>
                  )}

                  <Field label="Video Call Link" icon={<Video className="h-3.5 w-3.5" />} className="md:col-span-2">
                    <input type="url" value={f.video_call_link} onChange={(e) => set("video_call_link", e.target.value)} placeholder="https://teams.microsoft.com/..." className={inputCls} />
                    <p className="mt-1 text-[10.5px] text-muted-foreground">This link will be used for all of the student's sessions until an admin changes it.</p>
                  </Field>

                  <Field label="Assign Initial Teacher" icon={<Users className="h-3.5 w-3.5" />} className="md:col-span-2">
                    <select value={f.teacher_id} onChange={(e) => set("teacher_id", e.target.value)} className={`${inputCls} cursor-pointer`}>
                      <option value="">Select a teacher (optional)</option>
                      {teachersForProductSorted(teachers, f.product || null).map((t) => <option key={t.id} value={t.id}>{t.name} · {teacherTier(t).name}</option>)}
                    </select>
                    {f.product && <p className="mt-1 text-[10.5px] text-muted-foreground">Only showing teachers qualified for {getProduct(f.product)?.name}.</p>}
                  </Field>
                </div>
              </>
            )}
          </>
        )}

        {/* ================= FINANCIAL ================= */}
        {tab === "financial" && isPerf && (
          <>
            <div>
              <div className="mb-3"><SectionTitleTab>Sessions & Billing</SectionTitleTab></div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field
                  label={<span className="flex items-center gap-1.5">Hired Sessions {f.sessions_auto ? <Wand2 className="h-3 w-3 text-accent" /> : <span className="rounded bg-warning/20 px-1 text-[9px] font-semibold text-foreground">edited manually</span>}</span>}
                >
                  <input type="number" min={0} value={f.hired_sessions} onChange={(e) => editSessions("hired_sessions", Number(e.target.value))} className={inputCls} />
                </Field>

                <Field label="Remaining Sessions">
                  <input type="number" min={0} value={f.remaining_sessions} onChange={(e) => editSessions("remaining_sessions", Number(e.target.value))} className={inputCls} />
                </Field>

                <Field label="Payment day (1–31)" icon={<CreditCard className="h-3.5 w-3.5" />}>
                  <input type="number" min={1} max={31} value={f.payment_day} onChange={(e) => set("payment_day", Number(e.target.value))} className={inputCls} />
                </Field>
                <Field label="Cycle start" icon={<CalendarDays className="h-3.5 w-3.5" />}>
                  <input type="date" value={f.cycle_start} onChange={(e) => set("cycle_start", e.target.value)} className={inputCls} />
                  {nextPayPreview && <p className="mt-1 text-[10.5px] text-muted-foreground">Next payment: {nextPayPreview.toLocaleDateString()}</p>}
                </Field>
              </div>
            </div>

            {/* Add-on Access */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}26`, color: accent }}><Sparkles className="h-3.5 w-3.5" /></span>
                <SectionTitleTab>Add-on Access</SectionTitleTab>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Insights (per month)" icon={<Lightbulb className="h-3.5 w-3.5" />}>
                  <input type="number" min={0} value={f.addon_insights_per_month} onChange={(e) => setAddon("insights", Number(e.target.value))} className={inputCls} />
                </Field>
                <Field label="Book Clubs (per month)" icon={<Users className="h-3.5 w-3.5" />}>
                  <input type="number" min={0} value={f.addon_bookclubs_per_month} onChange={(e) => setAddon("bookclubs", Number(e.target.value))} className={inputCls} />
                </Field>
                <Field label="Spotlight Sessions (per month)" icon={<Sparkles className="h-3.5 w-3.5" />}>
                  <input type="number" min={0} value={f.addon_spotlight_per_month} onChange={(e) => setAddon("spotlight", Number(e.target.value))} className={inputCls} />
                </Field>
              </div>
              <div className="mt-4">
                <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" /> Workshops
                </label>
                <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1">
                  <button type="button" onClick={() => set("addon_workshops_enabled", true)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${f.addon_workshops_enabled ? "bg-[#01304a] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Yes</button>
                  <button type="button" onClick={() => { set("addon_workshops_enabled", false); set("selected_cohort_ids", []); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${!f.addon_workshops_enabled ? "bg-[#01304a] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>No</button>
                </div>
                {f.addon_workshops_enabled && (
                  <div className="mt-3">
                    <CohortChipsPicker
                      selectedIds={f.selected_cohort_ids}
                      currentUserId={initial?.id}
                      onChange={(ids) => set("selected_cohort_ids", ids)}
                    />
                    <p className="mt-1 text-[10.5px] text-muted-foreground">Cohorts are created in Admin → Focus Workshops. A student can be enrolled in multiple cohorts over time.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ================= STUDENT INFO ================= */}
        {tab === "info" && (
          <div>
            <div className="mb-3"><SectionTitleTab>Student Info</SectionTitleTab></div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Student Name">
                <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" className={inputCls} />
              </Field>
              <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
                <input
                  type="email"
                  value={f.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="student@company.com"
                  className={`${inputCls} ${emailFormatError ? "!border-destructive focus:!border-destructive focus:!ring-destructive" : ""}`}
                  aria-invalid={emailFormatError ? "true" : "false"}
                />
                {emailFormatError && <p className="mt-1 text-xs text-destructive">Enter a valid email address</p>}
              </Field>
              <Field label="Initial Password" icon={<KeyRound className="h-3.5 w-3.5" />}>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={f.password} onChange={(e) => set("password", e.target.value)} placeholder="Set a password" className={`${inputCls} pr-9`} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Toggle password">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Member Since" icon={<CalendarDays className="h-3.5 w-3.5" />}>
                <input type="date" value={f.member_since} onChange={(e) => set("member_since", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Initial English Level" icon={<GraduationCap className="h-3.5 w-3.5" />}>
                <select value={f.current_level} onChange={(e) => set("current_level", e.target.value)} className={`${inputCls} cursor-pointer`}>
                  <option value="">Select a level</option>
                  {LEVEL_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
      </div>

      <AccentModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton
          onClick={handleSave}
          disabled={!isValid}
          accentColor="#5fca16"
          className="hover:!bg-[#4fb010]"
        >
          {editing ? "Save changes" : "Save"}
        </PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}

// ===========================================================================
// DETAIL MODAL (tabs + actions)
// ===========================================================================
type Tab = "overview" | "performance" | "progress" | "badges" | "reports" | "notes";

function StudentDetailModal({
  student, teachers, onClose, onUpdate, onEdit,
}: {
  student: User;
  teachers: User[];
  onClose: () => void;
  onUpdate: (u: User, teacherId?: string) => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [, forceTick] = useState(0);
  const [notes, setNotes] = useState(student.admin_notes ?? "");
  const [showLink, setShowLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<"none" | "reassign" | "freeze">("none");
  const [teacherId, setTeacherId] = useState(ASSIGNMENTS.find((a) => a.student_id === student.id)?.teacher_id ?? "");
  const [freezeStart, setFreezeStart] = useState(student.freeze_start ?? "");
  const [freezeEnd, setFreezeEnd] = useState(student.freeze_end ?? "");

  const avatar = useAvatar(student.id);
  const product = getProduct(student.product);
  const accessPlan = getAccessPlan(student.access_plan);
  const groupInfo = groupOfStudent(student.id);
  const isGrouped = !!groupInfo;
  const strikes = student.insights_strikes ?? 0;
  const blocked = strikes >= MAX_INSIGHT_STRIKES;
  const bcStrikes = student.bookclub_strikes ?? 0;
  const bcBlocked = bcStrikes >= MAX_BOOKCLUB_STRIKES;
  const hasBookClubs = (student.addon_bookclubs_per_month ?? 0) > 0;
  const nextPay = computeNextPayment(student);

  const patch = (p: Partial<User>) => onUpdate({ ...student, ...p });

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(student.video_call_link ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };

  const maskedLink = (student.video_call_link ?? "").replace(/^(https?:\/\/[^/]+).*/, "$1/•••••");

  const teacherHistory = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    SESSIONS.filter((s) => s.student_id === student.id).forEach((s) => {
      const t = userById(s.teacher_id); if (!t) return;
      const prev = map.get(t.id);
      if (prev) prev.count += 1; else map.set(t.id, { name: t.name, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [student.id]);

  const saveFreeze = () => {
    if (freezeStart && freezeEnd) {
      const days = daysUntil(new Date(freezeEnd), new Date(freezeStart));
      if (days > 15) { alert("Freeze cannot exceed 15 days."); return; }
      // TODO: validate max 1 freeze per completed level once level-completion logic exists.
    }
    patch({ status: "frozen", freeze_start: freezeStart || undefined, freeze_end: freezeEnd || undefined });
    setPanel("none");
  };

  const markPaid = () => {
    // Advance to the next real occurrence of the payment day so the "next
    // payment" is always in the future and the glow disappears immediately.
    const day = student.payment_day ?? (nextPay ? nextPay.getDate() : 1);
    const after = nextPaymentDateAfterToday(day);
    // Record the payment event so The Money Lab can consolidate it.
    logPayment({
      entity_type: "individual",
      entity_id: student.id,
      name: student.name,
      company: student.company,
      amount: expectedAmountForStudent(student),
      paid_at: new Date().toISOString(),
    });
    patch({ next_payment: after.toISOString() });
  };

  return (
    <Overlay onClose={onClose}>
      <div className="verbo-sdm relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-card shadow-floating">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-5 sm:px-7 sm:py-6" style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}>
          <div className="flex min-w-0 items-center gap-3.5">
            {avatar ? (
              <img src={avatar} alt={student.name} className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white/25" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-base font-semibold text-white ring-2 ring-white/20">{initials(student.name)}</div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight text-white sm:text-[1.4rem]">{student.name}</h2>
              <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">
                {[product?.name, student.access_plan, student.company].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="verbo-sdm-action shrink-0 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="verbo-scroll-hidden flex gap-1 overflow-x-auto border-b border-border bg-card px-3 pt-2 sm:px-5">
          {([["overview", "Overview"], ["performance", "Performance & Attendance"], ["progress", "Course Progress"], ["badges", "Badges"], ["reports", "Reports"], ["notes", "Admin Notes"]] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`verbo-sdm-tab relative shrink-0 whitespace-nowrap rounded-t-lg px-3 py-2.5 text-[13px] transition-colors ${tab === id ? "font-semibold text-accent" : "font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}
            >
              {label}
              {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="verbo-scroll-hidden flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {tab === "overview" && (
            <div className="space-y-7">
              {/* Contract essentials */}
              <Section title="Contract" index={0}>
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  <Info label="Email" value={student.email} />
                  <Info label="CEFR Level" value={student.current_level ?? "—"} />
                  <Info label="Product" value={product?.name ?? "—"} />
                  <Info label="Focus" value={student.focus ?? "—"} />
                  <div>
                    <div className={infoLabelCls}>Access Plan</div>
                    <div className="mt-1.5">
                      {student.access_plan ? (
                        <Tag style={accessPlanPillStyle(student.access_plan)}>{student.access_plan}</Tag>
                      ) : (
                        <span className="text-sm text-foreground">—</span>
                      )}
                    </div>
                  </div>
                  <Info label="Current roadmap level" value={student.current_roadmap_level ?? "—"} />
                  {(() => {
                    const c = effectiveSessionCounts(student.id, { hired: student.hired_sessions, remaining: student.remaining_sessions });
                    return <Info label="Sessions" value={`${c.remaining} remaining / ${c.hired} total`} emphasis />;
                  })()}
                  <Info label="Cadence" value={`${student.sessions_per_week ?? "—"}×/week · ${student.session_duration ?? "—"} min`} />
                  <Info label="Reschedule policy" value={student.reschedule_policy ?? accessPlan?.reschedulePolicy ?? "—"} />
                  <Info label="Next payment" value={nextPay ? nextPay.toLocaleDateString() : "—"} emphasis />
                  {groupInfo && <Info label="Group" value={groupInfo.group.name} />}
                  {(groupInfo?.group.company_client || student.company) && (
                    <Info label="Company" value={groupInfo?.group.company_client ?? student.company ?? "—"} />
                  )}
                </div>
              </Section>

              {/* Entitlements */}
              <Section title="Entitlements" index={1}>
                <div className="space-y-5">
                  <div>
                    <div className={infoLabelCls}>Clubs access</div>
                    <div className="mt-2">
                      {(() => {
                        const tags: React.ReactNode[] = [];
                        const ins = student.addon_insights_per_month ?? 0;
                        const bc = student.addon_bookclubs_per_month ?? 0;
                        const sp = student.addon_spotlight_per_month ?? 0;
                        if (ins > 0) tags.push(<Tag key="ins" className="bg-primary/10 text-primary">Insights · {ins}/month</Tag>);
                        if (bc > 0) tags.push(<Tag key="bc" className="bg-accent/10 text-accent">Book Clubs · {bc}/month</Tag>);
                        if (sp > 0) tags.push(<Tag key="sp" className="bg-secondary text-secondary-foreground">Spotlight · {sp}/month</Tag>);
                        if (student.addon_workshops_enabled) tags.push(<Tag key="ws" className="bg-muted text-muted-foreground">Workshops</Tag>);
                        return tags.length > 0
                          ? <div className="flex flex-wrap gap-2">{tags}</div>
                          : <p className="text-sm text-muted-foreground">No clubs access</p>;
                      })()}
                    </div>
                  </div>

                  {student.contracted_levels && student.contracted_levels.length > 0 && (
                    <div>
                      <div className={infoLabelCls}>Contracted levels</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {student.contracted_levels.map((lvl) => (
                          <Tag key={lvl} className={lvl === student.current_roadmap_level ? "bg-accent/15 text-accent" : "bg-secondary text-secondary-foreground"}>{lvl}</Tag>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* Learning Path — reopen a completed level for read-only review */}
              {student.contracted_levels && student.contracted_levels.length > 0 && (
                <Section
                  title="Learning path"
                  index={2}
                  description="Reopening grants read-only access to a completed level — the student can review content and past scores but cannot redo activities."
                >
                  <div className="space-y-2">
                    {student.contracted_levels.map((lvl) => {
                      const reopened = (student.reopened_levels ?? []).includes(lvl);
                      return (
                        <div key={lvl} className="verbo-sdm-row flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-3.5 py-2.5 hover:border-accent/25">
                          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <RotateCcw className={`h-3.5 w-3.5 shrink-0 ${reopened ? "text-accent" : "text-muted-foreground"}`} />
                            <span className="truncate">{lvl}</span>
                            {reopened && <Tag className="bg-accent/15 text-accent">Reopened for Review</Tag>}
                          </div>
                          <button
                            type="button"
                            onClick={() => { setLevelReopened(student.id, lvl, !reopened); forceTick((n) => n + 1); }}
                            className={`verbo-sdm-action rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                              reopened
                                ? "border-border bg-secondary text-foreground hover:bg-muted"
                                : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/15"
                            }`}
                          >
                            {reopened ? "Close review access" : "Reopen for Review"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Logistics */}
              <Section title="Logistics" index={3}>
                <div className={infoLabelCls}>Video call link</div>
                <div className="verbo-sdm-row mt-2 flex items-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 hover:border-primary/25">
                  <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm text-foreground">{showLink ? student.video_call_link : maskedLink}</span>
                  <button onClick={() => setShowLink((v) => !v)} className="verbo-sdm-action rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Toggle link">
                    {showLink ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button onClick={copyLink} className="verbo-sdm-action rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Copy link">
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </Section>

              {/* Billing */}
              <Section title="Billing" index={4}>
                <div className={infoLabelCls}>Payment history</div>
                <div className="mt-2">
                  {(() => {
                    const payments = loadPayments()
                      .filter((p) => p.entity_type === "individual" && p.entity_id === student.id)
                      .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
                      .slice(0, 5);
                    if (payments.length === 0) {
                      return <p className="text-sm text-muted-foreground">No payments recorded yet.</p>;
                    }
                    return (
                      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
                        {payments.map((p) => (
                          <div key={p.id} className="verbo-sdm-row flex items-center justify-between px-3.5 py-2.5 hover:bg-secondary/40">
                            <span className="text-sm text-muted-foreground">{new Date(p.paid_at).toLocaleDateString()}</span>
                            <span className="text-sm font-semibold tabular-nums text-foreground">${p.amount.toLocaleString()} MXN</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </Section>

              {/* Team */}
              <Section title="Team" index={5}>
                <div className={infoLabelCls}>Assigned teacher(s)</div>
                <div className="mt-2">
                  {teacherHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No sessions on record yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {teacherHistory.map((t) => <Tag key={t.name} className="bg-secondary text-secondary-foreground">{t.name} · {t.count}</Tag>)}
                    </div>
                  )}
                </div>
              </Section>
            </div>
          )}


          {tab === "performance" && <PerformanceTab student={student} />}

          {tab === "progress" && <CourseProgressTab student={student} />}

          {tab === "badges" && <BadgesOverridePanel student={student} />}

          {tab === "reports" && <ReportsTab student={student} />}

          {tab === "notes" && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><ShieldAlert className="h-3.5 w-3.5" /> Internal notes (admin only)</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={7}
                placeholder="Escalations, negotiated exceptions, context for other admins…"
                className={inputCls}
              />
              <div className="mt-3 flex justify-end">
                <PrimaryButton onClick={() => patch({ admin_notes: notes })}>Save notes</PrimaryButton>
              </div>
            </div>
          )}
        </div>

        {/* Inline action panels */}
        {panel === "reassign" && (
          <div className="border-t border-border bg-secondary/30 px-6 py-3">
            <div className="flex items-end gap-2">
              <Field label={`Reassign teacher${product ? ` (qualified for ${product.name})` : ""}`} className="flex-1">
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={`${inputCls} cursor-pointer`}>
                  <option value="">Unassigned</option>
                  {teachersForProductSorted(teachers, student.product || null).map((t) => <option key={t.id} value={t.id}>{t.name} · {teacherTier(t).name}</option>)}
                </select>
              </Field>
              <PrimaryButton onClick={() => { onUpdate(student, teacherId || undefined); setPanel("none"); }}>Apply</PrimaryButton>
            </div>
          </div>
        )}
        {panel === "freeze" && (
          <div className="border-t border-border bg-secondary/30 px-6 py-3">
            <div className="flex items-end gap-2">
              <Field label="Freeze start"><input type="date" value={freezeStart} onChange={(e) => setFreezeStart(e.target.value)} className={inputCls} /></Field>
              <Field label="Freeze end (max 15 days)"><input type="date" value={freezeEnd} onChange={(e) => setFreezeEnd(e.target.value)} className={inputCls} /></Field>
              <PrimaryButton onClick={saveFreeze}>Freeze</PrimaryButton>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/30 px-5 py-4 sm:px-7">
          <GhostButton onClick={onEdit} className="verbo-sdm-action !py-1.5 !text-xs"><Pencil className="h-3.5 w-3.5" /> Edit profile</GhostButton>
          <GhostButton onClick={() => { patch({ must_change_password: true }); alert("This user will be asked to set a new password the next time they log in."); }} className="verbo-sdm-action !py-1.5 !text-xs"><KeyRound className="h-3.5 w-3.5" /> Require Password Reset</GhostButton>
          <button
            onClick={() => setPanel((p) => (p === "reassign" ? "none" : "reassign"))}
            className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-110"
            style={{ backgroundColor: "#0f766e" }}
          >
            <Users className="h-3.5 w-3.5" /> Reassign teacher
          </button>
          <button
            onClick={() => setPanel((p) => (p === "freeze" ? "none" : "freeze"))}
            className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-110"
            style={{ backgroundColor: "#38bdf8" }}
          >
            <Snowflake className="h-3.5 w-3.5" /> Freeze
          </button>
          {student.status === "suspended" ? (
            <GhostButton onClick={() => patch({ status: "active" })} className="verbo-sdm-action !py-1.5 !text-xs"><Play className="h-3.5 w-3.5" /> Reactivate</GhostButton>
          ) : (
            <button
              onClick={() => {
                if (isGrouped) {
                  removeMember(student.id);
                  onClose();
                } else {
                  patch({ status: "suspended" });
                }
              }}
              disabled={isGrouped && groupInfo?.member.status !== "active"}
              className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-sm transition-all hover:brightness-110 disabled:opacity-40"
            >
              <Ban className="h-3.5 w-3.5" /> Suspend
            </button>
          )}
          <button
            onClick={() => blocked && patch({ insights_strikes: 0 })}
            disabled={!blocked}
            className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all enabled:hover:brightness-110 disabled:opacity-40"
            style={{ backgroundColor: "#f38934" }}
          >
            <Unlock className="h-3.5 w-3.5" /> Unlock Insights ({strikes}/{MAX_INSIGHT_STRIKES})
          </button>
          {hasBookClubs && (
            <button
              onClick={() => bcBlocked && patch({ bookclub_strikes: 0 })}
              disabled={!bcBlocked}
              className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all enabled:hover:brightness-110 disabled:opacity-40"
              style={{ backgroundColor: "#0f766e" }}
            >
              <Unlock className="h-3.5 w-3.5" /> Unlock Book Clubs ({bcStrikes}/{MAX_BOOKCLUB_STRIKES})
            </button>
          )}
          {!isGrouped && (
            <button
              onClick={markPaid}
              className="verbo-sdm-action inline-flex items-center justify-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-success-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <CreditCard className="h-3.5 w-3.5" /> Mark as paid
            </button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ---- Course Progress tab: unlock/lock any unit per student ----
function CourseProgressTab({ student }: { student: User }) {
  return <UnitAccessPanel student={student} actorRole="admin" />;
}

function UnitAccessPanel({ student, actorRole }: { student: User; actorRole: "admin" | "teacher" }) {
  const { user: actor } = useAuth();
  const [rev, setRev] = useState(0);
  const [courses, setCourses] = useState(() => loadCourses());
  useEffect(() => {
    setCourses(loadCourses());
    return subscribeCourses(() => { setCourses(loadCourses()); setRev((r) => r + 1); });
  }, []);

  const productMap: Record<string, "go" | "enterprise" | "international"> = {
    go: "go", enterprise: "enterprise", international: "international",
  };
  const productId = student.product ? productMap[student.product] : undefined;
  const product = productId ? courses.find((c) => c.product === productId) : undefined;
  const levels = product?.levels ?? [];
  const initialLevelId = useMemo(() => {
    const match = levels.find((l) => l.name === student.current_roadmap_level);
    return (match ?? levels[0])?.id ?? "";
  }, [levels, student.current_roadmap_level]);
  const [levelId, setLevelId] = useState<string>(initialLevelId);
  useEffect(() => { if (initialLevelId && !levelId) setLevelId(initialLevelId); }, [initialLevelId, levelId]);
  const level: CourseLevel | undefined = levels.find((l) => l.id === levelId) ?? levels[0];

  if (!productId || !product) {
    return (
      <div className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-muted-foreground">
        This student's product does not have a self-study Learning Path (Course Progress applies to GO, Enterprise and International).
      </div>
    );
  }
  if (!level) return null;

  const toggle = (unitId: string, nextAction: "unlocked" | "locked") => {
    if (!actor) return;
    setUnitAccess(student.id, unitId, nextAction, actor.id, actorRole);
    setRev((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Unlock or lock any unit for this student. Milestone units (10, 20, 30) are locked by default until unlocked here.
        </p>
        <select
          value={level.id}
          onChange={(e) => setLevelId(e.target.value)}
          className={`${inputCls} max-w-xs cursor-pointer`}
        >
          {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-background">
        {level.units.map((u) => {
          const milestone = isMilestoneUnit(u.id);
          const ov = getUnitAccessOverride(student.id, u.id);
          const isUnlocked = ov === "unlocked" || (!milestone && ov === null);
          const stateLabel =
            ov === "unlocked" ? "Unlocked"
            : ov === "locked" ? "Locked"
            : milestone ? "Locked (default)" : "Unlocked (default)";
          const badgeCls =
            ov === "unlocked" ? "bg-success/10 text-success"
            : ov === "locked" ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-muted-foreground";
          const _ = rev; void _;
          return (
            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground">{u.id}</span>
                  {milestone && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      <Trophy className="h-3 w-3" /> Milestone
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>{stateLabel}</span>
                </div>
                <div className="mt-0.5 truncate text-sm text-foreground">{u.title}</div>
              </div>
              <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() => toggle(u.id, "unlocked")}
                  aria-pressed={isUnlocked}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${isUnlocked ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <UnlockIcon className="h-3.5 w-3.5" /> Unlock
                </button>
                <button
                  type="button"
                  onClick={() => toggle(u.id, "locked")}
                  aria-pressed={!isUnlocked}
                  className={`inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs font-medium transition-colors ${!isUnlocked ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  <LockIcon className="h-3.5 w-3.5" /> Lock
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Badges tab: manually grant any badge, or return it to automatic rules ----
function BadgesOverridePanel({ student }: { student: User }) {
  const { user: actor } = useAuth();
  const [rev, setRev] = useState(0);
  const profileBadges = useMemo(() => loadProfileBadgeCatalog(), []);
  const challengeBadges = useMemo(() => loadChallengeBadgeCatalog(), []);

  const toggle = (badgeId: string, system: BadgeSystem, action: "granted" | "revoked") => {
    if (!actor) return;
    setBadgeOverride(student.id, badgeId, system, action, actor.id);
    setRev((r) => r + 1);
  };

  const renderRow = (b: ProfileBadgeDef | ChallengeBadgeDef, system: BadgeSystem) => {
    const ov = getBadgeOverride(student.id, b.id, system);
    const granted = ov === "granted";
    const stateLabel = ov === "granted" ? "Granted" : ov === "revoked" ? "Auto (revoked)" : "Auto (default)";
    const badgeCls = granted ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground";
    const _ = rev; void _;
    return (
      <div key={`${system}-${b.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground">{b.id}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeCls}`}>{stateLabel}</span>
          </div>
          <div className="mt-0.5 truncate text-sm text-foreground">{b.name}</div>
        </div>
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={() => toggle(b.id, system, "granted")}
            aria-pressed={granted}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${granted ? "bg-success/15 text-success" : "text-muted-foreground hover:bg-secondary"}`}
          >
            <UnlockIcon className="h-3.5 w-3.5" /> Grant
          </button>
          <button
            type="button"
            onClick={() => toggle(b.id, system, "revoked")}
            aria-pressed={!granted}
            className={`inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs font-medium transition-colors ${!granted ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:bg-secondary"}`}
          >
            <LockIcon className="h-3.5 w-3.5" /> Auto
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Grant a badge manually when the student earned it outside the platform. "Auto" returns the badge to its normal rule-based evaluation.
      </p>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Profile Badges
        </p>
        {profileBadges.length === 0 ? (
          <div className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-muted-foreground">No profile badges configured yet.</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-background">
            {profileBadges.map((b) => renderRow(b, "profile"))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Trophy className="h-3.5 w-3.5" /> Challenge Badges
        </p>
        {challengeBadges.length === 0 ? (
          <div className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-muted-foreground">No challenge badges configured yet.</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-background">
            {challengeBadges.map((b) => renderRow(b, "challenge"))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Reports tab (read-only teacher reports for this student) ----
function ReportsTab({ student }: { student: User }) {
  const [, forceTick] = useState(0);
  useEffect(() => subscribeStudentReports(() => forceTick((n) => n + 1)), []);
  const reports = reportsForStudent(student.id);
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">No reports yet.</p>;
  }
  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const teacher = USERS.find((u) => u.id === r.teacher_id);
        return (
          <div key={r.id} className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">{teacher?.name ?? "Teacher"}</div>
              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{r.text}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---- Performance tab (mock data for now) ----
function PerformanceTab({ student }: { student: User }) {
  const rows = SESSIONS.filter((s) => s.student_id === student.id);
  const { completed, absent, pct: attendance } = studentAttendance(SESSIONS, student);
  const ratings = rows
    .filter((s) => (s.review_status ?? "pending") !== "discarded")
    .map((s) => s.student_rating)
    .filter((r): r is number => typeof r === "number");
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Attendance" value={`${attendance}%`} />
        <Stat label="Completed" value={String(completed)} />
        <Stat label="Absences" value={String(absent)} />
        <Stat label="Avg. rating given" value={avgRating} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

const infoLabelCls = "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80";

function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={infoLabelCls}>{label}</div>
      <div className={`mt-1 break-words ${emphasis ? "text-[15px] font-semibold tabular-nums text-foreground" : "text-sm font-normal text-foreground/90"}`}>{value}</div>
    </div>
  );
}

/** Titled block: a hairline rule + heavier heading makes section edges obvious. */
function Section({
  title, description, index = 0, children,
}: { title: string; description?: string; index?: number; children: React.ReactNode }) {
  return (
    <section className="verbo-sdm-section" style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}>
      <div className="mb-3.5 flex items-center gap-3">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-foreground">{title}</h3>
        <span className="h-px flex-1 bg-border" />
      </div>
      {description && <p className="mb-3 max-w-prose text-xs leading-relaxed text-muted-foreground">{description}</p>}
      {children}
    </section>
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

function ModalHeader({ kicker, title, onClose }: { kicker: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between border-b border-border px-6 py-5" style={{ background: "linear-gradient(135deg, #01304a 0%, #02466b 100%)" }}>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">{kicker}</div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">{title}</h2>
      </div>
      <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{n}</span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function Field({
  label, icon, children, className,
}: {
  label: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </label>
      {children}
    </div>
  );
}

// ===========================================================================
// Cohort chips picker — READS the workshops store (source of truth) and
// returns the selected cohort ids to the parent form. It never persists on
// its own; the parent syncs memberships on save.
// ===========================================================================
function CohortChipsPicker({ selectedIds, currentUserId, onChange }: {
  selectedIds: string[];
  currentUserId?: string;
  onChange: (ids: string[]) => void;
}) {
  const [templates, setTemplates] = useState<WorkshopTemplate[]>(loadWorkshops);
  useEffect(() => {
    setTemplates(loadWorkshops());
    return subscribeWorkshops(() => setTemplates(loadWorkshops()));
  }, []);

  const all = useMemo(() => {
    const list: { id: string; label: string; cohort: WorkshopCohort; full: boolean }[] = [];
    for (const t of templates) {
      for (const c of t.cohorts) {
        const includesMe = !!currentUserId && c.participants.some((p) => p.id === currentUserId);
        const full = !includesMe && c.participants.length >= 4;
        list.push({ id: c.id, label: `${t.name} — ${c.name || "Untitled cohort"}`, cohort: c, full });
      }
    }
    return list;
  }, [templates, currentUserId]);

  const selectedSet = new Set(selectedIds);
  const available = all.filter((x) => !selectedSet.has(x.id));

  return (
    <div className="space-y-2">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const item = all.find((x) => x.id === id);
            const label = item ? item.label : id;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                {label}
                <button type="button" onClick={() => onChange(selectedIds.filter((x) => x !== id))} className="ml-1 opacity-70 hover:opacity-100" aria-label="Remove cohort">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      {all.length === 0 ? (
        <p className="text-xs text-muted-foreground">No cohorts yet. Create one in Admin → Focus Workshops.</p>
      ) : available.length === 0 ? (
        <p className="text-xs text-muted-foreground">This person is already enrolled in every available cohort.</p>
      ) : (
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onChange([...selectedIds, v]);
          }}
          className={`${inputCls} cursor-pointer`}
        >
          <option value="">Add cohort…</option>
          {available.map((x) => (
            <option key={x.id} value={x.id} disabled={x.full}>
              {x.label}{x.full ? " · full" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
