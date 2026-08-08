import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, X, Users as UsersIcon, Building2, CreditCard, Trash2, RotateCcw,
  ArrowRightLeft, Archive, ChevronRight, ShieldAlert, CalendarClock,
  GraduationCap, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { USERS, ASSIGNMENTS, userById, type User } from "@/lib/mock-data";
import {
  PRODUCTS, ACCESS_PLAN_IDS, RESCHEDULE_PRESETS, SESSIONS_PER_LEVEL,
  MAX_INSIGHT_STRIKES, MAX_BOOKCLUB_STRIKES, getProduct, getAccessPlan,
  nextPaymentDate, daysUntil, paymentUrgency,
  type ProductId, type AccessPlanId,
  accessPlanPillStyle,
} from "@/lib/student-model";
import { teachersForProduct, hydrateTeachers } from "@/lib/teacher-model";
import {
  loadGroups, loadGroupMembers, subscribeGroups, registerGroupWithMembers,
  updateGroup, addMember, removeMember, restoreMember, archiveMember,
  moveMember, markGroupAsPaid, activeMembersOf, membersOf, pendingCountdownDays,
  groupById, sessionProgressFor, type Group, type GroupMember,
} from "@/lib/groups-store";
import { Card, GhostButton, PrimaryButton, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import { loadSessions, addGroupSession, type ExtSession } from "@/lib/sessions-store";
import { loadHolidays } from "@/lib/holidays-store";
import { RescheduleModal } from "@/components/verbo/RescheduleModal";
import { CalendarPlus, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/groups")({ component: Page });

// -----------------------------------------------------------------------------
// Page shell — Groups list + Recycle Bin tab
// -----------------------------------------------------------------------------
function Page() {
  const [tab, setTab] = useState<"groups" | "bin">("groups");
  const [, tick] = useState(0);
  const [openRegister, setOpenRegister] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    hydrateTeachers();
    tick((n) => n + 1);
    return subscribeGroups(() => tick((n) => n + 1));
  }, []);

  const groups = loadGroups();
  const members = loadGroupMembers();
  const archivedCount = members.filter((m) => m.status === "archived").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage corporate groups sharing one live Performance Session.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton onClick={() => setTab(tab === "bin" ? "groups" : "bin")}>
            {tab === "bin" ? "Back to Groups" : `Recycle Bin (${archivedCount})`}
          </GhostButton>
          <PrimaryButton onClick={() => setOpenRegister(true)}>
            <Plus className="h-4 w-4" /> Register Group
          </PrimaryButton>
        </div>
      </div>

      {tab === "groups" ? (
        <GroupList groups={groups} onOpen={(id) => setDetailId(id)} />
      ) : (
        <RecycleBin onRestore={() => tick((n) => n + 1)} />
      )}

      {openRegister && (
        <RegisterGroupModal onClose={() => setOpenRegister(false)} onSaved={() => { setOpenRegister(false); tick((n) => n + 1); }} />
      )}

      {detailId && (
        <GroupDetailModal groupId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Grid of Groups (each behaves like "one student" for admin payment/progress)
// -----------------------------------------------------------------------------
function GroupList({ groups, onOpen }: { groups: Group[]; onOpen: (id: string) => void }) {
  if (groups.length === 0) {
    return (
      <Card className="py-14 text-center">
        <UsersIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm font-medium text-foreground">No groups yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Register a Group to start managing shared corporate classes.</p>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => <GroupCard key={g.id} group={g} onOpen={() => onOpen(g.id)} />)}
    </div>
  );
}

function GroupCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const active = activeMembersOf(group.id).length;
  const product = getProduct(group.product);
  const hired = group.hired_sessions ?? 0;
  const remaining = group.remaining_sessions ?? 0;
  const { done, pct } = sessionProgressFor(hired, remaining);
  const nextPay = group.next_payment
    ? new Date(group.next_payment)
    : group.payment_day ? nextPaymentDate(group.payment_day, new Date()) : null;
  const payState = paymentUrgency(nextPay);
  const payDue = payState !== null;
  const overdue = payState === "overdue";

  const mark = (e: React.MouseEvent) => {
    e.stopPropagation();
    markGroupAsPaid(group.id);
    toast.success("Group marked as paid");
  };

  return (
    <button
      onClick={onOpen}
      className={`group relative flex flex-col rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated ${overdue ? "verbo-pay-overdue-glow" : payDue ? "verbo-pay-glow" : ""}`}
    >
      {payDue && (
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${overdue ? "text-white" : "bg-destructive/10 text-destructive"}`}
          style={overdue ? { background: "#b52904" } : undefined}
        >
          <CreditCard className="h-3 w-3" /> {overdue ? "Overdue" : "Payment due"}
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#01304a] text-white">
          <UsersIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{group.name}</div>
          <div className="truncate text-xs text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3" /> {group.company_client}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {product && <Tag className="bg-primary/10 text-primary">{product.name}</Tag>}
        {group.access_plan && <Tag style={accessPlanPillStyle(group.access_plan)}>{group.access_plan}</Tag>}
        {group.current_roadmap_level && <Tag className="bg-muted text-muted-foreground">{group.current_roadmap_level}</Tag>}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Sessions</span>
          <span className="font-medium text-foreground">{remaining}/{hired}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Tag className="bg-secondary text-secondary-foreground">{active}/{group.max_capacity} members</Tag>
        <button
          type="button"
          onClick={mark}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary/60"
        >
          <CreditCard className="h-3 w-3" /> Mark as Paid
        </button>
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

// -----------------------------------------------------------------------------
// Register Group Modal
// -----------------------------------------------------------------------------
type NewMember = { name: string; email: string; password: string; member_since: string };

function RegisterGroupModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(4);
  const [members, setMembers] = useState<NewMember[]>([
    { name: "", email: "", password: "", member_since: "" },
    { name: "", email: "", password: "", member_since: "" },
  ]);
  const [product, setProduct] = useState<ProductId | "">("");
  const [accessPlan, setAccessPlan] = useState<AccessPlanId | "">("");
  const [level, setLevel] = useState("");
  const [hiredSessions, setHiredSessions] = useState(0);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(2);
  const [sessionDuration, setSessionDuration] = useState(60);
  const [reschedulePolicy, setReschedulePolicy] = useState("");
  const [paymentDay, setPaymentDay] = useState(1);
  const [cycleStart, setCycleStart] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [addonInsights, setAddonInsights] = useState(0);
  const [addonBookclubs, setAddonBookclubs] = useState(0);
  const [addonSpotlight, setAddonSpotlight] = useState(0);

  // VIP is intentionally excluded — VIP is always Individual.
  const productOptions = PRODUCTS.filter((p) => p.id !== "vip");
  const productLevels = getProduct(product)?.levels ?? [];
  const allTeachers = USERS.filter((u) => u.role === "teacher");
  const teachers = product ? teachersForProduct(allTeachers, product as ProductId) : allTeachers;

  const setMember = (i: number, patch: Partial<NewMember>) => {
    setMembers((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };
  const addMemberRow = () => {
    if (members.length >= maxCapacity) return;
    setMembers((prev) => [...prev, { name: "", email: "", password: "", member_since: "" }]);
  };
  const removeMemberRow = (i: number) => {
    if (members.length <= 2) return;
    setMembers((prev) => prev.filter((_, idx) => idx !== i));
  };

  const validMembers = members.every((m) => m.name.trim() && m.email.trim() && m.password.trim());
  const isValid = name.trim() && company.trim() && members.length >= 2 && validMembers
    && product && videoLink.trim();

  const handleSave = () => {
    if (!isValid) return;
    registerGroupWithMembers(
      {
        name: name.trim(),
        company_client: company.trim(),
        max_capacity: Math.max(2, maxCapacity),
        product_type: "performance",
        product: product as ProductId,
        access_plan: (accessPlan || undefined) as AccessPlanId | undefined,
        current_roadmap_level: level || productLevels[0],
        contracted_levels: productLevels,
        hired_sessions: hiredSessions || 0,
        remaining_sessions: hiredSessions || 0,
        sessions_per_week: sessionsPerWeek,
        session_duration: sessionDuration,
        reschedule_policy: reschedulePolicy || undefined,
        payment_day: paymentDay,
        cycle_start: cycleStart || undefined,
        video_call_link: videoLink.trim(),
        teacher_id: teacherId || undefined,
        addon_insights_per_month: addonInsights,
        addon_bookclubs_per_month: addonBookclubs,
        addon_spotlight_per_month: addonSpotlight,
        addon_workshops_enabled: false,
      },
      members,
    );
    toast.success(`Group "${name}" registered with ${members.length} members`);
    onSaved();
  };

  return (
    <AccentModal
      background="linear-gradient(135deg, #7cd7cb 0%, #3ebbad 100%)"
      textTone="dark"
      iconTint="#3ebbad"
      icon={UsersIcon}
      eyebrow="New registration"
      title="Register Group"
      watermark={{ type: "text", value: "GROUP" }}
      maxWidth="max-w-2xl"
      onClose={onClose}
    >
      <div className="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-6">
        <div className="space-y-4">
          <GroupSectionBanner color="#01304a" textColor="#ffffff" icon={Building2} title="Group Info" />
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Registration Type</div>
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              <span className="rounded-md px-3 py-1 text-xs font-semibold text-muted-foreground">Individual</span>
              <span className="rounded-md bg-[#01304a] px-3 py-1 text-xs font-semibold text-white">Group</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Individual registration lives in Admin &gt; Students.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Group Name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp – Core Group A" />
            </Field>
            <Field label="Company / Client">
              <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" />
            </Field>
            <Field label="Max Capacity">
              <input type="number" min={2} className={inputCls} value={maxCapacity} onChange={(e) => setMaxCapacity(Math.max(2, Number(e.target.value) || 2))} />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <GroupSectionBanner color="#3ebbad" textColor="#0b2b28" icon={UsersIcon} title="Group Members" className="flex-1" />
            <button
              type="button"
              onClick={addMemberRow}
              disabled={members.length >= maxCapacity}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> Add Member
            </button>
          </div>
          <div className="space-y-3">
            {members.map((m, i) => (
              <div key={i} className="rounded-lg border border-border border-l-4 border-l-[#3ebbad] bg-background p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "#3ebbad", color: "#0b2b28" }}>
                    Member #{i + 1}
                  </span>
                  {members.length > 2 && (
                    <button onClick={() => removeMemberRow(i)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input className={inputCls} placeholder="Student Name" value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} />
                  <input className={inputCls} placeholder="Email" value={m.email} onChange={(e) => setMember(i, { email: e.target.value })} />
                  <input className={inputCls} placeholder="Initial Password" value={m.password} onChange={(e) => setMember(i, { password: e.target.value })} />
                  <input type="date" className={inputCls} value={m.member_since} onChange={(e) => setMember(i, { member_since: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <GroupSectionBanner color="#d97706" textColor="#ffffff" icon={GraduationCap} title="Program & Plan" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Product">
              <select className={inputCls} value={product} onChange={(e) => setProduct(e.target.value as ProductId)}>
                <option value="">Select product</option>
                {productOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Access Plan">
              <select className={inputCls} value={accessPlan} onChange={(e) => setAccessPlan(e.target.value as AccessPlanId)}>
                <option value="">Select plan</option>
                {ACCESS_PLAN_IDS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Initial English Level">
              <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Select level</option>
                {productLevels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Hired Sessions">
              <input type="number" min={0} className={inputCls} value={hiredSessions} onChange={(e) => setHiredSessions(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Sessions per Week">
              <input type="number" min={1} className={inputCls} value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(Number(e.target.value) || 1)} />
            </Field>
            <Field label="Session Duration (min)">
              <input type="number" min={15} className={inputCls} value={sessionDuration} onChange={(e) => setSessionDuration(Number(e.target.value) || 60)} />
            </Field>
            <Field label="Rescheduling Policy">
              <select className={inputCls} value={reschedulePolicy} onChange={(e) => setReschedulePolicy(e.target.value)}>
                <option value="">Select policy</option>
                {RESCHEDULE_PRESETS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Payment Day">
              <input type="number" min={1} max={31} className={inputCls} value={paymentDay} onChange={(e) => setPaymentDay(Number(e.target.value) || 1)} />
            </Field>
            <Field label="Cycle Start">
              <input type="date" className={inputCls} value={cycleStart} onChange={(e) => setCycleStart(e.target.value)} />
            </Field>
            <Field label="Video Call Link">
              <input className={inputCls} value={videoLink} onChange={(e) => setVideoLink(e.target.value)} placeholder="https://teams.microsoft.com/…" />
            </Field>
            <Field label="Assign Teacher">
              <select className={inputCls} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Select teacher</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          <GroupSectionBanner color="#7e22ce" textColor="#ffffff" icon={Sparkles} title="Add-on Access (per member, per month)" />
          <div className="grid grid-cols-3 gap-3">
            <Field label="Insights / month">
              <input type="number" min={0} className={inputCls} value={addonInsights} onChange={(e) => setAddonInsights(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Book Clubs / month">
              <input type="number" min={0} className={inputCls} value={addonBookclubs} onChange={(e) => setAddonBookclubs(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Spotlight / month">
              <input type="number" min={0} className={inputCls} value={addonSpotlight} onChange={(e) => setAddonSpotlight(Number(e.target.value) || 0)} />
            </Field>
          </div>
        </div>
      </div>

      <AccentModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton
          accentColor="#5fca16"
          className={`hover:!bg-[#4fb010] ${!isValid ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={handleSave}
          disabled={!isValid}
        >
          Register Group
        </PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}

function GroupSectionBanner({
  color, textColor, icon: Icon, title, className = "",
}: { color: string; textColor: string; icon: LucideIcon; title: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${className}`} style={{ background: color }}>
      <Icon className="h-3.5 w-3.5" style={{ color: textColor }} />
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: textColor }}>{title}</span>
    </div>
  );
}


function GroupRescheduleButton({ groupId }: { groupId: string }) {
  const [session, setSession] = useState<ExtSession | null>(null);
  const [open, setOpen] = useState(false);
  const nextSession = loadSessions()
    .filter((s) => s.group_id === groupId && ["scheduled", "ready", "rescheduled", "rearranged"].includes(s.status))
    .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time))[0];

  return (
    <>
      <GhostButton
        onClick={() => { if (nextSession) { setSession(nextSession); setOpen(true); } }}
        className="!py-1.5"
      >
        <CalendarClock className="h-3.5 w-3.5" /> Request Reschedule
      </GhostButton>
      {open && session && (
        <RescheduleModal session={session} kind="group" onClose={() => { setOpen(false); setSession(null); }} />
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Group Detail Modal — edit shared fields + roster management
// -----------------------------------------------------------------------------
function GroupDetailModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => subscribeGroups(() => tick((n) => n + 1)), []);
  const g = groupById(groupId);
  if (!g) return null;

  const members = membersOf(groupId);
  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending_removal");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);

  const patchField = <K extends keyof Group>(k: K, v: Group[K]) => {
    updateGroup(groupId, { [k]: v } as Partial<Group>);
  };

  const productLevels = getProduct(g.product)?.levels ?? [];
  const allTeachers = USERS.filter((u) => u.role === "teacher");
  const teachersForField = g.product ? teachersForProduct(allTeachers, g.product) : allTeachers;

  const hired = g.hired_sessions ?? 0;
  const remaining = g.remaining_sessions ?? 0;
  const { pct } = sessionProgressFor(hired, remaining);

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-floating">
        <ModalHeader kicker={g.company_client} title={g.name} onClose={onClose} />
        <div className="max-h-[78vh] space-y-6 overflow-y-auto px-6 py-6">
          {/* Shared fields */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Group Name">
              <input className={inputCls} value={g.name} onChange={(e) => patchField("name", e.target.value)} />
            </Field>
            <Field label="Company / Client">
              <input className={inputCls} value={g.company_client} onChange={(e) => patchField("company_client", e.target.value)} />
            </Field>
            <Field label="Max Capacity">
              <input type="number" min={Math.max(2, active.length)} className={inputCls} value={g.max_capacity} onChange={(e) => patchField("max_capacity", Math.max(active.length, Number(e.target.value) || 2))} />
            </Field>
            <Field label="Access Plan">
              <select className={inputCls} value={g.access_plan ?? ""} onChange={(e) => patchField("access_plan", (e.target.value || undefined) as AccessPlanId | undefined)}>
                <option value="">—</option>
                {ACCESS_PLAN_IDS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Product">
              <select className={inputCls} value={g.product ?? ""} onChange={(e) => {
                const p = (e.target.value || undefined) as ProductId | undefined;
                const levels = p ? getProduct(p)?.levels ?? [] : [];
                updateGroup(groupId, {
                  product: p,
                  contracted_levels: levels,
                  current_roadmap_level: levels[0],
                });
              }}>
                <option value="">—</option>
                {PRODUCTS.filter((p) => p.id !== "vip").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Initial English Level">
              <select className={inputCls} value={g.current_roadmap_level ?? ""} onChange={(e) => patchField("current_roadmap_level", e.target.value || undefined)}>
                <option value="">—</option>
                {productLevels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Hired Sessions">
              <input type="number" min={0} className={inputCls} value={g.hired_sessions} onChange={(e) => {
                const hired = Number(e.target.value) || 0;
                const remaining = Math.min(g.remaining_sessions ?? 0, hired);
                updateGroup(groupId, { hired_sessions: hired, remaining_sessions: remaining });
              }} />
            </Field>
            <Field label="Remaining Sessions">
              <input type="number" min={0} className={inputCls} value={g.remaining_sessions} onChange={(e) => patchField("remaining_sessions", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Sessions per Week">
              <input type="number" min={1} className={inputCls} value={g.sessions_per_week ?? 1} onChange={(e) => patchField("sessions_per_week", Number(e.target.value) || 1)} />
            </Field>
            <Field label="Session Duration (min)">
              <input type="number" min={15} className={inputCls} value={g.session_duration ?? 60} onChange={(e) => patchField("session_duration", Number(e.target.value) || 60)} />
            </Field>
            <Field label="Rescheduling Policy">
              <select className={inputCls} value={g.reschedule_policy ?? ""} onChange={(e) => patchField("reschedule_policy", e.target.value || undefined)}>
                <option value="">—</option>
                {RESCHEDULE_PRESETS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Payment Day">
              <input type="number" min={1} max={31} className={inputCls} value={g.payment_day ?? 1} onChange={(e) => patchField("payment_day", Number(e.target.value) || 1)} />
            </Field>
            <Field label="Cycle Start">
              <input type="date" className={inputCls} value={g.cycle_start ?? ""} onChange={(e) => patchField("cycle_start", e.target.value || undefined)} />
            </Field>
            <Field label="Video Call Link">
              <input className={inputCls} value={g.video_call_link ?? ""} onChange={(e) => patchField("video_call_link", e.target.value)} />
            </Field>
            <Field label="Assign Teacher">
              <select className={inputCls} value={g.teacher_id ?? ""} onChange={(e) => patchField("teacher_id", e.target.value || undefined)}>
                <option value="">Unassigned</option>
                {teachersForField.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Add-on Access (per member, per month)</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Insights / month">
                <input type="number" min={0} className={inputCls} value={g.addon_insights_per_month ?? 0} onChange={(e) => patchField("addon_insights_per_month", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Book Clubs / month">
                <input type="number" min={0} className={inputCls} value={g.addon_bookclubs_per_month ?? 0} onChange={(e) => patchField("addon_bookclubs_per_month", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Spotlight / month">
                <input type="number" min={0} className={inputCls} value={g.addon_spotlight_per_month ?? 0} onChange={(e) => patchField("addon_spotlight_per_month", Number(e.target.value) || 0)} />
              </Field>
            </div>
          </div>

          <Card className="!p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground">Progress</div>
              <div className="flex gap-2">
                <GroupRescheduleButton groupId={groupId} />
                <PrimaryButton onClick={() => { markGroupAsPaid(groupId); toast.success("Group marked as paid"); }}>
                  <CreditCard className="h-4 w-4" /> Mark as Paid
                </PrimaryButton>
              </div>
            </div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Sessions</span>
              <span className="font-medium text-foreground">{remaining}/{hired}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </Card>

          {/* Schedule Sessions — group-level bulk generator. Mirrors the
              recurrence + holiday-cascade UX of the Bulk Scheduler on
              Admin > Sessions, but produces ONE group session per date. */}
          <GroupBulkScheduler groupId={groupId} />


          {/* Roster */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Members ({active.length}/{g.max_capacity} active)
              </div>
              <AddExistingMemberButton groupId={groupId} disabled={active.length >= g.max_capacity} />
            </div>
            <div className="space-y-2">
              {[...active, ...pending, ...members.filter((m) => m.status === "archived")].map((m) => (
                <MemberRow
                  key={m.student_id}
                  member={m}
                  onRemove={() => setConfirmRemove(m.student_id)}
                  onMove={() => setMoveFor(m.student_id)}
                  onRestore={() => {
                    const r = restoreMember(m.student_id);
                    if (!r.ok) toast.error(r.reason || "Cannot restore");
                    else toast.success("Member restored");
                  }}
                  onArchive={() => { archiveMember(m.student_id); toast.success("Member archived"); }}
                />
              ))}
              {members.length === 0 && (
                <p className="text-xs text-muted-foreground">No members yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove from Group"
          message={`This member will enter a 30-day grace period as "Pending Removal". Their spot is freed immediately and they lose platform access, but you can Restore them within 30 days. This is different from vacation "Frozen" status.`}
          confirmLabel="Remove from Group"
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => { removeMember(confirmRemove); setConfirmRemove(null); toast.success("Member moved to Pending Removal"); }}
        />
      )}

      {moveFor && (
        <MoveToGroupModal
          studentId={moveFor}
          currentGroupId={groupId}
          onClose={() => setMoveFor(null)}
          onMoved={() => { setMoveFor(null); tick((n) => n + 1); }}
        />
      )}
    </Overlay>
  );
}

function MemberRow({ member, onRemove, onMove, onRestore, onArchive }: {
  member: GroupMember;
  onRemove: () => void;
  onMove: () => void;
  onRestore: () => void;
  onArchive: () => void;
}) {
  const user = userById(member.student_id);
  if (!user) return null;
  const insights = user.insights_strikes ?? 0;
  const bookclubs = user.bookclub_strikes ?? 0;
  const days = pendingCountdownDays(member);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="bg-secondary text-secondary-foreground">Insights {insights}/{MAX_INSIGHT_STRIKES}</Tag>
        <Tag className="bg-secondary text-secondary-foreground">Book Clubs {bookclubs}/{MAX_BOOKCLUB_STRIKES}</Tag>
        {member.status === "active" && <Tag className="bg-success/10 text-success">Active</Tag>}
        {member.status === "pending_removal" && (
          <Tag className="bg-destructive/10 text-destructive">Pending Removal · {days} days left to restore</Tag>
        )}
        {member.status === "archived" && <Tag className="bg-muted text-muted-foreground">Archived</Tag>}
      </div>
      <div className="flex items-center gap-1.5">
        {member.status === "active" && (
          <>
            <button onClick={onMove} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-secondary/60">
              <ArrowRightLeft className="h-3 w-3" /> Move to Group
            </button>
            <button onClick={onRemove} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10">
              <Trash2 className="h-3 w-3" /> Remove from Group
            </button>
          </>
        )}
        {member.status === "pending_removal" && (
          <>
            <button onClick={onRestore} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-secondary/60">
              <RotateCcw className="h-3 w-3" /> Restore
            </button>
            <button onClick={onArchive} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-secondary/60">
              <Archive className="h-3 w-3" /> Archive Now
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AddExistingMemberButton({ groupId, disabled }: { groupId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");

  const eligible = USERS.filter((u) => u.role === "student"
    && !loadGroupMembers().some((m) => m.student_id === u.id && m.status !== "archived"));

  const handleAdd = () => {
    if (!studentId) return;
    const r = addMember(groupId, { student_id: studentId });
    if (!r) toast.error("Could not add member — group is full");
    else { toast.success("Member added"); setOpen(false); setStudentId(""); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground disabled:opacity-40"
      >
        <Plus className="h-3 w-3" /> Add Member
      </button>
      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
            <ModalHeader kicker="Roster" title="Add Member" onClose={() => setOpen(false)} />
            <div className="p-6 space-y-3">
              <Field label="Select existing student">
                <select className={inputCls} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">—</option>
                  {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.email}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/50 px-6 py-3">
              <GhostButton onClick={() => setOpen(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={handleAdd} disabled={!studentId}>Add</PrimaryButton>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}

function MoveToGroupModal({ studentId, currentGroupId, onClose, onMoved }: {
  studentId: string;
  currentGroupId: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const current = groupById(currentGroupId);
  const [target, setTarget] = useState("");
  const candidates = loadGroups().filter((g) =>
    g.id !== currentGroupId
    && current
    && g.company_client === current.company_client
    && activeMembersOf(g.id).length < g.max_capacity,
  );

  const handleMove = () => {
    if (!target) return;
    const r = moveMember(studentId, target);
    if (!r.ok) toast.error(r.reason || "Could not move");
    else { toast.success("Member moved"); onMoved(); }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
        <ModalHeader kicker="Move" title="Move to Group" onClose={onClose} />
        <div className="space-y-3 p-6">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other groups from <b>{current?.company_client}</b> have available spots.
            </p>
          ) : (
            <Field label={`Target group (${current?.company_client})`}>
              <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">—</option>
                {candidates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {activeMembersOf(g.id).length}/{g.max_capacity} · {g.access_plan ?? ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="text-[11px] text-muted-foreground">
            The member will adopt the new group's teacher, schedule, Video Call Link, Access Plan and Add-on Access. Their history and strike counters stay with them.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/50 px-6 py-3">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleMove} disabled={!target}>Move</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

// -----------------------------------------------------------------------------
// Recycle Bin — archived members, read-only history
// -----------------------------------------------------------------------------
function RecycleBin({ onRestore }: { onRestore: () => void }) {
  const archived = loadGroupMembers().filter((m) => m.status === "archived");
  const [restoreFor, setRestoreFor] = useState<string | null>(null);

  if (archived.length === 0) {
    return (
      <Card className="py-14 text-center">
        <Archive className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm font-medium text-foreground">Recycle Bin is empty</p>
        <p className="mt-1 text-xs text-muted-foreground">Archived members appear here with full attendance and evaluation history.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {archived.map((m) => {
        const u = userById(m.student_id);
        const g = groupById(m.group_id);
        return (
          <Card key={m.student_id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">{u?.name ?? "Unknown"}</div>
              <div className="text-xs text-muted-foreground">
                {u?.email} · Prior group: {g?.name ?? "—"} ({g?.company_client ?? "—"})
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Archived {m.archived_at ? new Date(m.archived_at).toLocaleDateString() : "—"}
              </div>
            </div>
            <button
              onClick={() => setRestoreFor(m.student_id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/60"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restore
            </button>
          </Card>
        );
      })}

      {restoreFor && (
        <RestoreArchivedModal
          studentId={restoreFor}
          onClose={() => setRestoreFor(null)}
          onDone={() => { setRestoreFor(null); onRestore(); }}
        />
      )}
    </div>
  );
}

function RestoreArchivedModal({ studentId, onClose, onDone }: { studentId: string; onClose: () => void; onDone: () => void }) {
  const [target, setTarget] = useState("");
  const groups = loadGroups().filter((g) => activeMembersOf(g.id).length < g.max_capacity);

  const handleRestore = () => {
    if (!target) return;
    const r = moveMember(studentId, target);
    if (!r.ok) toast.error(r.reason || "Could not restore");
    else { toast.success("Member restored"); onDone(); }
  };

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
        <ModalHeader kicker="Archive" title="Restore Member" onClose={onClose} />
        <div className="space-y-3 p-6">
          <Field label="Assign to group (must have capacity)">
            <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">—</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.company_client} · {activeMembersOf(g.id).length}/{g.max_capacity}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/50 px-6 py-3">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={handleRestore} disabled={!target}>Restore</PrimaryButton>
        </div>
      </div>
    </Overlay>
  );
}

// -----------------------------------------------------------------------------
// Shared modal primitives (small, local copies to keep this file self-contained)
// -----------------------------------------------------------------------------
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function ModalHeader({ kicker, title, onClose }: { kicker?: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between border-b border-border bg-secondary/50 px-6 py-4">
      <div>
        {kicker && <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</div>}
        <div className="text-lg font-semibold text-foreground">{title}</div>
      </div>
      <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function ConfirmModal({ title, message, confirmLabel, onCancel, onConfirm }: {
  title: string; message: string; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-floating">
        <div className="border-b border-border bg-secondary/50 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            <div className="text-lg font-semibold text-foreground">{title}</div>
          </div>
        </div>
        <div className="p-6 text-sm text-muted-foreground">{message}</div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/50 px-6 py-3">
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
          <button onClick={onConfirm} className="inline-flex items-center gap-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-opacity hover:opacity-90">
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
// ---------------------------------------------------------------------------
// Group Bulk Scheduler — mirrors the Bulk Scheduler on Admin > Sessions
// (recurrence + holiday cascade), but generates ONE group session per date
// via `addGroupSession`. Consumes the group's shared Remaining counter.
// ---------------------------------------------------------------------------
const GBS_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GBS_DAY_INDEX = [1, 2, 3, 4, 5, 6];
const GBS_BRAND = "#01304a";
const GBS_ORANGE = "#f38934";

function GroupBulkScheduler({ groupId }: { groupId: string }) {
  const g = groupById(groupId);
  const [, tick] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [days, setDays] = useState<number[]>([1, 3]);

  if (!g) return null;

  const teacherId = g.teacher_id ?? "";
  const teamsLink = g.video_call_link ?? "";
  const hired = g.hired_sessions ?? 0;
  const remaining = g.remaining_sessions ?? 0;

  type Slot = { date: Date; holiday: boolean; makeup: boolean };
  const generated: Slot[] = (() => {
    if (!startDate || !endDate || days.length === 0) return [];
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    if (end < start) return [];
    const holidaySet = new Set(loadHolidays().map((h) => h.date));
    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const out: Slot[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (days.includes(d.getDay())) {
        const dt = new Date(d); dt.setHours(hh, mm, 0, 0);
        out.push({ date: dt, holiday: holidaySet.has(localKey(dt)), makeup: false });
      }
    }
    let pending = out.filter((x) => x.holiday).length;
    let cursor = out.length ? new Date(out[out.length - 1].date) : new Date(end);
    let safety = 0;
    while (pending > 0 && safety < 366) {
      cursor = new Date(cursor);
      do { cursor.setDate(cursor.getDate() + 1); } while (!days.includes(cursor.getDay()));
      const dt = new Date(cursor); dt.setHours(hh, mm, 0, 0);
      const isHol = holidaySet.has(localKey(dt));
      out.push({ date: dt, holiday: isHol, makeup: !isHol });
      if (isHol) pending += 1;
      pending -= 1; safety += 1;
    }
    return out;
  })();

  const holidayHits = generated.filter((x) => x.holiday).length;
  const makeupCount = generated.filter((x) => x.makeup).length;
  const consumingCount = generated.length - holidayHits;
  const overLimit = consumingCount > remaining;

  const toggleDay = (d: number) => setDays((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const assign = () => {
    if (!teacherId || generated.length === 0 || overLimit) return;
    const duration = g.session_duration ?? 60;
    let created = 0;
    generated.forEach((slot) => {
      if (slot.holiday) return; // holiday hits are auto-skipped (no session created)
      const s = addGroupSession({
        groupId,
        teacherId,
        teamsLink,
        dateISO: slot.date.toISOString(),
        durationMinutes: duration,
      });
      if (s) created += 1;
    });
    if (created > 0) toast.success(`${created} group session${created === 1 ? "" : "s"} scheduled`);
    setStartDate(""); setEndDate("");
    tick((n) => n + 1);
  };

  return (
    <Card className="!p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Schedule Sessions</div>
        <div className="text-[11px] text-muted-foreground">
          Hired Sessions: <span className="font-semibold text-foreground">{hired}</span> · Remaining: <span className="font-semibold text-foreground">{remaining}</span>
        </div>
      </div>

      {!teacherId && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          Assign a teacher above before scheduling group sessions.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-foreground">Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">End date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Session start time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5 w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-foreground">Frequency (days of week)</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {GBS_DAY_LABELS.map((lbl, i) => {
            const v = GBS_DAY_INDEX[i]; const active = days.includes(v);
            return (
              <button key={v} onClick={() => toggleDay(v)}
                className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                style={active
                  ? { backgroundColor: GBS_BRAND, color: "white", borderColor: GBS_BRAND }
                  : { backgroundColor: "transparent", color: "var(--foreground)", borderColor: "var(--border)" }}>
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {generated.length > 0 && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border p-3 text-sm"
          style={overLimit
            ? { backgroundColor: "#fff4e6", borderColor: GBS_ORANGE, color: "#7a3d00" }
            : { backgroundColor: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
          {overLimit ? <AlertTriangle className="mt-0.5 h-4 w-4" style={{ color: GBS_ORANGE }} /> : <CalendarClock className="mt-0.5 h-4 w-4" />}
          <div>
            {overLimit ? (
              <>
                <div className="font-semibold">This range generates {consumingCount} sessions, but the group only has {remaining} remaining.</div>
                <div className="mt-0.5 text-xs">Reduce the range or edit the group's Hired Sessions.</div>
              </>
            ) : (
              <div>Will create <span className="font-semibold">{consumingCount}</span> group session{consumingCount === 1 ? "" : "s"}. Group has <span className="font-semibold">{remaining}</span> remaining.</div>
            )}
            {holidayHits > 0 && (
              <div className="mt-1 text-xs">
                {holidayHits} date{holidayHits === 1 ? "" : "s"} fall on a holiday and were skipped; {makeupCount} replacement date{makeupCount === 1 ? "" : "s"} appended at the end.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button onClick={assign} disabled={!teacherId || overLimit || generated.length === 0}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: GBS_ORANGE }}>
          <CalendarPlus className="h-4 w-4" /> Schedule {generated.length > 0 ? `(${consumingCount})` : ""}
        </button>
      </div>
    </Card>
  );
}
