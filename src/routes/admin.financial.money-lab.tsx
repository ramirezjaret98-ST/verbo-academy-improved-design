import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, CreditCard, ExternalLink,
  Wallet, CircleDollarSign, Clock, TrendingUp, type LucideIcon,
  AlertTriangle, Download, ShieldCheck, Plus, Trash2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { Pill, AccentModal, AccentModalFooter, PrimaryButton, GhostButton } from "@/components/verbo/ui";
import { USERS, SESSIONS, userById, type User } from "@/lib/mock-data";
import { hydrateStudents, subscribeStudents } from "@/lib/students-store";
import {
  loadGroups, loadGroupMembers, markGroupAsPaid, subscribeGroups,
  type Group,
} from "@/lib/groups-store";
import {
  logPayment, expectedAmountForStudent, expectedAmountForGroup,
  paymentsForMonth, paymentsForEntityInMonth, subscribePayments,
  monthKey, loadPayments, type PaymentDetailFields,
} from "@/lib/payments-log";
import { MarkAsPaidModal } from "@/components/verbo/MarkAsPaidModal";
import {
  loadManualEntries, manualEntriesForMonth, addManualEntry, deleteManualEntry,
  subscribeManualEntries, type ManualFinancialEntry, type ManualEntryType,
} from "@/lib/manual-financial-entries";
import { nextPaymentDate } from "@/lib/student-model";
import { DEFAULT_HOURLY_RATE, teacherStatus, hydrateTeachers, subscribeTeachers } from "@/lib/teacher-model";
import { downloadJson, todayStamp } from "@/lib/log-retention";
import { useAuth } from "@/lib/auth";
import { getAdminType } from "@/lib/admin-roles";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/financial/money-lab")({
  head: () => ({
    meta: [
      { title: "The Money Lab — Admin" },
      { name: "description", content: "Consolidated financial view: income from students and groups, expenses to teachers." },
    ],
  }),
  component: MoneyLabPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

function firstOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function labelOf(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function daysInMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function inMonth(iso: string | undefined, mkey: string): boolean {
  if (!iso) return false;
  const d = new Date(iso); return monthKey(d) === mkey;
}
function expectedPayDateInMonth(paymentDay: number | undefined, viewMonth: Date): Date | null {
  if (!paymentDay) return null;
  const day = Math.min(daysInMonth(viewMonth), Math.max(1, paymentDay));
  return new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function MoneyLabPage() {
  const { user } = useAuth();
  const isSuperAdmin = getAdminType(user) === "super_admin";
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [viewMonth, setViewMonth] = useState<Date>(() => firstOfMonth(new Date()));
  const [manualModalType, setManualModalType] = useState<ManualEntryType | null>(null);

  useEffect(() => { hydrateStudents(); hydrateTeachers(); bump(); }, []);
  useEffect(() => subscribeGroups(bump), []);
  useEffect(() => subscribePayments(bump), []);
  useEffect(() => subscribeManualEntries(bump), []);
  // 2026-08-26 fix: financial figures here (teacher pay, student rosters)
  // never refreshed on their own when a demo person got hidden or a real
  // profile changed elsewhere — could keep counting/paying a ghost until a
  // hard reload.
  useEffect(() => subscribeStudents(bump), []);
  useEffect(() => subscribeTeachers(bump), []);

  const now = new Date();
  const currentMkey = monthKey(now);
  const mkey = monthKey(viewMonth);
  const isCurrentMonth = mkey === currentMkey;
  const isFuture = viewMonth > firstOfMonth(now);

  // -------------------- Rosters --------------------
  // `exclude_from_financials` keeps internal/test/demo accounts (QA
  // accounts, leftover seed people, an admin's own test student) out of
  // Expected/Received Income — they aren't real paying customers. See
  // mock-data.ts and the Financial tab in admin.students.tsx.
  const activeIndividuals: User[] = USERS.filter(
    (u) => u.role === "student"
      && (u.product_type ?? "performance") === "performance"
      && (u.status ?? "active") !== "suspended"
      && !u.exclude_from_financials,
  );
  const groups: Group[] = loadGroups();
  const groupMembers = loadGroupMembers();
  const activeGroupIds = new Set(
    groupMembers.filter((m) => m.status === "active").map((m) => m.group_id),
  );
  // Individuals that are members of a group don't pay individually.
  const groupedStudentIds = new Set(
    groupMembers.filter((m) => m.status !== "archived").map((m) => m.student_id),
  );
  const payingIndividuals = activeIndividuals.filter((u) => !groupedStudentIds.has(u.id));
  const payingGroups = groups.filter((g) => activeGroupIds.has(g.id));

  // -------------------- Income rows --------------------
  type IncomeRow = {
    key: string;
    entityType: "individual" | "group";
    entityId: string;
    name: string;
    subtitle?: string;
    typeLabel: "Individual" | "Group";
    amount: number;
    status: "Paid" | "Pending" | "Overdue";
    date: Date | null;         // paid date if paid, else expected date
    dateIsExpected: boolean;
    payDay?: number;
  };

  const incomeRows: IncomeRow[] = [];

  // Amount + status for an entity in the selected month. Sums EVERY payment
  // logged for this entity this month (not just the latest one) — a student
  // on an installment payment plan can legitimately have more than one
  // payment land in the same calendar month, and if it ever happens again
  // that "Mark as Paid" gets fired twice by mistake, this at least keeps the
  // number consistent everywhere on the page instead of silently disagreeing
  // with the Trend chart (see paymentsForEntityInMonth in payments-log.ts —
  // this is the 2026-08-19 fix for the Expected/Received Income mismatch).
  function resolvePaidEntries(entityType: "individual" | "group", entityId: string) {
    const entries = paymentsForEntityInMonth(entityType, entityId, mkey);
    if (entries.length === 0) return null;
    const total = entries.reduce((s, p) => s + p.amount, 0);
    // Most recent entry drives the displayed date.
    const latest = entries.reduce((a, b) => (+new Date(a.paid_at) > +new Date(b.paid_at) ? a : b));
    return { total, latestPaidAt: latest.paid_at };
  }

  for (const s of payingIndividuals) {
    const expected = expectedPayDateInMonth(s.payment_day, viewMonth);
    const paid = resolvePaidEntries("individual", s.id);
    // Include the row if we expect a payment this month OR one was already paid.
    if (!expected && !paid) continue;
    const amount = paid?.total ?? expectedAmountForStudent(s);
    let status: IncomeRow["status"];
    if (paid) status = "Paid";
    else if (isCurrentMonth && expected && expected < new Date(now.getFullYear(), now.getMonth(), now.getDate())) status = "Overdue";
    else if (!isCurrentMonth && !isFuture) status = "Overdue"; // past month, unpaid
    else status = "Pending";
    incomeRows.push({
      key: `i-${s.id}`,
      entityType: "individual",
      entityId: s.id,
      name: s.name,
      subtitle: s.company,
      typeLabel: "Individual",
      amount,
      status,
      date: paid ? new Date(paid.latestPaidAt) : expected,
      dateIsExpected: !paid,
      payDay: s.payment_day,
    });
  }

  for (const g of payingGroups) {
    const expected = expectedPayDateInMonth(g.payment_day, viewMonth);
    const paid = resolvePaidEntries("group", g.id);
    if (!expected && !paid) continue;
    const amount = paid?.total ?? expectedAmountForGroup(g);
    let status: IncomeRow["status"];
    if (paid) status = "Paid";
    else if (isCurrentMonth && expected && expected < new Date(now.getFullYear(), now.getMonth(), now.getDate())) status = "Overdue";
    else if (!isCurrentMonth && !isFuture) status = "Overdue";
    else status = "Pending";
    incomeRows.push({
      key: `g-${g.id}`,
      entityType: "group",
      entityId: g.id,
      name: g.name,
      subtitle: g.company_client,
      typeLabel: "Group",
      amount,
      status,
      date: paid ? new Date(paid.latestPaidAt) : expected,
      dateIsExpected: !paid,
      payDay: g.payment_day,
    });
  }

  incomeRows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  // -------------------- Manual entries (2026-08-19) --------------------
  // One-off income/expense lines an admin types in by hand — e.g. an
  // in-person teacher class with no student in the system to bill against.
  // No Paid/Pending state: adding one means the money already moved, so it
  // counts immediately toward both Expected and Received Income (income) or
  // Expenses (expense). Doesn't touch the automatic student-billing /
  // teacher-hours engines — purely additive/subtractive lines on top.
  const manualEntriesThisMonth = manualEntriesForMonth(mkey);
  const manualIncomeRows = manualEntriesThisMonth.filter((e) => e.entry_type === "income");
  const manualExpenseRows = manualEntriesThisMonth.filter((e) => e.entry_type === "expense");
  const manualIncomeTotal = manualIncomeRows.reduce((s, e) => s + e.amount, 0);
  const manualExpenseTotal = manualExpenseRows.reduce((s, e) => s + e.amount, 0);

  // -------------------- Summary --------------------
  const expectedIncome = incomeRows.reduce((s, r) => s + r.amount, 0) + manualIncomeTotal;
  const receivedIncome = incomeRows.filter((r) => r.status === "Paid").reduce((s, r) => s + r.amount, 0) + manualIncomeTotal;
  const outstanding = Math.max(0, expectedIncome - receivedIncome);

  // -------------------- Expenses --------------------
  const teachers = USERS.filter((u) => u.role === "teacher" && teacherStatus(u) !== "removed");
  type ExpenseRow = {
    teacherId: string;
    name: string;
    stdHours: number;
    stdPay: number;
    adjustments: number;
    total: number;
  };
  const expenseRows: ExpenseRow[] = teachers.map((t) => {
    // Standard hours: we only have live "this month" data. Show 0 for other months.
    const stdHours = isCurrentMonth ? (t.hours_month ?? 0) : 0;
    const rate = t.hourly_rate ?? DEFAULT_HOURLY_RATE;
    const stdPay = stdHours * rate;
    const adj = (t.adjustments ?? [])
      .filter((a) => inMonth(a.date, mkey))
      .reduce((s, a) => s + a.amount, 0);
    return {
      teacherId: t.id,
      name: t.name,
      stdHours,
      stdPay,
      adjustments: adj,
      total: stdPay + adj,
    };
  }).filter((r) => r.stdPay !== 0 || r.adjustments !== 0);

  const expensesTotal = expenseRows.reduce((s, r) => s + r.total, 0) + manualExpenseTotal;
  const net = receivedIncome - expensesTotal;
  // Standard teacher pay is only tracked live for the current month, so past
  // and future months can look artificially profitable. Flag it next to Net.
  const stdPayTotal = expenseRows.reduce((s, r) => s + r.stdPay, 0);
  const missingStdPay = !isCurrentMonth && stdPayTotal === 0;

  // -------------------- Trend (last 6 months) --------------------
  const trend = useMemo(() => {
    const months: { d: Date; mkey: string; label: string; received: number; expenses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = addMonths(firstOfMonth(now), -i);
      const mk = monthKey(d);
      const manualForMonth = manualEntriesForMonth(mk);
      const manualIncomeForMonth = manualForMonth.filter((e) => e.entry_type === "income").reduce((s, e) => s + e.amount, 0);
      const manualExpenseForMonth = manualForMonth.filter((e) => e.entry_type === "expense").reduce((s, e) => s + e.amount, 0);
      const received = paymentsForMonth(mk).reduce((s, p) => s + p.amount, 0) + manualIncomeForMonth;
      const isCur = mk === currentMkey;
      const expenses = teachers.reduce((sum, t) => {
        const hrs = isCur ? (t.hours_month ?? 0) : 0;
        const pay = hrs * (t.hourly_rate ?? DEFAULT_HOURLY_RATE);
        const a = (t.adjustments ?? []).filter((x) => inMonth(x.date, mk)).reduce((s, x) => s + x.amount, 0);
        return sum + pay + a;
      }, manualExpenseForMonth);
      months.push({ d, mkey: mk, label: d.toLocaleDateString("en-US", { month: "short" }), received, expenses });
    }
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPayments().length, loadManualEntries().length, currentMkey]);

  // -------------------- Actions --------------------
  // Feature A7 (2026-08-20): opens the shared MarkAsPaidModal instead of
  // logging immediately, so method/folio/bank detail can be captured here
  // too — same as Students > Detail and Groups. See payRow state below.
  const [payRow, setPayRow] = useState<IncomeRow | null>(null);

  const markIncomePaid = (row: IncomeRow, detail: PaymentDetailFields) => {
    if (row.status === "Paid") return;
    if (row.entityType === "group") {
      markGroupAsPaid(row.entityId, detail);
      toast.success("Group marked as paid");
    } else {
      const student = USERS.find((u) => u.id === row.entityId);
      if (!student) return;
      // Mirror the exact behavior of Students > Detail > Mark as paid:
      const day = student.payment_day ?? (row.payDay ?? new Date().getDate());
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const after = nextPaymentDate(day, tomorrow);
      logPayment({
        entity_type: "individual",
        entity_id: student.id,
        name: student.name,
        company: student.company,
        amount: expectedAmountForStudent(student),
        paid_at: new Date().toISOString(),
        ...detail,
      });
      // Persist next_payment via the shared override map used by Students.
      student.next_payment = after.toISOString();
      try {
        const key = "verbo:student-profile-overrides";
        const overrides = JSON.parse(localStorage.getItem(key) || "{}");
        overrides[student.id] = { ...(overrides[student.id] ?? {}), next_payment: after.toISOString() };
        localStorage.setItem(key, JSON.stringify(overrides));
        window.dispatchEvent(new CustomEvent("verbo:students-updated"));
      } catch { /* noop */ }
      toast.success("Marked as paid");
    }
    bump();
  };

  const removeManualEntry = (entry: ManualFinancialEntry) => {
    deleteManualEntry(entry.id);
    toast.success("Entry removed");
  };

  // -------------------- Data Exports (super admin only) --------------------
  // Raw-data dumps for accounting / monthly reports — Jaret's own plan is to
  // hand these files to a separate Cowork session for analysis later, so the
  // shape here is a plain JSON snapshot, not a formatted report. Financial
  // numbers are pulled straight from the already-computed `incomeRows` /
  // `expenseRows` (not recomputed) so the export always matches exactly what
  // this page shows on screen for the selected month.
  const exportFinancialSummary = () => {
    downloadJson(`verbo-financial-summary-${mkey}-${todayStamp()}.json`, {
      month: mkey,
      generated_at: new Date().toISOString(),
      summary: {
        expected_income: expectedIncome,
        received_income: receivedIncome,
        outstanding,
        expenses_total: expensesTotal,
        net,
      },
      income: incomeRows.map((r) => {
        const student = r.entityType === "individual" ? USERS.find((u) => u.id === r.entityId) : undefined;
        return {
          type: r.typeLabel,
          name: r.name,
          company: r.subtitle ?? null,
          email: student?.email ?? null,
          phone: student?.phone ?? null,
          access_plan: student?.access_plan ?? null,
          amount: r.amount,
          status: r.status,
          date: r.date ? r.date.toISOString() : null,
          date_is_expected: r.dateIsExpected,
        };
      }),
      expenses: expenseRows.map((r) => ({
        teacher: r.name,
        std_hours: r.stdHours,
        std_pay: r.stdPay,
        adjustments: r.adjustments,
        total: r.total,
      })),
      manual_income: manualIncomeRows.map((e) => ({
        label: e.label, amount: e.amount, date: e.entry_date,
        linked_student: e.linked_student_name ?? null, notes: e.notes ?? null,
      })),
      manual_expenses: manualExpenseRows.map((e) => ({
        label: e.label, amount: e.amount, date: e.entry_date,
        linked_teacher: e.linked_teacher_name ?? null, notes: e.notes ?? null,
      })),
    });
    toast.success("Financial summary downloaded");
  };

  const exportStudentsRoster = () => {
    const students = USERS.filter((u) => u.role === "student");
    downloadJson(`verbo-students-roster-${todayStamp()}.json`, {
      generated_at: new Date().toISOString(),
      count: students.length,
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone ?? null,
        company: s.company ?? null,
        status: s.status ?? "active",
        product: s.product ?? null,
        focus: s.focus ?? null,
        access_plan: s.access_plan ?? null,
        monthly_price: expectedAmountForStudent(s),
        price_is_custom: s.custom_price != null,
        excluded_from_financials: s.exclude_from_financials ?? false,
        hired_sessions: s.hired_sessions ?? 0,
        remaining_sessions: s.remaining_sessions ?? 0,
        sessions_per_week: s.sessions_per_week ?? null,
        session_duration: s.session_duration ?? null,
        payment_day: s.payment_day ?? null,
        cycle_start: s.cycle_start ?? null,
        next_payment: s.next_payment ?? null,
        member_since: s.member_since ?? null,
      })),
    });
    toast.success("Students roster downloaded");
  };

  const exportTeachersRoster = () => {
    const rosterTeachers = USERS.filter((u) => u.role === "teacher");
    downloadJson(`verbo-teachers-roster-${todayStamp()}.json`, {
      generated_at: new Date().toISOString(),
      count: rosterTeachers.length,
      teachers: rosterTeachers.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        phone: t.phone ?? null,
        status: teacherStatus(t),
        // Same rate this page's Expenses table uses (`t.hourly_rate ??
        // DEFAULT_HOURLY_RATE`) — kept identical so this export always
        // matches the numbers already on screen.
        hourly_rate: t.hourly_rate ?? DEFAULT_HOURLY_RATE,
        hours_month: t.hours_month ?? 0,
        adjustments_total: (t.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0),
      })),
    });
    toast.success("Teachers roster downloaded");
  };

  const exportSessionsThisMonth = () => {
    const rows = SESSIONS
      .filter((s) => monthKey(new Date(s.date_time)) === mkey)
      .map((s) => ({
        id: s.id,
        date_time: s.date_time,
        student: userById(s.student_id)?.name ?? s.student_id,
        teacher: userById(s.teacher_id)?.name ?? s.teacher_id,
        status: s.status,
        duration_minutes: s.duration_minutes,
        origin: s.origin ?? "course",
      }));
    downloadJson(`verbo-sessions-${mkey}-${todayStamp()}.json`, {
      month: mkey,
      generated_at: new Date().toISOString(),
      count: rows.length,
      sessions: rows,
    });
    toast.success("Sessions export downloaded");
  };

  // -------------------- Render --------------------
  const INCOME_ACCENT = "#5fca16";
  const EXPENSE_ACCENT = "#d97706";
  const NAVY = "#01304a";

  return (
    <div className="space-y-8">
      {/* Header + month selector */}
      <header className="verbo-admin-section" style={{ "--verbo-admin-i": 0 } as React.CSSProperties}>
        <div className="flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Financial</p>
            <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground">The Money Lab</h1>
            <p className="mt-1.5 text-sm font-light text-muted-foreground">
              Income from students &amp; groups, expenses to teachers. Read-only aggregation.
            </p>
          </div>

          <div className="flex items-center gap-1 self-start rounded-full border border-border bg-card px-1.5 py-1.5 shadow-[0_1px_2px_color-mix(in_oklab,var(--navy-700)_7%,transparent)] lg:self-auto">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewMonth((d) => addMonths(d, -1))}
              className="verbo-admin-press rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
            </button>
            <div className="min-w-[150px] px-2 text-center text-sm font-medium tracking-[-0.01em] text-foreground">
              {labelOf(viewMonth)}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewMonth((d) => addMonths(d, 1))}
              className="verbo-admin-press rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </header>

      {/* Summary strip */}
      <div
        className="verbo-admin-section grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        style={{ "--verbo-admin-i": 1 } as React.CSSProperties}
      >
        {([
          { label: "Expected Income", value: money(expectedIncome), sub: `${incomeRows.length} customers`, icon: Wallet, color: NAVY },
          { label: "Received Income", value: money(receivedIncome), sub: `${incomeRows.filter((r) => r.status === "Paid").length} paid`, icon: CircleDollarSign, color: INCOME_ACCENT },
          { label: "Outstanding", value: money(outstanding), sub: `${incomeRows.filter((r) => r.status !== "Paid").length} unpaid`, icon: Clock, color: "#b45309" },
          { label: "Expenses", value: money(expensesTotal), sub: `${expenseRows.length} teachers`, icon: CreditCard, color: EXPENSE_ACCENT },
          { label: "Net", value: money(net), sub: net >= 0 ? "Profit" : "Loss", icon: TrendingUp, color: net >= 0 ? INCOME_ACCENT : "#b52904", note: missingStdPay ? "Standard teacher pay is $0 this month — only manual adjustments count, so Net is incomplete." : undefined },
        ] as { label: string; value: string; sub: string; icon: LucideIcon; color: string; note?: string }[]).map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="verbo-admin-lift relative overflow-hidden rounded-2xl border border-border bg-card px-5 py-5"
            >
              <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: m.color }} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{m.label}</div>
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: m.color }} aria-hidden />
              </div>
              <div className="mt-4 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">
                {m.value}
              </div>
              <div className="mt-2 text-[11px] font-light text-muted-foreground">{m.sub}</div>
              {m.note && (
                <div className="mt-3 flex items-start gap-1.5 text-[10px] font-medium leading-snug text-[#b45309]">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" strokeWidth={1.6} /> {m.note}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Trend chart */}
      <section
        className="verbo-admin-section rounded-2xl border border-border bg-card p-5 sm:p-6"
        style={{ "--verbo-admin-i": 2 } as React.CSSProperties}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Last 6 months</div>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.01em] text-foreground">Received income vs expenses</h2>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-light text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: INCOME_ACCENT }} /> Received
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: EXPENSE_ACCENT }} /> Expenses
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: NAVY }} /> Net
            </span>
          </div>
        </div>
        <TrendChart data={trend} onSelect={(d) => setViewMonth(firstOfMonth(d))} selectedMkey={mkey} />
        <p className="mt-3 text-[11px] font-light text-muted-foreground">Tap a bar to jump to that month.</p>
      </section>

      {/* Income table */}
      <section
        className="verbo-admin-section relative overflow-hidden rounded-2xl border border-border bg-card"
        style={{ "--verbo-admin-i": 3 } as React.CSSProperties}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: INCOME_ACCENT }} aria-hidden />
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4 sm:px-6"
          style={{ background: `color-mix(in oklab, ${INCOME_ACCENT} 5%, transparent)` }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: `color-mix(in oklab, ${INCOME_ACCENT} 12%, transparent)`, color: INCOME_ACCENT }}
              aria-hidden
            >
              <CircleDollarSign className="h-4 w-4" strokeWidth={1.6} />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">Income</h2>
              <p className="text-[11px] font-light text-muted-foreground">{labelOf(viewMonth)} · {incomeRows.length} rows</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Received</div>
            <div className="text-lg font-semibold tabular-nums tracking-[-0.01em]" style={{ color: INCOME_ACCENT }}>
              {money(receivedIncome)}
            </div>
          </div>
        </div>

        {incomeRows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm font-light text-muted-foreground sm:px-6">
            No income scheduled or received in this month.
          </div>
        ) : (
          <div className="verbo-scroll-hidden overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-5 py-3 font-medium sm:px-6">Name</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 text-right font-medium sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody>
                {incomeRows.map((r, i) => (
                  <tr
                    key={r.key}
                    className="verbo-money-row border-b border-border/50 last:border-0"
                    style={{ "--verbo-money-i": i } as React.CSSProperties}
                  >
                    <td className="px-5 py-3 sm:px-6">
                      <div className="font-medium tracking-[-0.01em] text-foreground">{r.name}</div>
                      {r.subtitle && <div className="text-[11px] font-light text-muted-foreground">{r.subtitle}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-light text-muted-foreground">
                        {r.typeLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums tracking-[-0.01em] text-foreground">
                      {money(r.amount)}
                    </td>
                    <td className="px-3 py-3">
                      {r.status === "Paid" && <Pill tone="success" style={{ background: "#5fca16", color: "#fff" }}>Paid</Pill>}
                      {r.status === "Pending" && <Pill tone="warning" style={{ background: "#b45309", color: "#fff" }}>Pending</Pill>}
                      {r.status === "Overdue" && <Pill tone="danger" style={{ background: "#b52904", color: "#fff" }}>Overdue</Pill>}
                    </td>
                    <td className="px-3 py-3 text-[13px] font-light tabular-nums text-muted-foreground">
                      {r.date ? r.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <button
                        type="button"
                        onClick={() => setPayRow(r)}
                        disabled={r.status === "Paid"}
                        style={{ background: "#5fca16" }}
                        className="verbo-admin-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        <CreditCard className="h-3 w-3" strokeWidth={1.8} /> Mark as Paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Expenses table */}
      <section
        className="verbo-admin-section relative overflow-hidden rounded-2xl border border-border bg-card"
        style={{ "--verbo-admin-i": 4 } as React.CSSProperties}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: EXPENSE_ACCENT }} aria-hidden />
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-5 py-4 sm:px-6"
          style={{ background: `color-mix(in oklab, ${EXPENSE_ACCENT} 5%, transparent)` }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: `color-mix(in oklab, ${EXPENSE_ACCENT} 12%, transparent)`, color: EXPENSE_ACCENT }}
              aria-hidden
            >
              <CreditCard className="h-4 w-4" strokeWidth={1.6} />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">Expenses</h2>
              <p className="text-[11px] font-light text-muted-foreground">{labelOf(viewMonth)} · {expenseRows.length} teachers</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Total</div>
            <div className="text-lg font-semibold tabular-nums tracking-[-0.01em]" style={{ color: EXPENSE_ACCENT }}>
              {money(expensesTotal)}
            </div>
          </div>
        </div>

        {expenseRows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm font-light text-muted-foreground sm:px-6">
            No teacher expenses recorded in this month.
          </div>
        ) : (
          <div className="verbo-scroll-hidden overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-5 py-3 font-medium sm:px-6">Teacher</th>
                  <th className="px-3 py-3 text-right font-medium">Std hours</th>
                  <th className="px-3 py-3 text-right font-medium">Std pay</th>
                  <th className="px-3 py-3 text-right font-medium">Adjustments</th>
                  <th className="px-5 py-3 text-right font-medium sm:px-6">Total</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map((r, i) => (
                  <tr
                    key={r.teacherId}
                    className="verbo-money-row border-b border-border/50 last:border-0"
                    style={{ "--verbo-money-i": i } as React.CSSProperties}
                  >
                    <td className="px-5 py-3 sm:px-6">
                      <Link
                        to="/admin/teachers"
                        search={{ teacher: r.teacherId } as never}
                        className="group inline-flex items-center gap-1.5 font-medium tracking-[-0.01em] text-foreground hover:text-accent"
                      >
                        {r.name}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right font-light tabular-nums text-muted-foreground">{r.stdHours}h</td>
                    <td className="px-3 py-3 text-right font-light tabular-nums text-muted-foreground">{money(r.stdPay)}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${r.adjustments < 0 ? "text-destructive" : r.adjustments > 0 ? "text-success" : "font-light text-muted-foreground"}`}>
                      {r.adjustments >= 0 ? "+" : "−"}{money(Math.abs(r.adjustments))}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums tracking-[-0.01em] text-foreground sm:px-6">
                      {money(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Manual entries — one-off income/expense lines added by hand, for
          anything the automatic student-billing / teacher-hours engines
          don't cover (e.g. an in-person class with no student record). */}
      <section
        className="verbo-admin-section grid grid-cols-1 gap-5 lg:grid-cols-2"
        style={{ "--verbo-admin-i": 5 } as React.CSSProperties}
      >
        <ManualEntryCard
          type="income"
          entries={manualIncomeRows}
          total={manualIncomeTotal}
          accent={INCOME_ACCENT}
          viewMonth={viewMonth}
          onAdd={() => setManualModalType("income")}
          onRemove={removeManualEntry}
        />
        <ManualEntryCard
          type="expense"
          entries={manualExpenseRows}
          total={manualExpenseTotal}
          accent={EXPENSE_ACCENT}
          viewMonth={viewMonth}
          onAdd={() => setManualModalType("expense")}
          onRemove={removeManualEntry}
        />
      </section>

      {manualModalType && (
        <ManualEntryModal
          type={manualModalType}
          viewMonth={viewMonth}
          teachers={teachers}
          students={activeIndividuals}
          onClose={() => setManualModalType(null)}
          currentUserId={user?.id}
        />
      )}

      {payRow && (
        <MarkAsPaidModal
          entityLabel={payRow.name}
          amount={payRow.amount}
          onClose={() => setPayRow(null)}
          onConfirm={(detail) => markIncomePaid(payRow, detail)}
        />
      )}

      {/* Data Exports — super admin only. Raw JSON snapshots for accounting /
          monthly reports, meant to be handed to a separate Cowork session for
          analysis later (per Jaret) rather than a formatted report. */}
      {isSuperAdmin && (
        <section
          className="verbo-admin-section rounded-2xl border border-border bg-card p-5 sm:p-6"
          style={{ "--verbo-admin-i": 6 } as React.CSSProperties}
        >
          <div className="mb-4 flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: `color-mix(in oklab, ${NAVY} 12%, transparent)`, color: NAVY }}
              aria-hidden
            >
              <Download className="h-4 w-4" strokeWidth={1.6} />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">Data Exports</h2>
              <p className="text-[11px] font-light text-muted-foreground">
                Raw JSON snapshots for accounting or monthly reports — Super Admin only.
              </p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> Super Admin
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Financial summary", sub: `Income + expenses · ${labelOf(viewMonth)}`, onClick: exportFinancialSummary },
              { label: "Sessions", sub: `Session-level detail · ${labelOf(viewMonth)}`, onClick: exportSessionsThisMonth },
              { label: "Students roster", sub: "All students, current snapshot", onClick: exportStudentsRoster },
              { label: "Teachers roster", sub: "All teachers, current snapshot", onClick: exportTeachersRoster },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                onClick={btn.onClick}
                className="verbo-admin-press flex flex-col items-start gap-2 rounded-xl border border-border bg-background px-4 py-3.5 text-left transition-colors hover:border-accent/40 hover:bg-secondary/40"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Download className="h-3.5 w-3.5 text-accent" /> {btn.label}
                </span>
                <span className="text-[11px] font-light text-muted-foreground">{btn.sub}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart — income bars + expenses/net lines (no red block).
// ---------------------------------------------------------------------------
function TrendChart({
  data, onSelect, selectedMkey,
}: {
  data: { d: Date; mkey: string; label: string; received: number; expenses: number }[];
  onSelect: (d: Date) => void;
  selectedMkey: string;
}) {
  const rows = data.map((m) => ({ ...m, net: m.received - m.expenses }));
  const handleClick = (p: unknown) => {
    const payload = (p as { payload?: { d?: Date } } | undefined)?.payload ?? (p as { d?: Date });
    if (payload?.d) onSelect(payload.d);
  };
  return (
    <div className="h-[240px] w-full sm:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            dy={6}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(v: number) => money(v)}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.06 }}
            contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(1,48,74,0.35)" }}
            formatter={(value: number, name: string) => [money(value), name]}
          />
          <Bar
            dataKey="received"
            name="Received Income"
            fill="#5fca16"
            radius={[6, 6, 0, 0]}
            maxBarSize={22}
            onClick={handleClick}
            cursor="pointer"
            animationDuration={480}
          >
            {rows.map((m) => (
              <Cell key={m.mkey} fillOpacity={m.mkey === selectedMkey ? 1 : 0.4} />
            ))}
          </Bar>
          <Bar
            dataKey="expenses"
            name="Expenses"
            fill="#d97706"
            radius={[6, 6, 0, 0]}
            maxBarSize={22}
            onClick={handleClick}
            cursor="pointer"
            animationDuration={480}
          >
            {rows.map((m) => (
              <Cell key={m.mkey} fillOpacity={m.mkey === selectedMkey ? 1 : 0.4} />
            ))}
          </Bar>
          <Bar
            dataKey="net"
            name="Net"
            fill="#01304a"
            radius={[6, 6, 0, 0]}
            maxBarSize={22}
            onClick={handleClick}
            cursor="pointer"
            animationDuration={480}
          >
            {rows.map((m) => (
              <Cell key={m.mkey} fillOpacity={m.mkey === selectedMkey ? 1 : 0.4} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual entries — card (list + add/remove) and add modal. 2026-08-19,
// per Jaret's explicit request to be able to add/remove income and expense
// line items by hand (e.g. an in-person teacher class with no student record
// in the system). See manual-financial-entries.ts for the storage layer.
// ---------------------------------------------------------------------------
function ManualEntryCard({
  type, entries, total, accent, viewMonth, onAdd, onRemove,
}: {
  type: ManualEntryType;
  entries: ManualFinancialEntry[];
  total: number;
  accent: string;
  viewMonth: Date;
  onAdd: () => void;
  onRemove: (entry: ManualFinancialEntry) => void;
}) {
  const isIncome = type === "income";
  const title = isIncome ? "Manual income" : "Manual expenses";
  const noun = isIncome ? "income" : "expense";

  return (
    <div className="verbo-admin-lift relative overflow-hidden rounded-2xl border border-border bg-card">
      <div
        className="flex items-center justify-between gap-2 border-b border-border/70 px-5 py-4"
        style={{ background: `color-mix(in oklab, ${accent} 5%, transparent)` }}
      >
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
          <p className="text-[11px] font-light text-muted-foreground">
            {labelOf(viewMonth)} · {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="text-lg font-semibold tabular-nums tracking-[-0.01em]" style={{ color: accent }}>
          {money(total)}
        </div>
      </div>

      <div className="p-4">
        <button
          type="button"
          onClick={onAdd}
          className="verbo-admin-press mb-3 inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-secondary/40"
          style={{ borderColor: accent, color: accent }}
        >
          <Plus className="h-3 w-3" strokeWidth={2} /> Add {noun}
        </button>

        {entries.length === 0 ? (
          <p className="px-1 py-3 text-[12px] font-light text-muted-foreground">
            No manual {noun} entries this month.
          </p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium tracking-[-0.01em] text-foreground">{e.label}</div>
                  <div className="truncate text-[11px] font-light text-muted-foreground">
                    {new Date(`${e.entry_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {e.linked_teacher_name && ` · ${e.linked_teacher_name}`}
                    {e.linked_student_name && ` · ${e.linked_student_name}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums tracking-[-0.01em] text-foreground">{money(e.amount)}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(e)}
                    aria-label={`Remove ${e.label}`}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ManualEntryModal({
  type, viewMonth, teachers, students, onClose, currentUserId,
}: {
  type: ManualEntryType;
  viewMonth: Date;
  teachers: User[];
  students: User[];
  onClose: () => void;
  currentUserId?: string;
}) {
  const isIncome = type === "income";
  const accent = isIncome ? "#5fca16" : "#d97706";

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => {
    const today = new Date();
    // Default to today if adding to the current month; otherwise the 1st of
    // whichever month is being viewed, so it lands in the right bucket.
    const inViewedMonth = monthKey(today) === monthKey(viewMonth);
    const d = inViewedMonth ? today : firstOfMonth(viewMonth);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [linkMode, setLinkMode] = useState<"none" | "linked">("none");
  const [linkedId, setLinkedId] = useState("");
  const [notes, setNotes] = useState("");

  const isValid = label.trim() !== "" && Number(amount) > 0 && date.trim() !== "";
  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent";

  const handleSave = () => {
    if (!isValid) return;
    const linkedTeacher = !isIncome && linkMode === "linked" ? teachers.find((t) => t.id === linkedId) : undefined;
    const linkedStudent = isIncome && linkMode === "linked" ? students.find((s) => s.id === linkedId) : undefined;
    addManualEntry({
      entry_type: type,
      label: label.trim(),
      amount: Number(amount),
      entry_date: date,
      linked_teacher_id: linkedTeacher?.id,
      linked_teacher_name: linkedTeacher?.name,
      linked_student_id: linkedStudent?.id,
      linked_student_name: linkedStudent?.name,
      notes: notes.trim() || undefined,
      createdBy: currentUserId,
    });
    toast.success(isIncome ? "Manual income added" : "Manual expense added");
    onClose();
  };

  return (
    <AccentModal
      background={accent}
      iconTint={accent}
      icon={isIncome ? CircleDollarSign : CreditCard}
      eyebrow="The Money Lab"
      title={isIncome ? "Add manual income" : "Add manual expense"}
      onClose={onClose}
      maxWidth="max-w-lg"
      zClass="z-[60]"
    >
      <div className="space-y-4 p-5">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Concept</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isIncome ? "e.g. One-time workshop fee" : "e.g. In-person class — Juan Pérez"}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount (MXN)</label>
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Link to {isIncome ? "a student" : "a teacher"} (optional)
          </label>
          <div className="mb-2 inline-flex rounded-lg border border-border bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => { setLinkMode("none"); setLinkedId(""); }}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${linkMode === "none" ? "bg-[#01304a] text-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              None — free entry
            </button>
            <button
              type="button"
              onClick={() => setLinkMode("linked")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${linkMode === "linked" ? "bg-[#01304a] text-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              {isIncome ? "Existing student" : "Existing teacher"}
            </button>
          </div>
          {linkMode === "linked" && (
            <select value={linkedId} onChange={(e) => setLinkedId(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="">{isIncome ? "Select a student" : "Select a teacher"}</option>
              {(isIncome ? students : teachers).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            Purely informational — shown next to the entry for context. It does not change{" "}
            {isIncome ? "that student's regular billing" : "that teacher's automatic hours/pay calculation"}.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </div>
      </div>

      <AccentModalFooter accent={accent}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={handleSave} disabled={!isValid} accentColor={accent}>
          {isIncome ? "Add income" : "Add expense"}
        </PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}


