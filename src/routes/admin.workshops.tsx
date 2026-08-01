import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, Pencil, ArrowLeft, ChevronRight, Sparkles, Users,
  Video, Link2, CalendarPlus, Search, X, GraduationCap, Image as ImageIcon,
  Lock, Unlock, User as UserIcon, Info,
} from "lucide-react";
import { Card, GhostButton, PrimaryButton, Pill } from "@/components/verbo/ui";
import {
  ActivityModal, Field, ModalFooter, ModalShell, inputCls, textareaCls,
} from "@/components/verbo/course-modals";
import { activitiesForUnit, loadActivities } from "@/lib/activities-store";
import { USERS } from "@/lib/mock-data";
import {
  type WorkshopCohort, type WorkshopParticipant, type WorkshopTemplate,
  type WorkshopUnit, isUnitOpenFor, loadWorkshops, newCohort, newTemplate,
  newUnit, persistWorkshops, subscribeWorkshops,
} from "@/lib/workshops-store";
import {
  type ExtSession, type ExtSessionStatus,
  addWorkshopSession, removeWorkshopSession, sessionsForCohort,
  subscribeSessions, syncCohortFieldsToSessions, updateWorkshopSession,
  WORKSHOP_STATUS_META, WORKSHOP_STATUS_OPTIONS,
} from "@/lib/sessions-store";
import { hydrateStudents } from "@/lib/students-store";

export const Route = createFileRoute("/admin/workshops")({ component: Page });

