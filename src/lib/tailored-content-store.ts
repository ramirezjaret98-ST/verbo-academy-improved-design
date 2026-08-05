// Tailored Content store — per-student, teacher-authored units for
// students on access_plan "Elite".
// Storage is now unified in custom-units-store.ts under kind: "tailored".
// The public API below is unchanged; it only delegates.

import {
  type CustomUnit,
  type CustomUnitCompletion,
  addCustomUnit,
  clearCompletionForSession,
  customUnitsForStudent,
  loadCustomUnits,
  markCompletion,
  readCompletionMap,
  removeCustomUnit,
  subscribeCompletion,
  subscribeCustomUnits,
  updateCustomUnit,
} from "./custom-units-store";

export type TailoredUnit = CustomUnit;

const KEY = "verbo:tailored-content";
export const TAILORED_UNITS_EVENT = "verbo:tailored-content-updated";

export function loadTailoredUnits(): TailoredUnit[] {
  return loadCustomUnits("tailored");
}

export function tailoredUnitsForStudent(studentId: string): TailoredUnit[] {
  return customUnitsForStudent("tailored", studentId);
}

export function addTailoredUnit(studentId: string, title: string, fileUrl: string, fileName?: string): TailoredUnit {
  return addCustomUnit("tailored", studentId, title, fileUrl, fileName);
}

export function updateTailoredUnit(id: string, patch: Partial<Omit<TailoredUnit, "id" | "student_id" | "created_at">>) {
  updateCustomUnit("tailored", id, patch);
}

export function removeTailoredUnit(id: string) {
  removeCustomUnit("tailored", id);
}

export function subscribeTailoredUnits(cb: () => void): () => void {
  return subscribeCustomUnits(cb, TAILORED_UNITS_EVENT, KEY);
}

/* -------------------- Per-unit completion (Tailored Content) --------- */
export type TailoredUnitCompletion = CustomUnitCompletion;

const COMPLETION_KEY = "verbo:tailored-content-completion";
const COMPLETION_EVENT = "verbo:tailored-content-completion-updated";

export function tailoredUnitDoneMap(): Record<string, TailoredUnitCompletion> {
  return readCompletionMap(COMPLETION_KEY);
}

export function isTailoredUnitDone(unitId: string): boolean {
  return !!readCompletionMap(COMPLETION_KEY)[unitId];
}

export function markTailoredUnitDone(unitId: string, sessionId: string) {
  markCompletion(COMPLETION_KEY, COMPLETION_EVENT, unitId, sessionId);
}

export function clearTailoredUnitDoneForSession(sessionId: string) {
  clearCompletionForSession(COMPLETION_KEY, COMPLETION_EVENT, sessionId);
}

export function subscribeTailoredUnitCompletion(cb: () => void): () => void {
  return subscribeCompletion(COMPLETION_KEY, COMPLETION_EVENT, cb);
}
