// Only shared catalog definitions belong here. Never cache student records,
// submissions, signed URLs, tokens or earned/equipped badge state.
export const CATALOG_TTL_MS = 5 * 60_000;
export const CATALOG_MAX_BYTES = 256 * 1024;
const PREFIX = "verbo:catalog:v2:";
type Result<T> = { data: T[] | null; error: unknown };
type Entry<T> = { savedAt: number; rows: T[] };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createCatalogCache<T>(
  name: string,
  options: {
    subject: () => Promise<string | null>;
    storage?: () => StorageLike | undefined;
    now?: () => number;
  },
) {
  const entries = new Map<string, Entry<T>>();
  const pending = new Map<string, Promise<Result<T>>>();
  const keys = new Set<string>();
  const now = options.now ?? Date.now;
  let generation = 0;
  const storage = () => {
    try {
      return options.storage?.();
    } catch {
      return undefined;
    }
  };
  function read(key: string): Entry<T> | undefined {
    let entry = entries.get(key);
    if (!entry) {
      try {
        const raw = storage()?.getItem(key);
        if (raw && raw.length <= CATALOG_MAX_BYTES) {
          const candidate = JSON.parse(raw);
          if (Number.isFinite(candidate.savedAt) && Array.isArray(candidate.rows))
            entry = candidate;
        }
      } catch {
        /* Corrupt/disabled storage falls back to the authenticated API. */
      }
    }
    if (entry && now() >= entry.savedAt && now() - entry.savedAt < CATALOG_TTL_MS) {
      entries.set(key, entry);
      return entry;
    }
    return undefined;
  }
  function invalidate() {
    generation++;
    entries.clear();
    pending.clear();
    for (const key of keys) {
      try {
        storage()?.removeItem(key);
      } catch {
        /* storage is optional */
      }
    }
  }
  async function load(fetchRows: () => PromiseLike<Result<T>>): Promise<Result<T>> {
    const subject = await options.subject();
    if (!subject) return { data: [], error: null };
    const key = `${PREFIX}${name}:${subject}`;
    keys.add(key);
    const cached = read(key);
    if (cached) return { data: cached.rows, error: null };
    const existing = pending.get(key);
    if (existing) return existing;
    const started = generation;
    const request = (async (): Promise<Result<T>> => {
      try {
        const result = await fetchRows();
        if ((await options.subject()) !== subject)
          return { data: null, error: new Error("Catalog account changed") };
        if (result.error || !result.data) return result;
        if (started !== generation)
          return { data: null, error: new Error("Catalog changed during loading") };
        const entry = { savedAt: now(), rows: result.data };
        const serialized = JSON.stringify(entry);
        if (new TextEncoder().encode(serialized).length <= CATALOG_MAX_BYTES) {
          entries.set(key, entry);
          try {
            storage()?.setItem(key, serialized);
          } catch {
            /* Memory cache still works. */
          }
        }
        return result;
      } catch (error) {
        return { data: null, error };
      } finally {
        if (started === generation) pending.delete(key);
      }
    })();
    pending.set(key, request);
    return request;
  }
  return { load, invalidate };
}
