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
import { Card, SectionTitle, HeroStatCard, Pill } from "@/components/verbo/ui";
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
  return (
    <div className="space-y-6">
      {/* Header + month selector */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionTitle>The Money Lab</SectionTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Consolidated view of income (Students &amp; Groups) and expenses (Teachers). Data lives in its original place — this dashboard only reads and aggregates it.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 shadow-soft">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setViewMonth((d) => addMonths(d, -1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[140px] px-2 text-center text-sm font-semibold text-foreground">{labelOf(viewMonth)}</div>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setViewMonth((d) => addMonths(d, 1))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {([
          { label: "Expected Income", value: money(expectedIncome), sub: `${incomeRows.length} customers`, icon: Wallet, color: "#01304a" },
          { label: "Received Income", value: money(receivedIncome), sub: `${incomeRows.filter((r) => r.status === "Paid").length} paid`, icon: CircleDollarSign, color: "#5fca16" },
          { label: "Outstanding", value: money(outstanding), sub: `${incomeRows.filter((r) => r.status !== "Paid").length} unpaid`, icon: Clock, color: "#b45309" },
          { label: "Expenses", value: money(expensesTotal), sub: `${expenseRows.length} teachers`, icon: CreditCard, color: "#d97706" },
          { label: "Net", value: money(net), sub: net >= 0 ? "Profit" : "Loss", icon: TrendingUp, color: net >= 0 ? "#5fca16" : "#b52904", note: missingStdPay ? "Standard teacher pay is $0 for this month — only manual adjustments are counted, so this Net is incomplete." : undefined },
        ] as { label: string; value: string; sub: string; icon: LucideIcon; color: string; note?: string }[]).map((m) => {
          const Icon = m.icon;
          return (
            <HeroStatCard
              key={m.label}
              className="!min-h-[132px] !items-start border border-border bg-card"
              style={{ boxShadow: `0 0 24px -8px ${m.color}66` }}
            >
              <div className="absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-xl">
                <Icon className="h-7 w-7" style={{ color: m.color }} strokeWidth={1.75} />
              </div>
              <div className="relative w-full">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</div>
                <div className="mt-2 text-3xl font-bold leading-none text-foreground">{m.value}</div>
                <div className="mt-2 text-[11px] text-muted-foreground">{m.sub}</div>
                {m.note && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-[#b45309]/10 px-2 py-1.5 text-[10px] font-medium leading-snug text-[#b45309]">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {m.note}
                  </div>
                )}
              </div>
            </HeroStatCard>
          );
        })}
      </div>

      {/* Trend chart */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Received Income vs Expenses — last 6 months</h3>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-success" /> Received Income</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive" /> Expenses</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#01304a]" /> Net</span>
          </div>
        </div>
        <TrendChart data={trend} onSelect={(d) => setViewMonth(firstOfMonth(d))} selectedMkey={mkey} />
      </Card>


      {/* Income table */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Income</h3>
          <span className="text-xs text-muted-foreground">{labelOf(viewMonth)}</span>
        </div>
        {incomeRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No income scheduled or received in this month.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {incomeRows.map((r) => (
                  <tr key={r.key} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{r.name}</div>
                      {r.subtitle && <div className="text-[11px] text-muted-foreground">{r.subtitle}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.typeLabel}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">{money(r.amount)}</td>
                    <td className="px-3 py-2.5">
                      {r.status === "Paid" && <Pill tone="success" style={{ background: "#5fca16", color: "#fff" }}>Paid</Pill>}
                      {r.status === "Pending" && <Pill tone="warning" style={{ background: "#b45309", color: "#fff" }}>Pending</Pill>}
                      {r.status === "Overdue" && <Pill tone="danger" style={{ background: "#b52904", color: "#fff" }}>Overdue</Pill>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {r.date ? r.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => markIncomePaid(r)}
                        disabled={r.status === "Paid"}
                        style={{ background: "#5fca16" }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        <CreditCard className="h-3 w-3" /> Mark as Paid
                      </button>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Expenses table */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Expenses</h3>
          <span className="text-xs text-muted-foreground">{labelOf(viewMonth)}</span>
        </div>
        {expenseRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No teacher expenses recorded in this month.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Teacher Name</th>
                  <th className="px-3 py-2 font-medium text-right">Standard Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Standard Pay</th>
                  <th className="px-3 py-2 font-medium text-right">Adjustments</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {expenseRows.map((r) => (
                  <tr key={r.teacherId} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2.5">
                      <Link
                        to="/admin/teachers"
                        search={{ teacher: r.teacherId } as never}
                        className="group inline-flex items-center gap-1.5 font-medium text-foreground hover:text-accent"
                      >
                        {r.name}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{r.stdHours}h</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">{money(r.stdPay)}</td>
                    <td className={`px-3 py-2.5 text-right ${r.adjustments < 0 ? "text-destructive" : r.adjustments > 0 ? "text-success" : "text-muted-foreground"}`}>
                      {r.adjustments >= 0 ? "+" : "−"}{money(Math.abs(r.adjustments))}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">{money(r.total)}</td>
                    <td className="px-3 py-2.5" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart — recharts ComposedChart (Received vs Expenses + Net line).
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
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={70} tickFormatter={(v: number) => money(v)} />
          <Tooltip
            cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
            formatter={(value: number, name: string) => [money(value), name]}
          />
          <Bar dataKey="received" name="Received Income" fill="var(--success)" radius={[4, 4, 0, 0]} onClick={handleClick} cursor="pointer">
            {rows.map((m) => (
              <Cell key={m.mkey} fillOpacity={m.mkey === selectedMkey ? 1 : 0.55} />
            ))}
          </Bar>
          <Bar dataKey="expenses" name="Expenses" fill="var(--destructive)" radius={[4, 4, 0, 0]} onClick={handleClick} cursor="pointer">
            {rows.map((m) => (
              <Cell key={m.mkey} fillOpacity={m.mkey === selectedMkey ? 1 : 0.55} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="net" name="Net" stroke="#01304a" strokeWidth={2} dot={{ r: 4, fill: "#01304a" }} activeDot={{ r: 6 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

