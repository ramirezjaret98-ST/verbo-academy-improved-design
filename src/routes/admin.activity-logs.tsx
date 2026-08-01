import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, Pill, PrimaryButton, GhostButton } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import { hydrateAdminRoles, getAdminType } from "@/lib/admin-roles";
import {
  useActivityLog, ACTIVITY_KIND_LABELS, ACTOR_ROLE_LABELS,
  type ActivityKind, type ActorRole,
} from "@/lib/activity-logs-store";
import { USERS } from "@/lib/mock-data";
import {
  loadKpiOverrides, replaceKpiOverrides,
  subscribeKpiOverrides,
} from "@/lib/teacher-kpi-overrides-store";
import {
  loadPayments, replacePayments,
  subscribePayments,
} from "@/lib/payments-log";
import {
  getRetentionMonths, setRetentionMonths,
  retentionCutoffMs, downloadJson, todayStamp,
} from "@/lib/log-retention";

export const Route = createFileRoute("/admin/activity-logs")({
  head: () => ({
    meta: [
      { title: "Activity Logs — Admin" },
      { name: "description", content: "Immutable log of business events across sessions, clubs, reports, ratings, and admin decisions." },
    ],
  }),
  component: ActivityLogsPage,
});

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function roleTone(r: ActorRole): "default" | "muted" | "warning" | "success" {
  if (r === "admin") return "warning";
  if (r === "teacher") return "default";
  if (r === "student") return "success";
  return "muted";
}

function ActivityLogsPage() {
  hydrateAdminRoles();
  const { user } = useAuth();
  const adminType = getAdminType(user);
  const entries = useActivityLog();

  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [role, setRole] = useState<ActorRole | "all">("all");
  const [personId, setPersonId] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const people = useMemo(() => USERS.slice().sort((a, b) => a.name.localeCompare(b.name)), []);

  const filtered = useMemo(() => {
    const fromMs = from ? +new Date(from) : -Infinity;
    const toMs = to ? +new Date(to) + 86_400_000 : Infinity; // include end day
    return entries.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (role !== "all" && e.actorRole !== role) return false;
      if (personId !== "all" && e.actorId !== personId && e.personId !== personId) return false;
      const t = +new Date(e.timestamp);
      if (t < fromMs || t > toMs) return false;
      return true;
    });
  }, [entries, kind, role, personId, from, to]);

  if (adminType && adminType !== "super_admin") {
    return <Navigate to="/admin" />;
  }

  const clearFilters = () => {
    setKind("all"); setRole("all"); setPersonId("all"); setFrom(""); setTo("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Business-event log across sessions, clubs, reports, ratings, and admin decisions.
        </p>
      </div>

      <DataRetentionSection />


      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Event type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind | "all")}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm">
              <option value="all">All events</option>
              {(Object.keys(ACTIVITY_KIND_LABELS) as ActivityKind[]).map((k) => (
                <option key={k} value={k}>{ACTIVITY_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Actor role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as ActorRole | "all")}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm">
              <option value="all">All roles</option>
              {(Object.keys(ACTOR_ROLE_LABELS) as ActorRole[]).map((r) => (
                <option key={r} value={r}>{ACTOR_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Person</label>
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm">
              <option value="all">Anyone</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {filtered.length} event{filtered.length === 1 ? "" : "s"}
          </div>
          <button onClick={clearFilters}
            className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Clear filters
          </button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                <th className="px-4 py-3 text-left font-medium">Actor</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
                <th className="px-4 py-3 text-left font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No events match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtTs(e.timestamp)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{e.actorName}</td>
                  <td className="px-4 py-3"><Pill tone={roleTone(e.actorRole)}>{ACTOR_ROLE_LABELS[e.actorRole]}</Pill></td>
                  <td className="px-4 py-3 text-foreground">{e.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Retention — super_admin only. Configures a single retention window
// (months) applied to both unbounded logs, and exports+prunes old entries.
// ---------------------------------------------------------------------------
function useLive<T>(load: () => T, subscribe: (cb: () => void) => () => void): T {
  const [state, setState] = useState<T>(load);
  useEffect(() => {
    setState(load());
    return subscribe(() => setState(load()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

function DataRetentionSection() {
  const kpi = useLive(loadKpiOverrides, subscribeKpiOverrides);
  const payments = useLive(loadPayments, subscribePayments);
  const [months, setMonths] = useState<number>(() => getRetentionMonths());

  const cutoff = useMemo(() => retentionCutoffMs(months), [months, kpi, payments]);

  const kpiOld = useMemo(
    () => kpi.filter((o) => +new Date(o.created_at) < cutoff),
    [kpi, cutoff],
  );
  const paymentsOld = useMemo(
    () => payments.filter((p) => +new Date(p.paid_at) < cutoff),
    [payments, cutoff],
  );

  const commitMonths = (v: number) => {
    const n = Math.max(1, Math.min(120, Math.round(v || 0)));
    setMonths(n);
    setRetentionMonths(n);
  };

  const exportAndPruneKpi = () => {
    if (kpiOld.length === 0) return;
    const ok = window.confirm(
      `Export and delete ${kpiOld.length} KPI override entr${kpiOld.length === 1 ? "y" : "ies"} older than ${months} month${months === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!ok) return;
    downloadJson(`kpi-overrides-export-${todayStamp()}.json`, kpiOld);
    const kept = loadKpiOverrides().filter((o) => +new Date(o.created_at) >= cutoff);
    replaceKpiOverrides(kept);
  };

  const exportAndPrunePayments = () => {
    if (paymentsOld.length === 0) return;
    const ok = window.confirm(
      `Export and delete ${paymentsOld.length} payment log entr${paymentsOld.length === 1 ? "y" : "ies"} older than ${months} month${months === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!ok) return;
    downloadJson(`payments-log-export-${todayStamp()}.json`, paymentsOld);
    const kept = loadPayments().filter((p) => +new Date(p.paid_at) >= cutoff);
    replacePayments(kept);
  };

  const rows = [
    { key: "kpi", name: "KPI overrides", total: kpi.length, old: kpiOld.length, onClick: exportAndPruneKpi },
    { key: "pay", name: "Payments log", total: payments.length, old: paymentsOld.length, onClick: exportAndPrunePayments },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Data Retention</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Export and prune unbounded logs older than the retention window. Entries within the window stay intact.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Retention period (months)</label>
          <input
            type="number"
            min={1}
            max={120}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            onBlur={(e) => commitMonths(Number(e.target.value))}
            className="mt-1 w-28 rounded-md border border-border bg-background px-2.5 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">{r.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {r.total} total · {r.old} older than {months} month{months === 1 ? "" : "s"}
              </div>
            </div>
            {r.old === 0 ? (
              <GhostButton disabled className="cursor-not-allowed opacity-50">Nothing to clean up</GhostButton>
            ) : (
              <PrimaryButton onClick={r.onClick}>Export & Clean up</PrimaryButton>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

