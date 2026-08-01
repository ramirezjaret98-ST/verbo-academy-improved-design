import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Video } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card, Pill, SectionTitle } from "@/components/verbo/ui";
import {
  loadWorkshops,
  subscribeWorkshops,
  type WorkshopTemplate,
  type WorkshopCohort,
} from "@/lib/workshops-store";

export const Route = createFileRoute("/teacher/workshops")({ component: Page });

function Page() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<WorkshopTemplate[]>([]);

  useEffect(() => {
    setTemplates(loadWorkshops());
    return subscribeWorkshops(() => setTemplates(loadWorkshops()));
  }, []);

  // Only cohorts assigned to the current teacher, paired with their template.
  const assigned = useMemo(() => {
    if (!user) return [] as { template: WorkshopTemplate; cohort: WorkshopCohort }[];
    const out: { template: WorkshopTemplate; cohort: WorkshopCohort }[] = [];
    for (const t of templates) {
      for (const c of t.cohorts) {
        if (c.teacher_id === user.id) out.push({ template: t, cohort: c });
      }
    }
    return out;
  }, [templates, user]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Focus Workshops</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cohorts assigned to you. Content is read-only — unit openness for students is managed by Admin.
        </p>
      </div>

      {assigned.length === 0 ? (
        <Card className="text-sm text-muted-foreground">No workshops assigned yet.</Card>
      ) : (
        <div className="space-y-6">
          {assigned.map(({ template, cohort }) => (
            <CohortCard key={cohort.id} template={template} cohort={cohort} />
          ))}
        </div>
      )}
    </div>
  );
}

function CohortCard({ template, cohort }: { template: WorkshopTemplate; cohort: WorkshopCohort }) {
  return (
    <Card className="!p-0 overflow-hidden">
      {template.cover_url ? (
        <div className="aspect-[5/1] w-full overflow-hidden border-b border-border bg-secondary">
          <img src={template.cover_url} alt={template.name} className="h-full w-full object-cover" />
        </div>
      ) : null}

      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {cohort.name}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{template.name}</h2>
            {template.description ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{template.description}</p>
            ) : null}
          </div>
          {cohort.video_call_link ? (
            <a
              href={cohort.video_call_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            >
              <Video className="h-3.5 w-3.5" /> Video call link
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">No video call link set</span>
          )}
        </div>

        <div>
          <SectionTitle>Participants</SectionTitle>
          {cohort.participants.length === 0 ? (
            <div className="text-sm text-muted-foreground">No participants yet.</div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {cohort.participants.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <span className="text-sm text-foreground">{p.name}</span>
                  <Pill tone={p.kind === "student" ? "default" : "muted"}>
                    {p.kind === "student" ? "Student" : "Standalone"}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle>Units</SectionTitle>
          {template.units.length === 0 ? (
            <div className="text-sm text-muted-foreground">No units defined for this workshop yet.</div>
          ) : (
            <ul className="space-y-3">
              {template.units.map((u, idx) => {
                const open = !!cohort.cohort_open?.[u.id];
                return (
                  <li key={u.id} className="rounded-xl border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Unit {idx + 1}
                        </div>
                        <div className="text-sm font-semibold text-foreground">{u.title}</div>
                      </div>
                      <Pill tone={open ? "success" : "muted"}>{open ? "Open" : "Closed"}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {u.video_url ? (
                        <a
                          href={u.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/70"
                        >
                          <Video className="h-3.5 w-3.5" /> Capsule
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      ) : null}
                      {u.pdf_url ? (
                        <a
                          href={u.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/70"
                        >
                          <FileText className="h-3.5 w-3.5" /> PDF
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </a>
                      ) : null}
                      {!u.video_url && !u.pdf_url ? (
                        <span className="text-xs text-muted-foreground">No content attached.</span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}