// Unified store for teacher-authored, per-student custom units.
// Both VIP Course Builder units and Tailored Content units are stored here
// as a single CustomUnit type, distinguished by `kind`.
// vip-courses-store.ts and tailored-content-store.ts are thin wrappers.
//
// Backed by Supabase (`public.custom_units` + `public.custom_unit_completions`,
// the latter tracking which single unit a given session marked "done" — at
// most one completion row per unit, same shape as the old per-key
// localStorage completion maps). RLS on both tables already scopes a plain
// `select("*")` to exactly what the caller should see (self, admin, or a
// teacher who teaches that student), so both are served from a single
// global cache hydrated once + kept in sync via Postgres Realtime — same
// pattern as every store migrated in Lote A3 onward. Writes stay optimistic
// and synchronous in their public signature (update the cache + notify
// immediately, fire the real Supabase call in the background with rollback
// on failure), so no consumer file needed to change.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { sanitizeText } from "./activities-store";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export type CustomUnitKind = "vip" | "tailored";

export interface CustomUnit {
  id: string;
  student_id: string;
  title: string;
  file_url: string;
  file_name?: string;
  created_at: string;
  kind: CustomUnitKind;
  /** Explicit ordering within a (kind, student). Falls back to created_at. */
  order?: number;
}

export const CUSTOM_UNITS_EVENT = "verbo:custom-units-updated";

type UnitRow = Database["public"]["Tables"]["custom_units"]["Row"];
type CompletionRow = Database["public"]["Tables"]["custom_unit_completions"]["Row"];

function fromUnitRow(row: UnitRow): CustomUnit {
  return {
    id: String(row.id),
    student_id: uuidToLegacySync(row.student_id),
    title: row.title,
    file_url: row.file_url,
    file_name: row.file_name ?? undefined,
    created_at: row.created_at,
    kind: row.kind,
    order: row.position ?? undefined,
  };
}

