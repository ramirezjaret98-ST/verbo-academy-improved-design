// Lightweight per-student achievement timeline for the student Learning Path.
//
// Backed by Supabase (`public.learning_path_events`). RLS allows a student to
// see/insert their own events, a teacher to see/insert events for students
// they teach (`private.teaches_student`), and admins everything — a plain
// `select("*")` already returns exactly that scoped set for the calling
// session, so we keep a single global cache hydrated once and refreshed via
// Postgres Realtime, then filter by studentId client-side (like the other
// stores in this migration).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export type LearningPathEventKind =
  | "unit_unlocked"
  | "unit_completed"
  | "level_completed";

export interface LearningPathEvent {
  ts: string; // ISO
  kind: LearningPathEventKind;
  ref: string; // level name or unit id
  label?: string; // pre-computed display label
  studentId: string; // legacy id — internal, used for client-side filtering
}

export const EVENT = "verbo:learning-path-events-updated";

type Row = Database["public"]["Tables"]["learning_path_events"]["Row"];

let cache: LearningPathEvent[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

function mapRow(row: Row): LearningPathEvent {
  return {
    ts: row.ts,
    kind: row.kind as LearningPathEventKind,
    ref: row.ref,
    label: row.label ?? undefined,
    studentId: uuidToLegacySync(row.student_id),
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("learning_path_events").select("*");
    if (error) {
      console.error("[learning-path-events] failed to load", error);
      hydrated = true;
      return;
    }
    cache = (data ?? []).map(mapRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("learning-path-events-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "learning_path_events" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
}

export function loadEvents(studentId: string): LearningPathEvent[] {
  if (!hydrated) void hydrate();
  return cache.filter((e) => e.studentId === studentId);
}

export function pushEvent(studentId: string, ev: Omit<LearningPathEvent, "ts" | "studentId"> & { ts?: string }) {
  const now = ev.ts ?? new Date().toISOString();
  // Deduplicate identical (kind, ref) entries within the last minute.
  const dupe = cache.find(
    (e) => e.studentId === studentId && e.kind === ev.kind && e.ref === ev.ref
      && Math.abs(+new Date(e.ts) - +new Date(now)) < 60_000,
  );
  if (dupe) return;

  const optimistic: LearningPathEvent = { ...ev, ts: now, studentId };
  cache = [optimistic, ...cache];
  notify();

  void (async () => {
    const uuid = await legacyToUuid(studentId);
    if (!uuid) return;
    const { error } = await supabase
      .from("learning_path_events")
      .insert({ student_id: uuid, ts: now, kind: ev.kind, ref: ev.ref, label: ev.label ?? null });
    if (error) console.error("[learning-path-events] failed to save event", error);
  })();
}

export function subscribeEvents(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
