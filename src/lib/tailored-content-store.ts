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

export function tailoredUnitDoneMap(): Record<string, TailoredUnitCompletion> {
  return readCompletionMap("tailored");
}

export function isTailoredUnitDone(unitId: string): boolean {
  return !!readCompletionMap("tailored")[unitId];
}

export function markTailoredUnitDone(unitId: string, sessionId: string) {
  markCompletion("tailored", unitId, sessionId);
}

export function clearTailoredUnitDoneForSession(sessionId: string) {
  clearCompletionForSession("tailored", sessionId);
}

export function subscribeTailoredUnitCompletion(cb: () => void): () => void {
  return subscribeCompletion("tailored", cb);
}
