import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { registerRehydrate } from "@/lib/auth-rehydrate";

export interface ChallengeLeaderboardRow {
  userId: string;
  displayName: string;
  useRealAvatar: boolean;
  avatarSeed: string;
  completed: number;
  currentStreak: number | null;
  longestStreak: number | null;
  lastDeliveryAt: string | null;
}
type Snapshot = { status: "idle" | "loading" | "ready" | "error"; rows: ChallengeLeaderboardRow[] };
const EMPTY: Snapshot = { status: "idle", rows: [] };
let snapshot = EMPTY;
let generation = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

export async function refreshChallengeLeaderboard(): Promise<void> {
  if (inFlight) return inFlight;
  const request = ++generation;
  inFlight = (async () => {
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (request !== generation) return;
      if (!auth.session) { publish(EMPTY); return; }
      publish({ status: "loading", rows: snapshot.rows });
      const { data, error } = await supabase.rpc("challenge_leaderboard");
      if (request !== generation) return;
      if (error || !data) { publish({ status: "error", rows: [] }); return; }
      publish({ status: "ready", rows: data.map(row => ({
        userId: row.legacy_id ?? row.student_id,
        displayName: row.display_name,
        useRealAvatar: row.use_real_avatar,
        avatarSeed: row.avatar_seed,
        completed: Number(row.completed_count),
        currentStreak: row.current_streak === null ? null : Number(row.current_streak),
        longestStreak: row.longest_streak === null ? null : Number(row.longest_streak),
        lastDeliveryAt: row.last_delivery_at,
      })) });
    } catch {
      if (request === generation) publish({ status: "error", rows: [] });
    }
  })().finally(() => { if (request === generation) inFlight = null; });
  return inFlight;
}

function invalidate() {
  generation++;
  inFlight = null;
  publish(EMPTY);
  if (listeners.size) void refreshChallengeLeaderboard();
}

if (typeof window !== "undefined") {
  registerRehydrate(invalidate);
  supabase.channel("challenge-leaderboard-real-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "challenge_submissions" }, () => { void refreshChallengeLeaderboard(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_identities" }, () => { void refreshChallengeLeaderboard(); })
    .subscribe();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) startRefreshing();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopRefreshing?.();
  };
}

let stopRefreshing: (() => void) | null = null;
function startRefreshing() {
    void refreshChallengeLeaderboard();
    const refresh = () => { if (document.visibilityState === "visible") void refreshChallengeLeaderboard(); };
    window.addEventListener("focus", refresh);
    // Other students' submissions remain private under RLS, so their approval
    // events may not be visible to this viewer's Realtime subscription.
    const timer = setInterval(refresh, 60_000);
    stopRefreshing = () => { window.removeEventListener("focus", refresh); clearInterval(timer); stopRefreshing = null; };
}

export function useChallengeLeaderboard() {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
