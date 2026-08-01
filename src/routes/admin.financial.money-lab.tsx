import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, CreditCard, ExternalLink,
  Wallet, CircleDollarSign, Clock, TrendingUp, type LucideIcon,
  AlertTriangle,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Pill } from "@/components/verbo/ui";
import { USERS, type User } from "@/lib/mock-data";
import { hydrateStudents } from "@/lib/students-store";
import {
  loadGroups, loadGroupMembers, markGroupAsPaid, subscribeGroups,
  type Group,
} from "@/lib/groups-store";
import {
  logPayment, expectedAmountForStudent, expectedAmountForGroup,
  paymentsForMonth, paymentForEntityInMonth, subscribePayments,
  monthKey, loadPayments,
} from "@/lib/payments-log";
import { nextPaymentDate } from "@/lib/student-model";
import { DEFAULT_HOURLY_RATE, teacherStatus } from "@/lib/teacher-model";
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
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [viewMonth, setViewMonth] = useState<Date>(() => firstOfMonth(new Date()));

  useEffect(() => { hydrateStudents(); bump(); }, []);
  useEffect(() => subscribeGroups(bump), []);
  useEffect(() => subscribePayments(bump), []);

  const now = new Date();
  const currentMkey = monthKey(now);
  const mkey = monthKey(viewMonth);
  const isCurrentMonth = mkey === currentMkey;
  const isFuture = viewMonth > firstOfMonth(now);

  // -------------------- Rosters --------------------
  const activeIndividuals: User[] = USERS.filter(
    (u) => u.role === "student"
      && (u.product_type ?? "performance") === "performance"
      && (u.status ?? "active") !== "suspended",
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

  for (const s of payingIndividuals) {
    const expected = expectedPayDateInMonth(s.payment_day, viewMonth);
    const paid = paymentForEntityInMonth("individual", s.id, mkey);
    // Include the row if we expect a payment this month OR one was already paid.
    if (!expected && !paid) continue;
    const amount = paid?.amount ?? expectedAmountForStudent(s);
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
      date: paid ? new Date(paid.paid_at) : expected,
      dateIsExpected: !paid,
      payDay: s.payment_day,
    });
  }

  for (const g of payingGroups) {
    const expected = expectedPayDateInMonth(g.payment_day, viewMonth);
    const paid = paymentForEntityInMonth("group", g.id, mkey);
    if (!expected && !paid) continue;
    const amount = paid?.amount ?? expectedAmountForGroup(g);
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
      date: paid ? new Date(paid.paid_at) : expected,
      dateIsExpected: !paid,
      payDay: g.payment_day,
    });
  }

  incomeRows.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  // -------------------- Summary --------------------
  const expectedIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const receivedIncome = incomeRows.filter((r) => r.status === "Paid").reduce((s, r) => s + r.amount, 0);
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

  const expensesTotal = expenseRows.reduce((s, r) => s + r.total, 0);
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
      const received = paymentsForMonth(mk).reduce((s, p) => s + p.amount, 0);
      const isCur = mk === currentMkey;
      const expenses = teachers.reduce((sum, t) => {
        const hrs = isCur ? (t.hours_month ?? 0) : 0;
        const pay = hrs * (t.hourly_rate ?? DEFAULT_HOURLY_RATE);
        const a = (t.adjustments ?? []).filter((x) => inMonth(x.date, mk)).reduce((s, x) => s + x.amount, 0);
        return sum + pay + a;
      }, 0);
      months.push({ d, mkey: mk, label: d.toLocaleDateString("en-US", { month: "short" }), received, expenses });
    }
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPayments().length, currentMkey]);

  // -------------------- Actions --------------------
  const markIncomePaid = (row: IncomeRow) => {
    if (row.status === "Paid") return;
    if (row.entityType === "group") {
      markGroupAsPaid(row.entityId);
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
              <span className="h-[2px] w-4 rounded-full" style={{ background: EXPENSE_ACCENT }} /> Expenses
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-4 rounded-full" style={{ background: NAVY }} /> Net
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
                        onClick={() => markIncomePaid(r)}
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
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip
            cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.06 }}
            contentStyle={{ borderRadius: 14, border: "1px solid var(--border)", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(1,48,74,0.35)" }}
            formatter={(value: number, name: string) => [money(value), name]}
          />
          <Bar
            dataKey="received"
            name="Received Income"
            fill="#5fca16"
            radius={[8, 8, 0, 0]}
            maxBarSize={34}
            onClick={handleClick}
            cursor="pointer"
            animationDuration={480}
          >
            {rows.map((m) => (
              <Cell key={m.mkey} fillOpacity={m.mkey === selectedMkey ? 1 : 0.35} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="expenses"
            name="Expenses"
            stroke="#d97706"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 3, fill: "#d97706", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            animationDuration={620}
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="#01304a"
            strokeWidth={2}
            dot={{ r: 3, fill: "#01304a", strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            animationDuration={620}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}


