import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "./auth-rehydrate";
import { hydrateUserIdBridge, uuidToLegacySync } from "./user-id-bridge";
import { academyISO } from "./academy-time";
import { withTimeout } from "./net-utils";

export interface ExternalBlock {
  id: number;
  teacher_id: string;
  label: string;
  weekday: number;
  start_min: number;
  end_min: number;
  start_date: string;
  end_date: string;
}
export interface ExternalOverride {
  block_id: number;
  on_date: string;
  cancelled: boolean;
  replacement_date: string | null;
  start_min: number | null;
  end_min: number | null;
  updated_at?: string;
}
export interface ExternalOccurrence {
  blockId: number;
  originalDate: string;
  teacherId: string;
  label: string;
  date_time: string;
  duration_minutes: number;
  modified: boolean;
}
interface ExternalSchedule {
  blocks: ExternalBlock[];
  overrides: ExternalOverride[];
}
let schedule: ExternalSchedule = { blocks: [], overrides: [] };
let occurrences: ExternalOccurrence[] = [];
let hydrated = false;
let inflight: Promise<void> | null = null;
let generation = 0;
let queued = false;
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((callback) => callback());
}
const minutesTime = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

/** Pure projection shared by calendars and availability; each exception replaces exactly one date. */
export function expandExternalSchedule(data: ExternalSchedule): ExternalOccurrence[] {
  const result: ExternalOccurrence[] = [];
  const overrides = new Map(data.overrides.map((o) => [`${o.block_id}:${o.on_date}`, o]));
  for (const block of data.blocks) {
    const add = (
      originalDate: string,
      date: string,
      start: number,
      end: number,
      modified: boolean,
    ) =>
      result.push({
        blockId: block.id,
        originalDate,
        teacherId: uuidToLegacySync(block.teacher_id),
        label: block.label,
        date_time: academyISO(`${date}T${minutesTime(start)}`),
        duration_minutes: end - start,
        modified,
      });
    const first = new Date(`${block.start_date}T12:00:00Z`);
    for (
      let day = first, n = 0;
      day.toISOString().slice(0, 10) <= block.end_date && n <= 730;
      day = new Date(+day + 86_400_000), n++
    ) {
      const date = day.toISOString().slice(0, 10);
      if (day.getUTCDay() === block.weekday && !overrides.has(`${block.id}:${date}`))
        add(date, date, block.start_min, block.end_min, false);
    }
    for (const o of data.overrides) {
      if (
        o.block_id === block.id &&
        !o.cancelled &&
        o.replacement_date &&
        o.start_min != null &&
        o.end_min != null
      ) {
        add(o.on_date, o.replacement_date, o.start_min, o.end_min, true);
      }
    }
  }
  return result.sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));
}

export async function refreshExternalSchedule(): Promise<void> {
  if (inflight) {
    queued = true;
    return inflight;
  }
  const version = generation;
  inflight = (async () => {
    await hydrateUserIdBridge();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      name: string,
    ) => Promise<{ data: ExternalSchedule | null; error: { message: string } | null }>;
    const { data, error } = await withTimeout(
      rpc("external_teacher_schedule"),
      15_000,
      "Refreshing in-person reservations",
    );
    if (error) throw new Error(error.message);
    if (version !== generation) return;
    schedule = data ?? { blocks: [], overrides: [] };
    occurrences = expandExternalSchedule(schedule);
    hydrated = true;
    notify();
  })().finally(() => {
    inflight = null;
    if (queued) {
      queued = false;
      void refreshExternalSchedule().catch(() => {});
    }
  });
  return inflight;
}
export function loadExternalOccurrences(teacherId?: string): ExternalOccurrence[] {
  if (!hydrated && !inflight) void refreshExternalSchedule().catch(() => {});
  return teacherId ? occurrences.filter((o) => o.teacherId === teacherId) : occurrences;
}
export function loadExternalOverrides(blockId: number): ExternalOverride[] {
  return schedule.overrides.filter((o) => o.block_id === blockId);
}
export function subscribeExternalSchedule(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
export function isExternallyBlockedAt(teacherId: string, date: string, duration: number): boolean {
  const start = +new Date(date),
    end = start + duration * 60_000;
  return loadExternalOccurrences(teacherId).some(
    (o) =>
      +new Date(o.date_time) < end && +new Date(o.date_time) + o.duration_minutes * 60_000 > start,
  );
}
export async function saveExternalOverride(record: ExternalOverride): Promise<void> {
  const { updated_at: _ignored, ...payload } = record;
  const { error } = await supabase
    .from("teacher_external_overrides")
    .upsert(payload, { onConflict: "block_id,on_date" });
  if (error) throw new Error(error.message);
  await refreshExternalSchedule();
}
export async function restoreExternalOverride(blockId: number, date: string): Promise<void> {
  const { error } = await supabase
    .from("teacher_external_overrides")
    .delete()
    .eq("block_id", blockId)
    .eq("on_date", date);
  if (error) throw new Error(error.message);
  await refreshExternalSchedule();
}
if (typeof window !== "undefined") {
  registerRehydrate(
    (reason) => {
      generation++;
      hydrated = false;
      if (reason === "auth") {
        schedule = { blocks: [], overrides: [] };
        occurrences = [];
        notify();
      }
      void refreshExternalSchedule().catch(() => {});
    },
    { critical: true },
  );
  supabase
    .channel("external-schedule-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "teacher_external_blocks" },
      () => {
        void refreshExternalSchedule().catch(() => {});
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "teacher_external_overrides" },
      () => {
        void refreshExternalSchedule().catch(() => {});
      },
    )
    .subscribe();
}