let unitsCache: CustomUnit[] = [];
let completionsCache: CompletionRow[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CUSTOM_UNITS_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const [unitsRes, completionsRes] = await Promise.all([
      supabase.from("custom_units").select("*"),
      supabase.from("custom_unit_completions").select("*"),
    ]);
    if (unitsRes.error) {
      console.error("[custom-units-store] failed to load units", unitsRes.error);
    }
    if (completionsRes.error) {
      console.error("[custom-units-store] failed to load completions", completionsRes.error);
    }
    unitsCache = (unitsRes.data ?? []).map(fromUnitRow);
    completionsCache = completionsRes.data ?? [];
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("custom-units-store-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "custom_units" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "custom_unit_completions" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
}

if (typeof window !== "undefined") {
  // Kick off hydration eagerly so plain (non-hook) readers like
  // `loadCustomUnits()` have data available as soon as possible, without
  // requiring a component to mount a subscriber first.
  void hydrate();
  ensureRealtime();
}

export function loadCustomUnits(kind: CustomUnitKind): CustomUnit[] {
  return unitsCache.filter((u) => u.kind === kind);
}

export function customUnitsForStudent(kind: CustomUnitKind, studentId: string): CustomUnit[] {
  return unitsCache
    .filter((u) => u.kind === kind && u.student_id === studentId)
    .sort((a, b) => {
      if (typeof a.order === "number" && typeof b.order === "number") return a.order - b.order;
      return a.created_at.localeCompare(b.created_at);
    });
}

export function addCustomUnit(
  kind: CustomUnitKind,
  studentId: string,
  title: string,
  fileUrl: string,
  fileName?: string,
): CustomUnit {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const order = unitsCache.filter((u) => u.kind === kind && u.student_id === studentId).length;
  const unit: CustomUnit = {
    id: tempId,
    student_id: studentId,
    title,
    file_url: fileUrl,
    file_name: fileName,
    created_at: new Date().toISOString(),
    kind,
    order,
  };
  unitsCache = [...unitsCache, unit];
  notify();

  void (async () => {
    const studentUuid = await legacyToUuid(studentId);
    if (!studentUuid) {
      console.error("[custom-units-store] no app_users row for legacy id", studentId);
      unitsCache = unitsCache.filter((u) => u.id !== tempId);
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("custom_units")
      .insert({
        student_id: studentUuid,
        kind,
        title,
        file_url: fileUrl,
        file_name: fileName ?? null,
        position: order,
      })
      .select()
      .single();
    if (error || !data) {
      console.error("[custom-units-store] failed to add unit", error);
      unitsCache = unitsCache.filter((u) => u.id !== tempId);
      notify();
      return;
    }
    const saved = fromUnitRow(data);
    unitsCache = unitsCache.map((u) => (u.id === tempId ? saved : u));
    notify();
  })();

  return unit;
}

/** Appends already-validated units in a single optimistic update + a single
 *  background bulk insert. Mirrors the style of the old localStorage
 *  "single write" bulk import. */
export function addCustomUnitsBulk(units: CustomUnit[]): void {
  if (units.length === 0) return;
  const tempUnits = units.map((u) => ({
    ...u,
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  }));
  unitsCache = [...unitsCache, ...tempUnits];
  notify();

  void (async () => {
    const studentUuid = await legacyToUuid(units[0].student_id);
    if (!studentUuid) {
      console.error("[custom-units-store] no app_users row for legacy id", units[0].student_id);
      const tempIds = new Set(tempUnits.map((u) => u.id));
      unitsCache = unitsCache.filter((u) => !tempIds.has(u.id));
      notify();
      return;
    }
    const { data, error } = await supabase
      .from("custom_units")
      .insert(
        units.map((u) => ({
          student_id: studentUuid,
          kind: u.kind,
          title: u.title,
          file_url: u.file_url,
          file_name: u.file_name ?? null,
          position: u.order ?? null,
        })),
      )
      .select();
    const tempIds = new Set(tempUnits.map((u) => u.id));
    if (error || !data) {
      console.error("[custom-units-store] failed to bulk-add units", error);
      unitsCache = unitsCache.filter((u) => !tempIds.has(u.id));
      notify();
      return;
    }
    const saved = data.map(fromUnitRow);
    unitsCache = [...unitsCache.filter((u) => !tempIds.has(u.id)), ...saved];
    notify();
  })();
}

/**
 * Validates a raw JSON array of custom units for bulk upload. Mirrors the
 * style of validateBulkActivities(): per-index errors, never throws.
 */
export function validateBulkUnits(
  raw: unknown[],
  kind: CustomUnitKind,
  studentId: string,
): { valid: CustomUnit[]; errs: string[] } {
  const valid: CustomUnit[] = [];
  const errs: string[] = [];
  const str = (v: unknown) => sanitizeText(v);
  const base = unitsCache.filter((u) => u.kind === kind && u.student_id === studentId).length;
  let seq = 0;

  raw.forEach((item, i) => {
    const tag = `#${i}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errs.push(`${tag}: el item no es un objeto.`);
      return;
    }
    const o = item as Record<string, unknown>;
    const title = str(o.title);
    if (!title) { errs.push(`${tag}: falta title.`); return; }
    const fileUrl = typeof o.file_url === "string" ? o.file_url.trim() : "";
    const fileName = o.file_name !== undefined ? str(o.file_name) : undefined;
    const order = typeof o.order === "number" && Number.isFinite(o.order) ? o.order : base + seq;
    seq += 1;
    valid.push({
      id: "", // assigned by Supabase on insert — addCustomUnitsBulk ignores this field.
      student_id: studentId,
      title,
      file_url: fileUrl,
      file_name: fileName,
      created_at: new Date().toISOString(),
      kind,
      order,
    });
  });

  return { valid, errs };
}

export function updateCustomUnit(
  kind: CustomUnitKind,
  id: string,
  patch: Partial<Omit<CustomUnit, "id" | "student_id" | "created_at" | "kind">>,
): void {
  const prev = unitsCache;
  unitsCache = unitsCache.map((u) => (u.id === id && u.kind === kind ? { ...u, ...patch } : u));
  notify();

  void (async () => {
    const dbPatch: Database["public"]["Tables"]["custom_units"]["Update"] = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.file_url !== undefined) dbPatch.file_url = patch.file_url;
    if (patch.file_name !== undefined) dbPatch.file_name = patch.file_name ?? null;
    if (patch.order !== undefined) dbPatch.position = patch.order;
    const numericId = Number(id);
    const { error } = await supabase.from("custom_units").update(dbPatch).eq("id", numericId);
    if (error) {
      console.error("[custom-units-store] failed to update unit", error);
      unitsCache = prev;
      notify();
    }
  })();
}

export function removeCustomUnit(kind: CustomUnitKind, id: string): void {
  const prev = unitsCache;
  unitsCache = unitsCache.filter((u) => !(u.id === id && u.kind === kind));
  notify();

  void (async () => {
    const numericId = Number(id);
    const { error } = await supabase.from("custom_units").delete().eq("id", numericId);
    if (error) {
      console.error("[custom-units-store] failed to delete unit", error);
      unitsCache = prev;
      notify();
    }
  })();
}

// Subscribe to unit changes. `legacyEvent`/`legacyKey` parameters are kept
// for call-site compatibility with the pre-Supabase signature — Realtime
// replaces the old cross-tab `storage` event, so both are now unused.
export function subscribeCustomUnits(cb: () => void, _legacyEvent?: string, _legacyKey?: string): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

/* -------------------- Per-unit completion (shared shape) --------------- */
export interface CustomUnitCompletion {
  session_id: string;
  completed_at: string; // ISO
}

function completionMapForKind(kind: CustomUnitKind): Record<string, CustomUnitCompletion> {
  const idsOfKind = new Set(unitsCache.filter((u) => u.kind === kind).map((u) => u.id));
  const map: Record<string, CustomUnitCompletion> = {};
  for (const c of completionsCache) {
    const unitId = String(c.custom_unit_id);
    if (!idsOfKind.has(unitId)) continue;
    map[unitId] = { session_id: String(c.session_id), completed_at: c.completed_at };
  }
  return map;
}

export function readCompletionMap(kind: CustomUnitKind): Record<string, CustomUnitCompletion> {
  return completionMapForKind(kind);
}

export function markCompletion(kind: CustomUnitKind, unitId: string, sessionId: string): void {
  const idsOfKind = new Set(unitsCache.filter((u) => u.kind === kind).map((u) => u.id));
  const uid = Number(unitId);
  const sid = Number(sessionId);
  const prev = completionsCache;

  // A session should complete at most one unit per kind — drop any other
  // completion of this kind pointing at the same session before setting
  // the new one (mirrors the old localStorage map's per-key behavior).
  const now = new Date().toISOString();
  const withoutConflicts = completionsCache.filter(
    (c) => !(idsOfKind.has(String(c.custom_unit_id)) && c.session_id === sid && c.custom_unit_id !== uid),
  );
  const existingIdx = withoutConflicts.findIndex((c) => c.custom_unit_id === uid);
  const newRow: CompletionRow = { custom_unit_id: uid, session_id: sid, completed_at: now };
  completionsCache =
    existingIdx >= 0
      ? withoutConflicts.map((c, i) => (i === existingIdx ? newRow : c))
      : [...withoutConflicts, newRow];
  notify();

  void (async () => {
    const otherIds = [...idsOfKind].map(Number).filter((id) => id !== uid);
    if (otherIds.length > 0) {
      const { error: delErr } = await supabase
        .from("custom_unit_completions")
        .delete()
        .eq("session_id", sid)
        .in("custom_unit_id", otherIds);
      if (delErr) console.error("[custom-units-store] failed to clear conflicting completion", delErr);
    }
    const { error } = await supabase
      .from("custom_unit_completions")
      .upsert({ custom_unit_id: uid, session_id: sid, completed_at: now });
    if (error) {
      console.error("[custom-units-store] failed to mark completion", error);
      completionsCache = prev;
      notify();
    }
  })();
}

export function clearCompletionForSession(kind: CustomUnitKind, sessionId: string): void {
  const idsOfKind = new Set(unitsCache.filter((u) => u.kind === kind).map((u) => u.id));
  const sid = Number(sessionId);
  const toClear = completionsCache.filter((c) => idsOfKind.has(String(c.custom_unit_id)) && c.session_id === sid);
  if (toClear.length === 0) return;
  const prev = completionsCache;
  completionsCache = completionsCache.filter(
    (c) => !(idsOfKind.has(String(c.custom_unit_id)) && c.session_id === sid),
  );
  notify();

  void (async () => {
    const ids = toClear.map((c) => c.custom_unit_id);
    const { error } = await supabase.from("custom_unit_completions").delete().in("custom_unit_id", ids);
    if (error) {
      console.error("[custom-units-store] failed to clear completion", error);
      completionsCache = prev;
      notify();
    }
  })();
}

export function subscribeCompletion(kind: CustomUnitKind, cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}
