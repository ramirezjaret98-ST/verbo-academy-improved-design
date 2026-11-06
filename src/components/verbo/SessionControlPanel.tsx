import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck, RefreshCw, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import { getAdminType } from "@/lib/admin-roles";
import { academyDateTime, academyISO } from "@/lib/academy-time";
import { subscribeSessions } from "@/lib/sessions-store";
import { subscribeExternalSchedule } from "@/lib/external-schedule-store";
import {
  controlFlags,
  outcomeLabels,
  type ConfirmationOutcome,
  type SessionControlData,
  type SessionControlRow,
} from "@/lib/session-control";
import {
  fetchConfirmationHistory,
  fetchSessionControl,
  saveSessionControl,
} from "@/lib/session-control-api";

const button =
  "rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f38934]";
const primary = `${button} bg-[#01304a] text-white`;
const input = "w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground";
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function SessionControlPanel({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  const type = getAdminType(user);
  if (!user || (admin && type !== "super_admin" && type !== "coordinator_ops")) return null;
  return <ControlContent key={`${user.id}:${admin}`} userId={user.id} admin={admin} />;
}

function ControlContent({ userId, admin }: { userId: string; admin: boolean }) {
  const [data, setData] = useState<SessionControlData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  const busy = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const next = await fetchSessionControl();
      if (!alive.current) return;
      offset.current = Date.parse(next.server_now) - Date.now();
      setClock(Date.now());
      setData(next);
      setError("");
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Could not load session control.");
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const onFocus = () => void refresh();
    const interval = window.setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    const unsub = subscribeSessions(onFocus);
    const unsubExternal = subscribeExternalSchedule(onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      alive.current = false;
      window.clearInterval(interval);
      unsub();
      unsubExternal();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  const now = clock + offset.current;
  const rows = data?.rows ?? [];
  const pending = rows.filter((r) => controlFlags(r, now).pending);
  const confirmations = rows.filter((r) => controlFlags(r, now).needsConfirmation).length;
  const reports = rows.filter((r) => controlFlags(r, now).needsReport).length;
  const differences = rows.filter((r) => controlFlags(r, now).discrepancy).length;
  const day = academyDateTime(new Date(now).toISOString()).slice(0, 10);
  const promptedDay = useRef("");
  useEffect(() => {
    if (admin || !data || !(confirmations || reports) || promptedDay.current === day) return;
    const key = `verbo:session-control:${userId}:${day}`;
    promptedDay.current = day;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "shown");
    } catch {
      /* Unavailable browser storage still allows this visit's prompt. */
    }
    setOpen(true);
  }, [admin, data, confirmations, reports, day, userId]);

  return (
    <>
      <Card className="mb-6 overflow-hidden border border-orange-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-orange-100 p-3 text-[#b52904]">
              <ClipboardCheck aria-hidden className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Session control</h2>
              <p className="text-sm text-muted-foreground">
                {admin
                  ? "Compare the schedule, teacher confirmation and reports."
                  : "Confirm what happened, then complete your reports."}
              </p>
              {data && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracking since {data.starts_on} · Mexico City time · Confirm the same day; reports
                  within 24h of session end.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className={button}
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh session control"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
            </button>
            <button className={primary} onClick={() => setOpen(true)}>
              Review sessions{pending.length ? ` (${pending.length})` : ""}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm" aria-live="polite">
          {[
            [confirmations, "To confirm"],
            [reports, "Reports pending"],
            [differences, "Differences"],
          ].map(([count, label]) => (
            <div className="rounded-xl bg-secondary/60 px-3 py-2" key={label}>
              <strong className="mr-2 text-xl">{data ? count : "—"}</strong>
              {label}
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            Could not refresh session control. {error}{" "}
            {data ? "Showing the last successful update." : "Please retry."}
          </p>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden rounded-2xl p-0 [&>button]:text-white">
          <DialogHeader className="shrink-0 bg-[#01304a] p-6 pr-12 text-white">
            <DialogTitle className="text-2xl">
              {admin ? "Session reconciliation" : "Confirm your sessions"}
            </DialogTitle>
            <DialogDescription className="text-white/80">
              A confirmation records what happened. The session report remains a separate step.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {error && (
              <p role="alert" className="mb-3 text-red-700">
                {error}{" "}
                <button className={button} onClick={() => void refresh()}>
                  Retry
                </button>
              </p>
            )}
            {!data ? (
              <p role="status">
                {loading ? "Loading sessions…" : "Session control is unavailable."}
              </p>
            ) : (
              <ControlList
                data={data}
                now={now}
                admin={admin}
                refresh={refresh}
                onNavigate={() => setOpen(false)}
              />
            )}
          </div>
          <div className="shrink-0 border-t p-4 text-xs text-muted-foreground">
            Closing this window keeps every pending item. Confirmations do not change session
            balances or teacher payments.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ControlList({
  data,
  now,
  admin,
  refresh,
  onNavigate,
}: {
  data: SessionControlData;
  now: number;
  admin: boolean;
  refresh: () => Promise<void>;
  onNavigate: () => void;
}) {
  const [filter, setFilter] = useState("pending");
  const [teacher, setTeacher] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const teachers = [...new Map(data.rows.map((r) => [r.teacher_id, r.teacher_name])).entries()];
  const rows = data.rows
    .filter((r) => {
      const f = controlFlags(r, now),
        day = academyDateTime(r.scheduled_at).slice(0, 10);
      return (
        (!teacher || r.teacher_id === teacher) &&
        (!from || day >= from) &&
        (!to || day <= to) &&
        `${r.label} ${r.teacher_name}`.toLowerCase().includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "pending" && f.pending) ||
          (filter === "confirm" && f.needsConfirmation) ||
          (filter === "reports" && f.needsReport) ||
          (filter === "differences" && f.discrepancy) ||
          (filter === "upcoming" && !f.finished))
      );
    })
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Session filters">
        {[
          ["pending", "Pending"],
          ["confirm", "To confirm"],
          ["reports", "Reports"],
          ["differences", "Differences"],
          ["upcoming", "Upcoming"],
          ["all", "All"],
        ].map(([key, label]) => (
          <button
            className={`${button} ${filter === key ? "bg-[#01304a] text-white" : "bg-background"}`}
            aria-pressed={filter === key}
            key={key}
            onClick={() => {
              setFilter(key);
              setEditing(null);
            }}
          >
            {label}
          </button>
        ))}
        {!admin && (
          <button className={`${button} ml-auto`} onClick={() => setMissing(!missing)}>
            Missing a session?
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">
          Search
          <input
            className={input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Student or teacher"
          />
        </label>
        {admin && (
          <label className="text-xs">
            Teacher
            <select className={input} value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">All teachers</option>
              {teachers.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs">
          From
          <input
            type="date"
            className={input}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Through
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {missing && (
        <MissingSession
          startsOn={data.starts_on}
          onSaved={async () => {
            await refresh();
            setMissing(false);
          }}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {rows.length} sessions · Dates and deadlines use Mexico City time. Filters can overlap.
      </p>
      {!rows.length && (
        <p className="rounded-xl bg-secondary p-6 text-center">No sessions match this view.</p>
      )}
      {rows.map((row) => (
        <SessionControlItem
          key={row.occurrence_key}
          row={row}
          now={now}
          admin={admin}
          editing={editing === row.occurrence_key}
          onEdit={() => setEditing(editing === row.occurrence_key ? null : row.occurrence_key)}
          onSaved={refresh}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function SessionControlItem({
  row,
  now,
  admin,
  editing,
  onEdit,
  onSaved,
  onNavigate,
}: {
  row: SessionControlRow;
  now: number;
  admin: boolean;
  editing: boolean;
  onEdit: () => void;
  onSaved: () => Promise<void>;
  onNavigate: () => void;
}) {
  const f = controlFlags(row, now),
    c = row.confirmation;
  const [history, setHistory] = useState<Awaited<
    ReturnType<typeof fetchConfirmationHistory>
  > | null>(null);
  const [historyError, setHistoryError] = useState("");
  return (
    <article
      className={`rounded-2xl border p-4 ${f.discrepancy ? "border-orange-300 bg-orange-50/40 dark:bg-orange-950/10" : "border-border"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {row.source === "academy"
              ? "Academy"
              : row.source === "external"
                ? "External"
                : "Declared missing"}
            {admin ? ` · ${row.teacher_name}` : ""}
          </p>
          <h3 className="text-lg font-semibold">{row.label}</h3>
          <p className="text-sm text-muted-foreground">
            {fmt(row.scheduled_at)} · {row.duration_minutes} min · CDMX
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs" aria-label="Session status">
          {!f.finished && (
            <span className="rounded-full bg-secondary px-3 py-1">
              Upcoming · confirmation unavailable
            </span>
          )}
          {f.needsConfirmation && (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-950">
              {f.confirmationOverdue ? "Confirmation overdue" : "Confirmation pending"}
            </span>
          )}
          {c && (
            <span className="rounded-full bg-secondary px-3 py-1">{outcomeLabels[c.outcome]}</span>
          )}
          {f.discrepancy && (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-950">
              Operations review needed
            </span>
          )}
          {f.needsReport && (
            <span
              className={`rounded-full px-3 py-1 ${f.reportOverdue ? "bg-red-100 text-red-900" : "bg-secondary"}`}
            >
              {f.reportOverdue ? "Report overdue" : "Report pending"}
            </span>
          )}
          {(row.report_at || c?.external_report_at) && (
            <span className="rounded-full bg-secondary px-3 py-1">
              Report submitted{f.reportLate ? " · late" : ""}
            </span>
          )}
          {c?.confirmation_late && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-900">Confirmed late</span>
          )}
          {f.complete && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-green-950">Reconciled</span>
          )}
        </div>
      </div>
      {row.stale && (
        <p className="mt-2 flex items-center gap-2 text-sm text-orange-800">
          <AlertTriangle className="size-4 shrink-0" />
          The schedule changed or this occurrence was removed after confirmation.
        </p>
      )}
      {c && (
        <p className="mt-2 text-xs text-muted-foreground">
          Confirmed {fmt(c.confirmed_at)}
          {c.reason ? ` · ${c.reason}` : ""}
        </p>
      )}
      {c?.external_report && (
        <p className="mt-2 whitespace-pre-wrap text-sm">{c.external_report}</p>
      )}
      {row.resolution_current && (
        <p className="mt-2 text-sm">Operations resolution: {c?.resolution_note}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {f.finished && (!admin || c) && (
          <button className={button} onClick={onEdit}>
            {editing
              ? "Close details"
              : admin
                ? "Review / resolve"
                : c
                  ? "Details / correct"
                  : "Confirm session"}
          </button>
        )}
        {!admin && row.source === "academy" && row.session_id && f.finished && (
          <Link
            className={primary}
            to="/teacher"
            onClick={onNavigate}
            search={{ report: String(row.session_id) }}
          >
            Open session report
          </Link>
        )}
        {admin && row.source === "academy" && row.session_id && (
          <a className={button} href={`/admin/calendar?highlight=${row.session_id}`}>
            Open in calendar
          </a>
        )}
        {c && (
          <button
            className={button}
            onClick={async () => {
              try {
                setHistoryError("");
                setHistory(history ? null : await fetchConfirmationHistory(row.occurrence_key));
              } catch (e) {
                setHistoryError(e instanceof Error ? e.message : "Could not load history.");
              }
            }}
          >
            History
          </button>
        )}
      </div>
      {historyError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {historyError}
        </p>
      )}
      {history && (
        <ol className="mt-3 space-y-2 border-l-2 pl-4 text-xs">
          {history.map((h) => (
            <li key={h.id}>
              <strong>{fmt(h.recorded_at)}</strong> · {h.before_record ? "Updated" : "Created"} ·
              {h.after_record.resolved_by === h.actor_id ? "Operations" : "Teacher"}
              <p>
                Outcome: {String(h.before_record?.outcome ?? "—")} →{" "}
                {String(h.after_record.outcome)} ·{" "}
                {String(h.after_record.reason || h.after_record.resolution_note || "No note")}
              </p>
              {h.after_record.external_report ? (
                <p className="whitespace-pre-wrap">
                  Report: {String(h.after_record.external_report)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <ConfirmationEditor
          key={`${row.occurrence_key}:${c?.revision ?? 0}`}
          row={row}
          admin={admin}
          onSaved={onSaved}
        />
      )}
    </article>
  );
}

function ConfirmationEditor({
  row,
  admin,
  onSaved,
}: {
  row: SessionControlRow;
  admin: boolean;
  onSaved: () => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<ConfirmationOutcome | "">("");
  const [reason, setReason] = useState("");
  const [report, setReport] = useState(row.confirmation?.external_report ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const save = async (action: string) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await saveSessionControl(row.occurrence_key, action, {
        outcome,
        reason,
        report,
        revision: row.confirmation?.revision ?? 0,
        scheduled_at: row.scheduled_at,
        duration_minutes: row.duration_minutes,
      });
      setSuccess("Saved. Refreshing the session list…");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Your entries are still here.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset disabled={busy} className="mt-4 space-y-3 rounded-xl bg-secondary/60 p-4">
      <legend className="text-sm font-semibold">
        {admin ? "Resolve this discrepancy" : "Record what happened"}
      </legend>
      {!admin && row.source !== "missing" && (
        <>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(outcomeLabels) as ConfirmationOutcome[]).map((value) => (
              <label
                className={`${button} cursor-pointer ${outcome === value ? "bg-[#01304a] text-white" : "bg-background"}`}
                key={value}
              >
                <input
                  type="radio"
                  name={`outcome-${row.occurrence_key}`}
                  value={value}
                  checked={outcome === value}
                  onChange={() => setOutcome(value)}
                  className="mr-2"
                />
                {outcomeLabels[value]}
              </label>
            ))}
          </div>
          {row.confirmation && (
            <p className="text-xs text-muted-foreground">
              A correction requires a reason and stays in the history. Correcting an external
              confirmation clears its previous report for a fresh submission.
            </p>
          )}
        </>
      )}
      {(admin || row.source !== "missing") && (
        <>
          <label className="block text-sm">
            {admin ? "Resolution and reason (required)" : "Reason / correction note"}
            <textarea
              className={input}
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={
                admin
                  ? "Explain how this difference was resolved."
                  : "Absence, cancellation, different time or another issue…"
              }
            />
          </label>
          <button
            className={primary}
            disabled={
              busy ||
              (admin
                ? reason.trim().length < 3
                : !outcome ||
                  ((outcome !== "held" || !!row.confirmation) && reason.trim().length < 3))
            }
            onClick={() => void save(admin ? "resolve" : "confirm")}
          >
            {busy ? "Saving…" : admin ? "Save resolution" : "Save confirmation"}
          </button>
        </>
      )}
      {!admin && row.source !== "academy" && row.confirmation?.outcome === "held" && !row.stale && (
        <div className="space-y-2 border-t pt-3">
          <label className="block text-sm">
            External session report
            <textarea
              className={input}
              value={report}
              onChange={(e) => setReport(e.target.value)}
              maxLength={6000}
              rows={3}
              placeholder="What was covered, progress and next steps."
            />
          </label>
          <button
            className={primary}
            disabled={busy || report.trim().length < 10}
            onClick={() => void save("report")}
          >
            Submit external report
          </button>
        </div>
      )}
      {admin && (
        <p className="text-xs text-muted-foreground">
          Resolution records your decision; it does not submit a teacher report or change the
          schedule, balances or payments.
        </p>
      )}
      {row.source === "missing" && !admin && (
        <p className="text-sm">Your declaration is waiting for operations review.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm">
          {success}
        </p>
      )}
    </fieldset>
  );
}

function MissingSession({ startsOn, onSaved }: { startsOn: string; onSaved: () => Promise<void> }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-2xl border border-orange-300 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await saveSessionControl("", "missing", {
            request_id: requestId,
            label,
            scheduled_at: academyISO(date),
            duration_minutes: duration,
            reason,
          });
          await onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not declare the session.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold">Declare a missing session</h3>
      <p className="text-xs text-muted-foreground">
        This creates a review item for operations. It does not add a payable class.
      </p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Student / session label
          <input
            className={input}
            required
            minLength={2}
            maxLength={200}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Start time (CDMX)
          <input
            className={input}
            type="datetime-local"
            min={`${startsOn}T00:00`}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Duration (minutes)
          <input
            className={input}
            type="number"
            min={1}
            max={480}
            required
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          Why is it missing?
          <textarea
            className={input}
            required
            minLength={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className={primary} type="submit">
          {busy ? "Saving…" : "Send for operations review"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
