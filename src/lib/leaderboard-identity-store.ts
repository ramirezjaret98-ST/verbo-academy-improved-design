// Per-student leaderboard identity: whether they appear on the Challenges
// leaderboard using their real name+avatar, or a chosen nickname with a
// generic initials avatar.
//
// Backed by Supabase (`public.leaderboard_identities`, one row per student —
// `student_id` is its primary key). RLS allows open SELECT (any signed-in
// user can peek at anyone's identity — needed for ProfilePeekCard and the
// leaderboard itself) and self/admin write. Small table, so we keep a single
// global in-memory cache (legacy id -> identity) hydrated once and kept in
// sync via Postgres Realtime, mirroring the pattern used by
// `holidays-store.ts`/`badges-store.ts`.
//
// Reads (`getLeaderboardIdentity`) stay synchronous off the cache. Writes
// (`setLeaderboardIdentity`) update the cache optimistically and persist to
// Supabase in the background — this keeps the exported API identical to the
// old localStorage version, so call sites don't need to change.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export const EVT = "verbo:leaderboard-identity-updated";

export type LeaderboardIdentityMode = "real" | "nickname";

export interface LeaderboardIdentity {
  mode: LeaderboardIdentityMode;
  nickname: string;
}

type Row = Database["public"]["Tables"]["leaderboard_identities"]["Row"];

const DEFAULT_IDENTITY: LeaderboardIdentity = { mode: "real", nickname: "" };

let cache = new Map<string, LeaderboardIdentity>(); // legacy studentId -> identity
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT));
}

function applyRows(rows: Row[]) {
  const next = new Map<string, LeaderboardIdentity>();
  for (const row of rows) {
    const legacyId = uuidToLegacySync(row.student_id);
    next.set(legacyId, {
      mode: row.mode === "nickname" ? "nickname" : "real",
      nickname: row.nickname ?? "",
    });
  }
  cache = next;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase.from("leaderboard_identities").select("*");
    if (error) {
      console.error("[leaderboard-identity-store] failed to load", error);
      hydrated = true;
      return;
    }
    applyRows(data ?? []);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("leaderboard-identities-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_identities" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
}

export function getLeaderboardIdentity(userId: string): LeaderboardIdentity {
  if (!hydrated) void hydrate();
  return cache.get(userId) ?? DEFAULT_IDENTITY;
}

/** Optimistically updates the local cache and persists to Supabase in the
 *  background (fire-and-forget, matching the old synchronous API). */
export function setLeaderboardIdentity(userId: string, identity: LeaderboardIdentity) {
  cache.set(userId, identity);
  notify();
  void (async () => {
    const uuid = await legacyToUuid(userId);
    if (!uuid) return;
    const { error } = await supabase
      .from("leaderboard_identities")
      .upsert({ student_id: uuid, mode: identity.mode, nickname: identity.nickname }, { onConflict: "student_id" });
    if (error) console.error("[leaderboard-identity-store] failed to save", error);
  })();
}

export function useLeaderboardIdentity(userId: string | undefined): LeaderboardIdentity {
  const [val, setVal] = useState<LeaderboardIdentity>(DEFAULT_IDENTITY);
  useEffect(() => {
    if (!userId) return;
    const sync = () => setVal(getLeaderboardIdentity(userId));
    sync();
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, [userId]);
  return val;
}

export function subscribeLeaderboardIdentity(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Deterministic HSL color from an arbitrary string — used for the generic
 *  nickname avatar background so each nickname keeps a stable color. */
export function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 45%)`;
}

/** Up to 2 initials from a name/nickname, upper-cased. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
