import { createFileRoute } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { Card, Pill } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import { userById } from "@/lib/mock-data";
import { loadContentIssueReports, subscribeContentIssueReports, type ContentIssueReport } from "@/lib/content-issue-reports-store";
import { loadConductReports, subscribeConductReports, type ConductReport } from "@/lib/conduct-reports-store";

export const Route = createFileRoute("/student/reports")({ component: MyReportsPage });

const EMPTY_CONTENT: ContentIssueReport[] = [];
const EMPTY_CONDUCT: ConductReport[] = [];

function MyReportsPage() {
  const { user } = useAuth();
  const content = useSyncExternalStore(subscribeContentIssueReports, loadContentIssueReports, () => EMPTY_CONTENT)
    .filter((report) => report.studentId === user?.id);
  const conduct = useSyncExternalStore(subscribeConductReports, loadConductReports, () => EMPTY_CONDUCT)
    .filter((report) => report.reporter_id === user?.id);

  return <div className="space-y-6">
    <header>
      <h1 className="text-2xl font-semibold text-foreground">My Reports</h1>
      <p className="mt-2 text-sm text-muted-foreground">Follow the technical and conduct issues you sent to Verbo.</p>
    </header>
    {content.length === 0 && conduct.length === 0 && <Card><p className="text-sm text-muted-foreground">You have not sent a report yet.</p></Card>}
    {content.map((report) => <Card key={`technical-${report.id}`} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-foreground">Technical issue · {report.entityTitle || report.entityType}</div>
        <Pill tone={report.status === "pending" ? "warning" : report.status === "resolved" ? "success" : "muted"}>{report.status}</Pill>
      </div>
      <p className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString()} · {report.issueType}</p>
      {report.detail && <p className="whitespace-pre-wrap text-sm text-foreground">{report.detail}</p>}
      {report.resolution_note && <p className="rounded-lg bg-secondary p-3 text-sm text-foreground">Verbo response: {report.resolution_note}</p>}
    </Card>)}
    {conduct.map((report) => <Card key={`conduct-${report.id}`} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-foreground">Conduct report · {report.category}</div>
        <Pill tone={report.status === "pending" ? "warning" : report.status === "reviewed" ? "success" : "muted"}>{report.status}</Pill>
      </div>
      <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleString()} · {userById(report.target_id)?.name ?? report.target_type}</p>
      <p className="whitespace-pre-wrap text-sm text-foreground">{report.text}</p>
      {report.resolution_note && <p className="rounded-lg bg-secondary p-3 text-sm text-foreground">Verbo response: {report.resolution_note}</p>}
    </Card>)}
  </div>;
}
