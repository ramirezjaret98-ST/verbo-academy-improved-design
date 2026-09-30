import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";

export type ContentCategoryScope = "challenge" | "material";

let categories: Record<ContentCategoryScope, string[]> = { challenge: [], material: [] };
let hydrated = false;
let pending: Promise<boolean> | null = null;
let generation = 0;
const listeners: Record<ContentCategoryScope, Set<() => void>> = {
  challenge: new Set(),
  material: new Set(),
};

function notify() {
  for (const scope of ["challenge", "material"] as const) {
    listeners[scope].forEach((listener) => listener());
  }
}

async function hydrate(): Promise<boolean> {
  if (hydrated) return true;
  if (pending) return pending;
  const requestGeneration = generation;
  const task = (async () => {
    const { data, error } = await supabase
      .from("content_categories")
      .select("scope,name")
      .order("name");
    if (error) {
      console.error("[content-categories] failed to load", error);
      return false;
    }
    if (requestGeneration !== generation) return false;
    categories = {
      challenge: (data ?? []).filter((row) => row.scope === "challenge").map((row) => row.name),
      material: (data ?? []).filter((row) => row.scope === "material").map((row) => row.name),
    };
    hydrated = true;
    notify();
    return true;
  })();
  pending = task;
  try {
    return await task;
  } finally {
    if (pending === task) pending = null;
  }
}

function refresh() {
  generation++;
  hydrated = false;
  pending = null;
  void hydrate();
}

function onAuthChange(reason?: "auth" | "refresh") {
  if (reason === "auth") {
    categories = { challenge: [], material: [] };
    notify();
  }
  refresh();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("content-categories-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "content_categories" }, refresh)
    .subscribe();
  registerRehydrate(onAuthChange);
}

export function loadContentCategories(scope: ContentCategoryScope): string[] {
  if (!hydrated) void hydrate();
  return categories[scope];
}

export function subscribeContentCategories(scope: ContentCategoryScope, listener: () => void): () => void {
  listeners[scope].add(listener);
  return () => listeners[scope].delete(listener);
}

export async function addContentCategory(scope: ContentCategoryScope, name: string): Promise<string[]> {
  const trimmed = name.trim();
  if (!trimmed) return loadContentCategories(scope);
  if (!(await hydrate())) throw new Error("Could not load categories from the database.");
  if (categories[scope].some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
    return categories[scope];
  }
  const { error } = await supabase.from("content_categories").insert({ scope, name: trimmed });
  if (error && error.code !== "23505") throw error;
  refresh();
  if (!(await hydrate()) && !(await hydrate())) {
    throw new Error("Category saved but could not refresh the list.");
  }
  return categories[scope];
}
