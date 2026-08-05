// VIP Course Builder store — per-student, teacher-authored units.
// Storage is now unified in custom-units-store.ts under kind: "vip".
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

export type VipUnit = CustomUnit;

const KEY = "verbo:vip-courses";
export const VIP_UNITS_EVENT = "verbo:vip-courses-updated";

export function loadVipUnits(): VipUnit[] {
  return loadCustomUnits("vip");
}

export function unitsForStudent(studentId: string): VipUnit[] {
  return customUnitsForStudent("vip", studentId);
}

export function addVipUnit(studentId: string, title: string, fileUrl: string, fileName?: string): VipUnit {
  return addCustomUnit("vip", studentId, title, fileUrl, fileName);
}

export function updateVipUnit(id: string, patch: Partial<Omit<VipUnit, "id" | "student_id" | "created_at">>) {
  updateCustomUnit("vip", id, patch);
}

export function removeVipUnit(id: string) {
  removeCustomUnit("vip", id);
}

export function subscribeVipUnits(cb: () => void): () => void {
  return subscribeCustomUnits(cb, VIP_UNITS_EVENT, KEY);
}

// Count of Completed sessions for this student — read from the real sessions
// engine so the unlock indicator matches what the rest of the app shows.
export function completedSessionCount(studentId: string, sessions: { student_id: string; status: string }[]): number {
  return sessions.filter((s) => s.student_id === studentId && s.status === "completed").length;
}

/* -------------------- Per-unit completion (VIP) ---------------------- */
export type VipUnitCompletion = CustomUnitCompletion;

const COMPLETION_KEY = "verbo:vip-unit-completion";
const COMPLETION_EVENT = "verbo:vip-unit-completion-updated";

export function vipUnitDoneMap(): Record<string, VipUnitCompletion> {
  return readCompletionMap(COMPLETION_KEY);
}

export function isVipUnitDone(unitId: string): boolean {
  return !!readCompletionMap(COMPLETION_KEY)[unitId];
}

export function markVipUnitDone(unitId: string, sessionId: string) {
  markCompletion(COMPLETION_KEY, COMPLETION_EVENT, unitId, sessionId);
}

export function clearVipUnitDoneForSession(sessionId: string) {
  clearCompletionForSession(COMPLETION_KEY, COMPLETION_EVENT, sessionId);
}

export function subscribeVipUnitCompletion(cb: () => void): () => void {
  return subscribeCompletion(COMPLETION_KEY, COMPLETION_EVENT, cb);
}
