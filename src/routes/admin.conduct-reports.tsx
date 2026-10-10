// Admin > Conduct Reports.
// Read-only list of misconduct reports submitted by students against teachers
// or other students. Reporter identity is always visible to Admin — the
// anonymity is only towards the reported person. Admin records a response
// that the reporter can read in My Reports.
import { createFileRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";
import { ShieldAlert, Check, X } from "lucide-react";
import { Card, Pill } from "@/components/verbo/ui";
import { USERS, userById } from "@/lib/mock-data";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  loadConductReports,
  subscribeConductReports,
  updateConductReport,
  type ConductReport,
  type ConductReportStatus,
} from "@/lib/conduct-reports-store";

export const Route = createFileRoute("/admin/conduct-reports")({ component: Page });

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function nameFor(id: string) {
  return userById(id)?.name ?? USERS.find((u) => u.id === id)?.name ?? "Unknown";
}

const STATUS_TONE: Record<ConductReportStatus, "warning" | "success" | "muted"> = {
  pending: "warning",
  reviewed: "success",
  dismissed: "muted",
};

const STATUS_LABEL: Record<ConductReportStatus, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  dismissed: "Dismissed",
};

function Page() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const reports = useSyncExternalStore(
    subscribeConductReports,
    loadConductReports,
    () => [] as ConductReport[],
  );

  const sorted = [...reports].sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  );
  const setStatus = async (report: ConductReport, status: "reviewed" | "dismissed") => {
    const note = (drafts[report.id] ?? report.resolution_note ?? "").trim();
    if (!note) { notifyError("Add an outcome note before closing the report."); return; }
    setSaving(report.id);
    try {
      await updateConductReport(report.id, { status, resolution_note: note });
      notifySuccess("Report updated.");
    } catch (error) { notifyError(error, { context: "Updating conduct report" }); }
    finally { setSaving(null); }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Conduct Reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Misconduct reports submitted by students against teachers or other students.
          The reporter's identity is always visible here — the anonymity is only towards
          the reported person.
        </p>
      </header>

      {sorted.length === 0 ? (
        <Card>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            No conduct reports have been filed yet.
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Reporter</th>
                <th className="px-6 py-3 font-medium">Reported</th>
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-6 py-3 font-medium">Details</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                    {fmt(r.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{nameFor(r.reporter_id)}</div>
                    <div className="text-xs text-muted-foreground">Student</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{nameFor(r.target_id)}</div>
                    <div className="text-xs text-muted-foreground capitalize">{r.target_type}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Pill tone={r.category === "Harassment" ? "danger" : "warning"}>
                      {r.category}
                    </Pill>
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    <p className="max-w-md whitespace-pre-wrap text-sm leading-relaxed">
                      {r.text}
                    </p>
                    <label className="mt-2 block text-xs text-muted-foreground">Outcome for reporter
                      <textarea value={drafts[r.id] ?? r.resolution_note ?? ""}
                        onChange={(event) => setDrafts((current) => ({ ...current, [r.id]: event.target.value }))}
                        rows={2} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
                        placeholder="What action was taken? Avoid private details." />
                    </label>
                  </td>
                  <td className="px-6 py-4">
                    <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                    {r.reviewed_at && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {fmt(r.reviewed_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void setStatus(r, "reviewed")}
                        disabled={saving === r.id}
                        aria-label="Mark as reviewed"
                        title="Mark as reviewed"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-success/10 hover:text-success disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void setStatus(r, "dismissed")}
                        disabled={saving === r.id}
                        aria-label="Dismiss"
                        title="Dismiss"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

