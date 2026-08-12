// Landing "course card" metadata for VIP / Tailored Content — one row per
// (student, kind): a title + optional cover image that Admin sets, shown as
// the single entry-point card before the student sees the unit list.
//
// Backed by Supabase (`public.custom_course_meta`). RLS: select is open to
// self/admin/assigned-teacher (same shape as custom_units_select); writes are
// admin-only (same 2026-08-12 permission revert as custom_units/activities).
// Same store pattern as every other piece migrated so far: one global cache
// hydrated once + kept in sync via Postgres Realtime, optimistic writes with
// rollback on failure.
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";
import type { CustomUnitKind } from "./custom-units-store";

export interface CustomCourseMeta {
  student_id: string;
  kind: CustomUnitKind;
  title: string;
  cover_image?: string;
}

export const DEFAULT_COURSE_TITLE: Record<CustomUnitKind, string> = {
  vip: "My VIP Course",
  tailored: "Tailored Content",
};

export const CUSTOM_COURSE_META_EVENT = "verbo:custom-course-meta-updated";

type MetaRow = Database["public"]["Tables"]["custom_course_meta"]["Row"];

function fromRow(row: MetaRow): CustomCourseMeta {
  return {
    student_id: uuidToLegacySync(row.student_id),
    kind: row.kind,
    title: row.title,
    cover_image: row.cover_image ?? undefined,
  };
}

let cache: CustomCourseMeta[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CUSTOM_COURSE_META_EVENT));
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("custom_course_meta").select("*");
    if (error) {
      console.error("[custom-course-meta-store] failed to load", error);
    }
    cache = (data ?? []).map(fromRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

function invalidateAndRehydrate() {
  hydrated = false;
  hydratePromise = null;
  void hydrate();
}

let realtimeStarted = false;
function ensureRealtime() {
  if (realtimeStarted || typeof window === "undefined") return;
  realtimeStarted = true;
  supabase
    .channel("custom-course-meta-store-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "custom_course_meta" }, () => {
      hydrated = false;
      hydratePromise = null;
      void hydrate();
    })
    .subscribe();
  registerRehydrate(invalidateAndRehydrate);}

if (typeof window !== "undefined") {
  void hydrate();
  ensureRealtime();
}

/** Returns the stored card for (kind, studentId), or a sensible default
 *  (generic title, no cover) when Admin hasn't customized it yet — callers
 *  never need to null-check. */
export function courseMetaFor(kind: CustomUnitKind, studentId: string): CustomCourseMeta {
  return (
    cache.find((m) => m.kind === kind && m.student_id === studentId) ?? {
      student_id: studentId,
      kind,
      title: DEFAULT_COURSE_TITLE[kind],
      cover_image: undefined,
    }
  );
}

export function subscribeCourseMeta(cb: () => void): () => void {
  listeners.add(cb);
  void hydrate();
  ensureRealtime();
  return () => {
    listeners.delete(cb);
  };
}

/** Creates or updates the (kind, studentId) card. Admin-only per RLS. */
export async function saveCourseMeta(
  kind: CustomUnitKind,
  studentId: string,
  patch: { title?: string; cover_image?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const studentUuid = await legacyToUuid(studentId);
  if (!studentUuid) {
    return { ok: false, error: "Could not find that student — please try again." };
  }
  const existing = cache.find((m) => m.kind === kind && m.student_id === studentId);
  const prev = cache;
  const nextTitle = patch.title !== undefined ? patch.title : existing?.title ?? DEFAULT_COURSE_TITLE[kind];
  const nextCover = patch.cover_image !== undefined ? patch.cover_image ?? undefined : existing?.cover_image;

  cache = existing
    ? cache.map((m) =>
        m.kind === kind && m.student_id === studentId ? { ...m, title: nextTitle, cover_image: nextCover } : m,
      )
    : [...cache, { student_id: studentId, kind, title: nextTitle, cover_image: nextCover }];
  notify();

  const { error } = await supabase
    .from("custom_course_meta")
    .upsert(
      { student_id: studentUuid, kind, title: nextTitle, cover_image: nextCover ?? null },
      { onConflict: "student_id,kind" },
    );
  if (error) {
    console.error("[custom-course-meta-store] failed to save", error);
    cache = prev;
    notify();
    return { ok: false, error: error.message || "Could not save — please try again." };
  }
  return { ok: true };
}