function Page() {
  const [templates, setTemplates] = useState<WorkshopTemplate[]>(loadWorkshops);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tplModal, setTplModal] = useState<{ mode: "create" | "edit"; template?: WorkshopTemplate } | null>(null);

  useEffect(() => {
    hydrateStudents();
    setTemplates(loadWorkshops());
    return subscribeWorkshops(() => setTemplates(loadWorkshops()));
  }, []);

  const activeTemplate = openId ? templates.find((t) => t.id === openId) ?? null : null;

  const persist = (updater: (prev: WorkshopTemplate[]) => WorkshopTemplate[]) => {
    setTemplates((prev) => {
      const next = updater(prev);
      persistWorkshops(next);
      return next;
    });
  };

  const saveTemplate = (t: WorkshopTemplate) => persist((prev) => {
    const idx = prev.findIndex((x) => x.id === t.id);
    if (idx < 0) return [...prev, t];
    const next = [...prev]; next[idx] = t; return next;
  });

  const deleteTemplate = (id: string) => {
    if (!confirm("Delete this workshop template and all its cohorts?")) return;
    persist((prev) => prev.filter((t) => t.id !== id));
    if (openId === id) setOpenId(null);
  };

  /* ---------------- Screen 1: list of templates ---------------- */
  if (!activeTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Focus Workshops</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Complementary short-form workshops. Create a template, add units, then open a cohort with 1–4 participants and 1 teacher.
            </p>
          </div>
          <PrimaryButton onClick={() => setTplModal({ mode: "create" })}>
            <Plus className="h-3.5 w-3.5" /> Create Workshop
          </PrimaryButton>
        </div>

        {templates.length === 0 ? (
          <Card>
            <div className="py-12 text-center text-sm text-muted-foreground">
              No workshop templates yet. Create your first one to start adding units and cohorts.
            </div>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-elevated">
                <button className="text-left" onClick={() => setOpenId(t.id)}>
                  <div className="relative h-32 w-full bg-gradient-to-br from-[#01304a] to-[#024366]">
                    {t.cover_url ? (
                      <img src={t.cover_url} alt={t.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/70">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="text-base font-semibold tracking-tight text-foreground">{t.name}</div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.description || "No description yet."}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Pill tone={t.units.length ? "success" : "muted"}>{t.units.length} units</Pill>
                      <Pill tone={t.cohorts.length ? "default" : "muted"}>{t.cohorts.length} cohorts</Pill>
                    </div>
                  </div>
                </button>
                <div className="flex items-center justify-end gap-1 border-t border-border px-4 py-2">
                  <button
                    onClick={() => setTplModal({ mode: "edit", template: t })}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#f38934]"
                    aria-label="Edit template"
                  ><Pencil className="h-4 w-4" /></button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    aria-label="Delete template"
                  ><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tplModal && (
          <TemplateModal
            editing={tplModal.mode === "edit" ? tplModal.template : undefined}
            onClose={() => setTplModal(null)}
            onSave={(name, description, cover_url) => {
              if (tplModal.mode === "edit" && tplModal.template) {
                saveTemplate({ ...tplModal.template, name, description, cover_url });
              } else {
                saveTemplate(newTemplate(name, description, cover_url));
              }
              setTplModal(null);
            }}
          />
        )}
      </div>
    );
  }

  /* ---------------- Screen 2: template detail ---------------- */
  return (
    <TemplateDetail
      template={activeTemplate}
      onBack={() => setOpenId(null)}
      onChange={saveTemplate}
    />
  );
}

/* ============================================================
   Template modal
============================================================ */
function TemplateModal({ editing, onClose, onSave }: {
  editing?: WorkshopTemplate;
  onClose: () => void;
  onSave: (name: string, description: string, cover_url: string) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [cover, setCover] = useState(editing?.cover_url ?? "");

  return (
    <ModalShell
      title={editing ? "Edit Workshop" : "New Workshop"}
      subtitle="Create only the template — units and cohorts are added afterwards."
      onClose={onClose}
    >
      <div className="space-y-4 p-6">
        <Field label="Workshop Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Public Speaking Bootcamp" />
        </Field>
        <Field label="Short Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={textareaCls} placeholder="A one-paragraph pitch of what students will get out of this workshop." />
        </Field>
        <Field label="Cover Image URL (optional)" hint="Public image URL. Leave empty to use a default gradient.">
          <input value={cover} onChange={(e) => setCover(e.target.value)} className={inputCls} placeholder="https://…" />
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton disabled={!name.trim()} onClick={() => onSave(name.trim(), description.trim(), cover.trim())}>
          {editing ? "Save Changes" : "Create Workshop"}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

/* ============================================================
   Template detail (Units + Cohorts)
============================================================ */
function TemplateDetail({ template, onBack, onChange }: {
  template: WorkshopTemplate;
  onBack: () => void;
  onChange: (t: WorkshopTemplate) => void;
}) {
  const [tab, setTab] = useState<"units" | "cohorts">("units");
  const [unitModal, setUnitModal] = useState<{ mode: "create" | "edit"; unit?: WorkshopUnit } | null>(null);
  const [actModalUnit, setActModalUnit] = useState<{ unitId: string; unitTitle: string } | null>(null);
  const [activityRev, setActivityRev] = useState(0);
  const [cohortModal, setCohortModal] = useState<{ mode: "create" | "edit"; cohort?: WorkshopCohort } | null>(null);

  const allActivities = useMemo(() => loadActivities(), [activityRev]);

  const mutateUnits = (fn: (u: WorkshopUnit[]) => WorkshopUnit[]) => {
    onChange({ ...template, units: fn(template.units) });
  };
  const mutateCohorts = (fn: (c: WorkshopCohort[]) => WorkshopCohort[]) => {
    onChange({ ...template, cohorts: fn(template.cohorts) });
  };

  const createUnit = (title: string, video: string, pdf: string) => {
    const u = newUnit(template.id, template.units, title, video, pdf);
    mutateUnits((units) => [...units, u]);
  };
  const updateUnit = (id: string, title: string, video: string, pdf: string) => {
    mutateUnits((units) => units.map((u) => (u.id === id ? { ...u, title, video_url: video, pdf_url: pdf } : u)));
  };
  const deleteUnit = (id: string) => {
    if (!confirm("Delete this unit and its activities? Cohort openness for this unit will also be removed.")) return;
    mutateUnits((units) => units.filter((u) => u.id !== id));
    // Clean up openness records
    mutateCohorts((cs) => cs.map((c) => {
      const { [id]: _dropped, ...rest } = c.cohort_open;
      const perP: Record<string, Record<string, boolean>> = {};
      for (const [pid, m] of Object.entries(c.per_participant_open ?? {})) {
        const { [id]: _, ...rm } = m; perP[pid] = rm;
      }
      return { ...c, cohort_open: rest, per_participant_open: perP };
    }));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <GhostButton onClick={onBack}><ArrowLeft className="h-3.5 w-3.5" /> All workshops</GhostButton>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button className="hover:text-foreground" onClick={onBack}>Focus Workshops</button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{template.name}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{template.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{template.description || "No description yet."}</p>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1">
        <button onClick={() => setTab("units")} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tab === "units" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Units · {template.units.length}
        </button>
        <button onClick={() => setTab("cohorts")} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tab === "cohorts" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Cohorts / Assignments · {template.cohorts.length}
        </button>
      </div>

      {tab === "units" && (
        <>
          <div className="flex items-center justify-end">
            <GhostButton onClick={() => setUnitModal({ mode: "create" })}>
              <Plus className="h-3.5 w-3.5" /> Add Unit
            </GhostButton>
          </div>
          <Card className="!p-0">
            {template.units.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">No units yet. Add as many as this workshop needs — no fixed count.</div>
            )}
            {template.units.map((u, i) => {
              const count = allActivities.filter((a) => a.unit_id === u.id).length;
              return (
                <div key={u.id} className={`flex items-center justify-between gap-4 px-6 py-4 ${i ? "border-t border-border" : ""}`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{u.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{u.id}</span>
                      <span>•</span>
                      <Pill tone={count ? "success" : "muted"}>{count} {count === 1 ? "activity" : "activities"}</Pill>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PrimaryButton onClick={() => setActModalUnit({ unitId: u.id, unitTitle: u.title })}>
                      <Sparkles className="h-3.5 w-3.5" /> Add Activities
                    </PrimaryButton>
                    <button onClick={() => setUnitModal({ mode: "edit", unit: u })} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#f38934]" aria-label="Edit unit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => deleteUnit(u.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" aria-label="Delete unit"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      {tab === "cohorts" && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A cohort is a real workshop instance. This section is the only source of truth for teacher, shared video-call link and per-unit openness.
            </div>
            <GhostButton onClick={() => setCohortModal({ mode: "create" })}>
              <Plus className="h-3.5 w-3.5" /> New Cohort
            </GhostButton>
          </div>

          {template.cohorts.length === 0 ? (
            <Card><div className="py-10 text-center text-sm text-muted-foreground">No cohorts yet.</div></Card>
          ) : (
            <div className="space-y-4">
              {template.cohorts.map((c) => (
                <CohortRow
                  key={c.id}
                  cohort={c}
                  template={template}
                  units={template.units}
                  onEdit={() => setCohortModal({ mode: "edit", cohort: c })}
                  onDelete={() => {
                    if (!confirm("Delete this cohort?")) return;
                    mutateCohorts((cs) => cs.filter((x) => x.id !== c.id));
                  }}
                  onChange={(next) => mutateCohorts((cs) => cs.map((x) => (x.id === c.id ? next : x)))}
                />
              ))}
            </div>
          )}
        </>
      )}

      {unitModal && (
        <UnitModal
          editingUnit={unitModal.mode === "edit" ? unitModal.unit : undefined}
          onClose={() => setUnitModal(null)}
          onCreate={(title, video, pdf) => { createUnit(title, video, pdf); setUnitModal(null); }}
          onUpdate={(id, title, video, pdf) => { updateUnit(id, title, video, pdf); setUnitModal(null); }}
        />
      )}
      {actModalUnit && (
        <ActivityModal
          unitId={actModalUnit.unitId}
          unitTitle={actModalUnit.unitTitle}
          onClose={() => { setActModalUnit(null); setActivityRev((r) => r + 1); }}
        />
      )}
      {cohortModal && (
        <CohortModal
          editing={cohortModal.mode === "edit" ? cohortModal.cohort : undefined}
          onClose={() => setCohortModal(null)}
          onSave={(cohort) => {
            mutateCohorts((cs) => {
              const idx = cs.findIndex((c) => c.id === cohort.id);
              if (idx < 0) return [...cs, cohort];
              const next = [...cs]; next[idx] = cohort; return next;
            });
            // Keep the shared sessions store in sync when teacher or the
            // shared video-call link change — cohort is the source of truth.
            syncCohortFieldsToSessions(cohort.id, {
              teacher_id: cohort.teacher_id,
              teams_link: cohort.video_call_link,
            });
            setCohortModal(null);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Unit modal (Focus Workshops — no unit-number constraint)
============================================================ */
function UnitModal({ editingUnit, onClose, onCreate, onUpdate }: {
  editingUnit?: WorkshopUnit;
  onClose: () => void;
  onCreate: (title: string, video: string, pdf: string) => void;
  onUpdate: (id: string, title: string, video: string, pdf: string) => void;
}) {
  const isEdit = !!editingUnit;
  const [title, setTitle] = useState(isEdit ? editingUnit!.title : "");
  const [videoUrl, setVideoUrl] = useState(isEdit ? editingUnit!.video_url : "");
  const [pdfUrl, setPdfUrl] = useState(isEdit ? editingUnit!.pdf_url : "");

  const handleSave = () => {
    if (isEdit) onUpdate(editingUnit!.id, title.trim(), videoUrl.trim(), pdfUrl.trim());
    else onCreate(title.trim(), videoUrl.trim(), pdfUrl.trim());
  };

  return (
    <ModalShell title={isEdit ? "Edit Unit" : "New Unit"} subtitle={isEdit ? "Update this workshop unit. Activities remain untouched." : "Add a unit. You can attach activities afterwards."} onClose={onClose}>
      <div className="space-y-4 p-6">
        <Field label="Unit Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Stage presence fundamentals" />
        </Field>
        <Field label="Lesson Video URL">
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={inputCls} placeholder="https://youtube.com/watch?v=... or vimeo link" />
        </Field>
        <Field label="Study Guide PDF URL" hint="Paste a public document or cloud storage link.">
          <input value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} className={inputCls} placeholder="https://…" />
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton disabled={!title.trim()} onClick={handleSave}>{isEdit ? "Save Changes" : "Create unit"}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

/* ============================================================
   Cohort row (compact card in list)
============================================================ */
function CohortRow({ cohort, template, units, onEdit, onDelete, onChange }: {
  cohort: WorkshopCohort;
  template: WorkshopTemplate;
  units: WorkshopUnit[];
  onEdit: () => void;
  onDelete: () => void;
  onChange: (next: WorkshopCohort) => void;
}) {
  const teacher = USERS.find((u) => u.id === cohort.teacher_id && u.role === "teacher");
  const openUnitCount = units.filter((u) => !!cohort.cohort_open?.[u.id]).length;

  const toggleCohortUnit = (unitId: string) => {
    const nextOpen = !cohort.cohort_open?.[unitId];
    onChange({ ...cohort, cohort_open: { ...cohort.cohort_open, [unitId]: nextOpen } });
  };
  const togglePerParticipant = (pid: string, unitId: string) => {
    const current = isUnitOpenFor(cohort, pid, unitId);
    const nextPer = { ...(cohort.per_participant_open ?? {}) };
    nextPer[pid] = { ...(nextPer[pid] ?? {}), [unitId]: !current };
    onChange({ ...cohort, per_participant_open: nextPer });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-foreground">{cohort.name || "Untitled cohort"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Pill tone={cohort.participants.length ? "success" : "muted"}>
              <Users className="mr-1 h-3 w-3" /> {cohort.participants.length}/4 participants
            </Pill>
            <Pill tone={teacher ? "default" : "muted"}>
              <GraduationCap className="mr-1 h-3 w-3" /> {teacher ? teacher.name : "No teacher"}
            </Pill>
            <Pill tone={cohort.video_call_link ? "success" : "muted"}>
              <Video className="mr-1 h-3 w-3" /> {cohort.video_call_link ? "Link set" : "No link"}
            </Pill>
            <Pill tone={openUnitCount ? "success" : "muted"}>
              {openUnitCount}/{units.length} units open (cohort-wide)
            </Pill>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-[#f38934]" aria-label="Edit cohort"><Pencil className="h-4 w-4" /></button>
          <button onClick={onDelete} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" aria-label="Delete cohort"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      {cohort.participants.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cohort.participants.map((p) => (
            <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${p.kind === "student" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
              <UserIcon className="h-3 w-3" /> {p.name}{p.kind === "standalone" && <span className="opacity-60"> (standalone)</span>}
            </span>
          ))}
        </div>
      )}

      {/* Per-unit openness matrix */}
      {units.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit access</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="pl-2">Unit</th>
                  <th className="px-2">Cohort default</th>
                  {cohort.participants.map((p) => (
                    <th key={p.id} className="px-2 truncate">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  const cohortOpen = !!cohort.cohort_open?.[u.id];
                  return (
                    <tr key={u.id} className="rounded-lg bg-secondary/30">
                      <td className="rounded-l-lg px-2 py-2 font-medium text-foreground">{u.title}</td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => toggleCohortUnit(u.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cohortOpen ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                        >
                          {cohortOpen ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {cohortOpen ? "Open" : "Closed"}
                        </button>
                      </td>
                      {cohort.participants.map((p, idx) => {
                        const open = isUnitOpenFor(cohort, p.id, u.id);
                        const overridden = typeof cohort.per_participant_open?.[p.id]?.[u.id] === "boolean";
                        const isLast = idx === cohort.participants.length - 1;
                        return (
                          <td key={p.id} className={`px-2 py-2 ${isLast ? "rounded-r-lg" : ""}`}>
                            <button
                              onClick={() => togglePerParticipant(p.id, u.id)}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${open ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"} ${overridden ? "ring-1 ring-accent/60" : ""}`}
                              title={overridden ? "Overrides cohort default" : "Inheriting cohort default"}
                            >
                              {open ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {open ? "Open" : "Closed"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Units start Closed. Open never re-closes automatically — access is cumulative.
          </div>
        </div>
      )}

      {/* Live sessions — live records from Admin > Sessions (origin: workshop). */}
      <CohortLiveSessions cohort={cohort} template={template} />
    </div>
  );
}

/* ============================================================
   Cohort live sessions — reads/writes the shared sessions store.
   No separate calendar: every row is a record in Admin > Sessions
   with origin="workshop" and workshop_cohort_id=<cohort.id>.
============================================================ */
function CohortLiveSessions({ cohort, template }: { cohort: WorkshopCohort; template: WorkshopTemplate }) {
  const [sessions, setSessions] = useState<ExtSession[]>(() => sessionsForCohort(cohort.id));
  useEffect(() => {
    const refresh = () => setSessions(sessionsForCohort(cohort.id));
    refresh();
    return subscribeSessions(refresh);
  }, [cohort.id]);

  const teacher = USERS.find((u) => u.id === cohort.teacher_id && u.role === "teacher");
  const canAdd = !!cohort.teacher_id;

  const add = () => {
    if (!canAdd) return;
    addWorkshopSession({
      cohortId: cohort.id,
      templateId: template.id,
      teacherId: cohort.teacher_id,
      teamsLink: cohort.video_call_link,
    });
  };

  const rows = sessions
    .slice()
    .sort((a, b) => (a.date_time || "").localeCompare(b.date_time || ""));

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live sessions</div>
          <div className="mt-0.5 text-[10.5px] text-muted-foreground">
            Shared with Admin › Sessions. Origin: <span className="font-semibold text-foreground">Workshop</span>
            {teacher ? <> · Teacher hours accrue to {teacher.name}.</> : <> · Assign a teacher to enable scheduling.</>}
          </div>
        </div>
        <button
          onClick={add}
          disabled={!canAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarPlus className="h-3 w-3" /> Add session
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
          No sessions scheduled yet. Sessions created here appear in Admin › Sessions with the same lifecycle (Scheduled → Ready → Completed…).
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => {
            const meta = WORKSHOP_STATUS_META[s.status];
            return (
              <li key={s.id} className="grid gap-2 rounded-lg border border-border bg-background p-2 sm:grid-cols-[200px_1fr_150px_36px]">
                <input
                  type="datetime-local"
                  value={s.date_time ? s.date_time.slice(0, 16) : ""}
                  onChange={(e) => updateWorkshopSession(s.id, {
                    date_time: e.target.value ? new Date(e.target.value).toISOString() : "",
                  })}
                  className={inputCls}
                />
                <input
                  value={s.workshop_topic ?? ""}
                  onChange={(e) => updateWorkshopSession(s.id, { workshop_topic: e.target.value })}
                  className={inputCls}
                  placeholder="Topic / note (optional)"
                />
                <select
                  value={s.status}
                  onChange={(e) => updateWorkshopSession(s.id, { status: e.target.value as ExtSessionStatus })}
                  className="w-full cursor-pointer rounded-lg border border-input px-2 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"
                  style={{ backgroundColor: meta.bg, color: meta.color }}
                >
                  {WORKSHOP_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st} style={{ backgroundColor: "#fff", color: "#111" }}>
                      {WORKSHOP_STATUS_META[st].label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => { if (confirm("Delete this workshop session?")) removeWorkshopSession(s.id); }}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive"
                  aria-label="Delete session"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============================================================
   Cohort modal (create/edit — participants, teacher, link, name)
============================================================ */
function CohortModal({ editing, onClose, onSave }: {
  editing?: WorkshopCohort;
  onClose: () => void;
  onSave: (cohort: WorkshopCohort) => void;
}) {
  const seed = editing ?? newCohort("");
  const [name, setName] = useState(seed.name);
  const [teacherId, setTeacherId] = useState(seed.teacher_id);
  const [videoLink, setVideoLink] = useState(seed.video_call_link);
  const [participants, setParticipants] = useState<WorkshopParticipant[]>(seed.participants);
  const [query, setQuery] = useState("");
  const [standaloneName, setStandaloneName] = useState("");

  const teachers = USERS.filter((u) => u.role === "teacher");
  const students = USERS.filter((u) => u.role === "student");

  const selectedIds = new Set(participants.map((p) => p.id));
  const q = query.trim().toLowerCase();
  const suggestions = q
    ? students.filter((s) => !selectedIds.has(s.id) && s.name.toLowerCase().includes(q)).slice(0, 6)
    : [];

  const canAdd = participants.length < 4;

  const addStudent = (id: string, nm: string) => {
    if (!canAdd) return;
    setParticipants((prev) => [...prev, { id, name: nm, kind: "student" }]);
    setQuery("");
  };
  const addStandalone = () => {
    const nm = standaloneName.trim();
    if (!nm || !canAdd) return;
    const id = `sa-${Math.random().toString(36).slice(2, 10)}`;
    setParticipants((prev) => [...prev, { id, name: nm, kind: "standalone" }]);
    setStandaloneName("");
  };
  const removeParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSave = () => {
    if (!name.trim()) { alert("Give the cohort a name."); return; }
    if (participants.length === 0) { alert("Add at least one participant."); return; }
    onSave({
      ...seed,
      name: name.trim(),
      teacher_id: teacherId,
      video_call_link: videoLink.trim(),
      participants,
    });
  };

  return (
    <ModalShell title={editing ? "Edit Cohort" : "New Cohort"} subtitle="Real workshop instance. Assign 1–4 participants and one teacher." onClose={onClose} width="max-w-2xl">
      <div className="space-y-4 p-6">
        <Field label="Cohort Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. July batch — Monterrey" />
        </Field>

        <Field label={`Participants (${participants.length}/4)`} hint="Search existing students or register a standalone name.">
          <div className="space-y-2">
            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {participants.map((p) => (
                  <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${p.kind === "student" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                    <UserIcon className="h-3 w-3" />
                    {p.name}{p.kind === "standalone" && <span className="opacity-60"> (standalone)</span>}
                    <button onClick={() => removeParticipant(p.id)} className="ml-1 opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!canAdd}
                className={`${inputCls} pl-9`}
                placeholder={canAdd ? "Search existing students…" : "Cohort full (4 participants)"}
              />
              {suggestions.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  {suggestions.map((s) => (
                    <button key={s.id} onClick={() => addStudent(s.id, s.name)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-secondary">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">· {s.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={standaloneName}
                onChange={(e) => setStandaloneName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStandalone(); } }}
                disabled={!canAdd}
                className={inputCls}
                placeholder="Add a standalone participant by name…"
              />
              <GhostButton onClick={addStandalone} disabled={!canAdd || !standaloneName.trim()}>
                <Plus className="h-3.5 w-3.5" /> Add
              </GhostButton>
            </div>
          </div>
        </Field>

        <Field label="Assign Teacher">
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inputCls}>
            <option value="">— Select a teacher —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Video Call Link" hint="Shared host/guest link for every session of this cohort.">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={videoLink} onChange={(e) => setVideoLink(e.target.value)} className={`${inputCls} pl-9`} placeholder="https://meet.google.com/… or Zoom link" />
          </div>
        </Field>
      </div>
      <ModalFooter>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={handleSave}>{editing ? "Save Changes" : "Create Cohort"}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}