// Material Complementario store — single source of truth shared by
// Admin (management) and the Student/Teacher panels (read views).
//
// Backed by Supabase (`public.materials` for metadata + the `materials`
// Storage bucket for the actual files). RLS: SELECT open to any
// authenticated user, INSERT/UPDATE/DELETE admin-only (private.is_admin())
// — the Storage bucket's write policies mirror the same rule. The bucket is
// public for READ: this matches the pre-existing security model exactly —
// premium/restrict_product/restrict_level were always UI-only soft gates,
// enforced by visibleForStudent() on the client and never by RLS (any
// authenticated user could already read every material's URL regardless of
// those flags) — so a public bucket does not lower the bar that already
// existed.
//
// `materials.id` is a bigint identity in the DB (no text `code` column), so
// a brand-new item gets a temporary client-side id (`m${Date.now()}`) until
// the INSERT round-trips and the cache is reconciled with the real id — same
// optimistic temp-id-then-reconcile pattern used for Verbo Flash Seasons
// (see flash-challenges-store.ts's upsertSeason/deleteSeason).
//
// Categories stay on localStorage (unchanged from before this migration) —
// there's no dedicated Supabase table for them (they're just a free-text
// column on each material row), same low-stakes convention already used for
// Challenge categories in challenges-store.ts.
import { useSyncExternalStore } from "react";
import { MATERIALS, type MaterialType } from "./mock-data";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type RestrictProduct = "go" | "enterprise" | "international";

export interface StoredMaterial {
  id: string;
  title: string;
  material_type: MaterialType;
  category: string;
  upload_url: string;
  cover_image?: string; // real Storage URL (uploaded) — empty means use type fallback
  restrict_product?: RestrictProduct; // undefined = visible to everyone
  restrict_level?: string; // commercial level name (depends on product)
  premium?: boolean; // when true, only Advance/Elite access plans see it unlocked
}

// Restrict-to catalog — GO / Enterprise / International (VIP excluded here).
export const RESTRICT_PRODUCTS: { id: RestrictProduct; label: string; levels: string[] }[] = [
  { id: "go", label: "GO", levels: ["Kickstart", "Everyday Flow", "Confident Voice", "Culture Master"] },
  { id: "enterprise", label: "Enterprise", levels: ["Core Foundations", "Strategic Fluency", "Executive Presence", "Global Leadership"] },
  { id: "international", label: "International", levels: ["Survival Basics", "Travel Ready", "Global Connector", "World Fluency"] },
];

export function levelsForProduct(product?: RestrictProduct | ""): string[] {
  return RESTRICT_PRODUCTS.find((p) => p.id === product)?.levels ?? [];
}

const CATEGORIES_KEY = "verbo:material-categories";
export const MATERIALS_EVENT = "verbo:materials-updated";
const MATERIALS_BUCKET = "materials";

const SEED_CATEGORIES = [
  "Grammar",
  "Vocabulary",
  "Business",
  "Speaking",
  "Listening",
  "Troubleshooting",
  "Getting Started",
  "Study Tips",
];

/** Max size (bytes) accepted for an uploaded resource file / cover. Also
 *  enforced server-side via the `materials` bucket's file_size_limit. */
export const MAX_MATERIAL_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_MATERIAL_FILE_ERROR = "File is too large — please upload a file under 8MB";

/** True when the file exceeds the allowed upload size. */
export function isFileTooLarge(file: { size: number }): boolean {
  return file.size > MAX_MATERIAL_FILE_BYTES;
}

/** Accept attribute for the real resource file, based on the material type. */
export function acceptForType(type: MaterialType): string {
  if (type === "video") return "video/*";
  if (type === "image") return "image/*";
  return "application/pdf";
}

/** A material has a real downloadable file only when upload_url is a real value. */
export function hasUploadedFile(m: Pick<StoredMaterial, "upload_url">): boolean {
  const u = (m.upload_url ?? "").trim();
  return u !== "" && u !== "#";
}

/** Uploads a real file to the `materials` Storage bucket and returns its
 *  public URL. `kind` just namespaces the storage path (resource vs cover) —
 *  it has no effect on access rules. */
