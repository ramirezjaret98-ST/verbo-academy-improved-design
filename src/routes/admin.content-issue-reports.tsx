// Admin > Technical Issues.
// List of technical/content issues reported by students from a unit detail view
// or from a challenge. Most recent first. Admins can mark each one as resolved
// or dismissed.
import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { LifeBuoy, Check, X } from "lucide-react";
import { Card, Pill } from "@/components/verbo/ui";
import { USERS, userById } from "@/lib/mock-data";
import {
  loadContentIssueReports,
  subscribeContentIssueReports,
  updateContentIssueReport,
  type ContentIssueReport,
  type ContentIssueReportStatus,
} from "@/lib/content-issue-reports-store";

export const Route = createFileRoute("/admin/content-issue-reports")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Technical Issues · Verbo Academy Admin" },
      { name: "description", content: "Review, resolve or dismiss technical issues students reported on course units and challenges." },
      { property: "og:title", content: "Technical Issues · Verbo Academy Admin" },
      { property: "og:description", content: "Review, resolve or dismiss technical issues students reported on course units and challenges." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function nameFor(id: string) {
  return userById(id)?.name ?? USERS.find((u) => u.id === id)?.name ?? "Unknown";
}

const STATUS_TONE: Record<ContentIssueReportStatus, "warning" | "success" | "muted"> = {
  pending: "warning",
  resolved: "success",
  dismissed: "muted",
};

const STATUS_LABEL: Record<ContentIssueReportStatus, string> = {
  pending: "Pending",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

function Page() {
  const reports = useSyncExternalStore(
    subscribeContentIssueReports,
    loadContentIssueReports,
    () => [] as ContentIssueReport[],
  );

  const sorted = [...reports].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );


  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Technical Issues</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Technical problems students reported from a course unit or a challenge —
          broken files, content that won't load, submissions or streaks not counted.
          Mark each one as resolved or dismissed once you've handled it.
        </p>
      </header>

      {sorted.length === 0 ? (
        <Card>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LifeBuoy className="h-4 w-4" />
            No technical issues have been reported yet.
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Student</th>
                <th className="px-6 py-3 font-medium">Where</th>
                <th className="px-6 py-3 font-medium">Issue</th>
                <th className="px-6 py-3 font-medium">Details</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                    {fmt(r.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{nameFor(r.studentId)}</div>
                    <div className="text-xs text-muted-foreground">Student</div>
                  </td>
                  <td className="px-6 py-4">
                    <Pill tone={r.entityType === "challenge" ? "warning" : "muted"}>
                      {r.entityType === "challenge" ? "Challenge" : "Unit"}
                    </Pill>
                    <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                      {r.entityTitle || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">{r.issueType}</td>
                  <td className="px-6 py-4 text-foreground">
                    <p className="max-w-md whitespace-pre-wrap text-sm leading-relaxed">
                      {r.detail || <span className="text-muted-foreground">No extra details.</span>}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                    {r.resolved_at && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {fmt(r.resolved_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => updateContentIssueReport(r.id, { status: "resolved" })}
                        disabled={r.status === "resolved"}
                        aria-label="Mark as resolved"
                        title="Mark as resolved"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-success/10 hover:text-success disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateContentIssueReport(r.id, { status: "dismissed" })}
                        disabled={r.status === "dismissed"}
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
