// Focus Workshops — persisted catalog of workshop templates and their
// cohorts. This module is the ONLY source of truth for workshop content,
// assigned teacher, shared video-call link and per-unit openness. The
// Students admin form only READS/updates cohort membership through the
// helpers exposed here.

export interface WorkshopUnit {
  id: string; // WS-<templateId>-U<n>
  title: string;
  video_url: string;
  pdf_url: string;
}

export interface WorkshopParticipant {
  // id + display name. `kind` distinguishes a Student record from a
  // standalone (non-app) participant registered inline.
  id: string;
  name: string;
  kind: "student" | "standalone";
}

/** @deprecated Live sessions now live in the shared sessions store as
 *  records with `origin: "workshop"`. This shape is only kept so older
 *  persisted cohorts don't crash on load. */
export interface WorkshopSessionEntry {
  id: string;
  date: string;
  note: string;
}

export interface WorkshopCohort {
  id: string;
  name: string;
  participants: WorkshopParticipant[]; // 1..4
  teacher_id: string; // references USERS[teacher]
  video_call_link: string;
  // Per-unit openness controls. Default is Closed.
  // `cohort_open[unitId]` sets the base state for the whole cohort; a truthy
  // value in `per_participant_open[participantId]?.[unitId]` overrides it.
  cohort_open: Record<string, boolean>;
  per_participant_open: Record<string, Record<string, boolean>>;
  /** @deprecated Not written anymore — see sessions-store `sessionsForCohort`. */
  sessions?: WorkshopSessionEntry[];
}

export interface WorkshopTemplate {
  id: string;
  name: string;
  description: string;
  cover_url: string;
  units: WorkshopUnit[];
  cohorts: WorkshopCohort[];
}

export const WORKSHOPS_KEY = "verbo:workshops";
export const WORKSHOPS_EVENT = "verbo:workshops-updated";

export function loadWorkshops(): WorkshopTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKSHOPS_KEY);
    if (raw) return JSON.parse(raw) as WorkshopTemplate[];
  } catch { /* noop */ }
  return [];
}

export function persistWorkshops(list: WorkshopTemplate[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKSHOPS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(WORKSHOPS_EVENT));
  } catch { /* noop */ }
}

export function subscribeWorkshops(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === WORKSHOPS_KEY) cb(); };
  window.addEventListener(WORKSHOPS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(WORKSHOPS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function newTemplate(name: string, description: string, cover_url: string): WorkshopTemplate {
  return { id: `wt-${uid()}`, name, description, cover_url, units: [], cohorts: [] };
}

export function newUnit(templateId: string, existing: WorkshopUnit[], title: string, video_url: string, pdf_url: string): WorkshopUnit {
  const max = existing.reduce((m, u) => {
    const match = u.id.match(/-U(\d+)$/);
    return Math.max(m, match ? parseInt(match[1], 10) : 0);
  }, 0);
  return { id: `WS-${templateId}-U${max + 1}`, title, video_url, pdf_url };
}

export function newCohort(name: string): WorkshopCohort {
  return {
    id: `co-${uid()}`,
    name,
    participants: [],
    teacher_id: "",
    video_call_link: "",
    cohort_open: {},
    per_participant_open: {},
    sessions: [],
  };
}

/** Returns true if a unit is currently open for a given participant of a cohort. */
export function isUnitOpenFor(cohort: WorkshopCohort, participantId: string, unitId: string): boolean {
  const override = cohort.per_participant_open?.[participantId]?.[unitId];
  if (typeof override === "boolean") return override;
  return !!cohort.cohort_open?.[unitId];
}

/* --------- Read helpers used by other admin sections (Students form) --------- */

/** Returns all cohorts (with parent template) that include the given student id. */
export function cohortsForStudent(studentId: string): { template: WorkshopTemplate; cohort: WorkshopCohort }[] {
  const out: { template: WorkshopTemplate; cohort: WorkshopCohort }[] = [];
  for (const t of loadWorkshops()) {
    for (const c of t.cohorts) {
      if (c.participants.some((p) => p.kind === "student" && p.id === studentId)) {
        out.push({ template: t, cohort: c });
      }
    }
  }
  return out;
}

/** Mutates the persisted store: adds a student participant to an existing cohort. No-op if already present. */
export function addStudentToCohort(cohortId: string, studentId: string, studentName: string) {
  const list = loadWorkshops();
  let changed = false;
  for (const t of list) {
    for (const c of t.cohorts) {
      if (c.id !== cohortId) continue;
      if (c.participants.some((p) => p.id === studentId)) return;
      if (c.participants.length >= 4) return;
      c.participants.push({ id: studentId, name: studentName, kind: "student" });
      changed = true;
    }
  }
  if (changed) persistWorkshops(list);
}

/** Mutates the persisted store: removes a participant from a cohort. */
export function removeParticipantFromCohort(cohortId: string, participantId: string) {
  const list = loadWorkshops();
  let changed = false;
  for (const t of list) {
    for (const c of t.cohorts) {
      if (c.id !== cohortId) continue;
      const before = c.participants.length;
      c.participants = c.participants.filter((p) => p.id !== participantId);
      if (c.per_participant_open?.[participantId]) delete c.per_participant_open[participantId];
      if (c.participants.length !== before) changed = true;
    }
  }
  if (changed) persistWorkshops(list);
}