export async function uploadMaterialFile(
  file: File,
  kind: "resource" | "cover",
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (isFileTooLarge(file)) return { ok: false, error: MAX_MATERIAL_FILE_ERROR };
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : "";
  const path = `${kind}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(MATERIALS_BUCKET).upload(path, file);
  if (error) {
    console.error("[materials-store] failed to upload file", error);
    return { ok: false, error: "Upload failed — please try again." };
  }
  const { data } = supabase.storage.from(MATERIALS_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/* ---------------- Categories (localStorage — see file header) ---------------- */

function safeWriteCategories(v: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(v));
    catCache = null;
    window.dispatchEvent(new CustomEvent(MATERIALS_EVENT));
  } catch {
    /* noop */
  }
}

let catCache: string[] | null = null;

export function loadCategories(): string[] {
  if (typeof window === "undefined") return SEED_CATEGORIES;
  const raw = localStorage.getItem(CATEGORIES_KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as string[];
      // Union (seeds first, no duplicates) so newly seeded categories show up
      // for browsers that already persisted an older category list.
      const merged: string[] = [];
      for (const c of [...SEED_CATEGORIES, ...saved]) {
        if (typeof c === "string" && c.trim() && !merged.some((m) => m.toLowerCase() === c.toLowerCase())) {
          merged.push(c);
        }
      }
      return merged;
    } catch {
      /* noop */
    }
  }
  safeWriteCategories(SEED_CATEGORIES);
  return SEED_CATEGORIES;
}

export function persistCategories(cats: string[]) {
  safeWriteCategories(cats);
}

export function addCategory(name: string): string[] {
  const trimmed = name.trim();
  const cats = loadCategories();
  if (!trimmed || cats.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return cats;
  const next = [...cats, trimmed];
  persistCategories(next);
  return next;
}

function getCategoriesSnapshot(): string[] {
  if (catCache === null) catCache = loadCategories();
  return catCache;
}

function subscribeCategories(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = () => {
    catCache = null;
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === CATEGORIES_KEY) onEvent();
  };
  window.addEventListener(MATERIALS_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MATERIALS_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCategories(): string[] {
  return useSyncExternalStore(subscribeCategories, getCategoriesSnapshot, () => SEED_CATEGORIES);
}

/* ---------------- Materials (Supabase) ---------------- */

type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];

let cache: StoredMaterial[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(MATERIALS_EVENT));
}

function mapRow(row: MaterialRow): StoredMaterial {
  return {
    id: String(row.id),
    title: row.title,
    material_type: row.material_type,
    category: row.category,
    upload_url: row.upload_url,
    cover_image: row.cover_image ?? undefined,
    restrict_product: (row.restrict_product as RestrictProduct | null) ?? undefined,
    restrict_level: row.restrict_level ?? undefined,
    premium: row.premium || undefined,
  };
}

function seedMaterials(): StoredMaterial[] {
  return MATERIALS.map((m) => ({
    id: m.id,
    title: m.title,
    material_type: m.material_type,
    category: m.category,
    upload_url: m.upload_url,
  }));
}

const SERVER_MATERIALS = seedMaterials();

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const { data, error } = await supabase.from("materials").select("*");
    if (error) {
      console.error("[materials-store] failed to load materials", error);
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
    .channel("materials-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "materials" },
      () => {
        hydrated = false;
        void hydrate();
      },
    )
    .subscribe();
}

export function loadMaterials(): StoredMaterial[] {
  if (!hydrated) void hydrate();
  return cache;
}

function subscribeMaterials(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useMaterials(): StoredMaterial[] {
  return useSyncExternalStore(subscribeMaterials, () => cache, () => SERVER_MATERIALS);
}

/** Create or update a material (optimistic; rolls back on failure). A brand
 *  new item (id not yet in the cache) gets INSERTed and its temp id is
 *  reconciled with the real bigint id once the write round-trips; an
 *  existing item is UPDATEd in place. */
export function upsertMaterial(mat: StoredMaterial) {
  const prevCache = cache;
  const idx = prevCache.findIndex((m) => m.id === mat.id);
  const isExisting = idx >= 0;
  cache = isExisting
    ? [...prevCache.slice(0, idx), mat, ...prevCache.slice(idx + 1)]
    : [mat, ...prevCache];
  notify();

  const payload = {
    title: mat.title,
    material_type: mat.material_type,
    category: mat.category,
    upload_url: mat.upload_url || "#",
    cover_image: mat.cover_image ?? null,
    restrict_product: mat.restrict_product ?? null,
    restrict_level: mat.restrict_level ?? null,
    premium: mat.premium ?? false,
  };

  void (async () => {
    if (isExisting) {
      const dbId = Number(mat.id);
      const { error } = await supabase.from("materials").update(payload).eq("id", dbId);
      if (error) {
        console.error("[materials-store] failed to update material", error);
        cache = prevCache;
        notify();
      }
      return;
    }
    const { data, error } = await supabase.from("materials").insert(payload).select("*").single();
    if (error || !data) {
      console.error("[materials-store] failed to insert material", error);
      cache = prevCache;
      notify();
      return;
    }
    const saved = mapRow(data);
    cache = cache.map((m) => (m.id === mat.id ? saved : m));
    notify();
  })();
}

export function deleteMaterial(id: string) {
  const prevCache = cache;
  cache = prevCache.filter((m) => m.id !== id);
  notify();
  const dbId = Number(id);
  if (!Number.isFinite(dbId)) return; // optimistic temp id that never round-tripped — nothing to delete server-side
  void (async () => {
    const { error } = await supabase.from("materials").delete().eq("id", dbId);
    if (error) {
      console.error("[materials-store] failed to delete material", error);
      cache = prevCache;
      notify();
    }
  })();
}

/** Materials a given student may see, honoring optional Restrict-to rules. */
export function visibleForStudent(
  items: StoredMaterial[],
  product?: string | null,
  level?: string | null,
): StoredMaterial[] {
  return items.filter((m) => {
    if (m.restrict_product && m.restrict_product !== product) return false;
    if (m.restrict_level && m.restrict_level !== level) return false;
    return true;
  });
}
