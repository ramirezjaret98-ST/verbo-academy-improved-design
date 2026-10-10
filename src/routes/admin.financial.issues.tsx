import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Pill } from "@/components/verbo/ui";
import { userById } from "@/lib/mock-data";
import { useFinancialIssues, updateFinancialIssue } from "@/lib/financial-issues-store";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/admin/financial/issues")({ component: FinancialIssuesPage });

function FinancialIssuesPage() {
  const reports = useFinancialIssues();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const close = async (id: string, status: "resolved" | "dismissed", currentNote?: string) => {
    const note = (drafts[id] ?? currentNote ?? "").trim();
    if (!note) { notifyError("Add a resolution note before closing the report."); return; }
    setSaving(id);
    try {
      await updateFinancialIssue(id, status, note);
      notifySuccess("Financial issue updated.");
    } catch (error) { notifyError(error, { context: "Updating financial issue" }); }
    finally { setSaving(null); }
  };

  return <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">Financial Issues</h1>
      <p className="mt-2 text-sm text-muted-foreground">Reports from teachers. Record what was checked before resolving or dismissing one.</p>
    </header>
    {reports.length === 0 && <Card><p className="text-sm text-muted-foreground">No financial issues reported.</p></Card>}
    {reports.map((report) => <Card key={report.id} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-foreground">{userById(report.teacher_id)?.name ?? "Teacher"}</div>
          <div className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()}</div>
        </div>
        <Pill tone={report.status === "pending" ? "warning" : report.status === "resolved" ? "success" : "muted"}>{report.status}</Pill>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{report.text}</p>
      <label className="block text-xs text-muted-foreground">Resolution for teacher
        <textarea value={drafts[report.id] ?? report.resolution_note ?? ""}
          onChange={(event) => setDrafts((current) => ({ ...current, [report.id]: event.target.value }))}
          rows={2} placeholder="What was checked or corrected?"
          className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground" />
      </label>
      {report.resolved_at && <p className="text-xs text-muted-foreground">Closed {new Date(report.resolved_at).toLocaleString()}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={saving === report.id} onClick={() => void close(report.id, "dismissed", report.resolution_note)}
          className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">Dismiss</button>
        <button type="button" disabled={saving === report.id} onClick={() => void close(report.id, "resolved", report.resolution_note)}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Resolve</button>
      </div>
    </Card>)}
  </div>;
}
