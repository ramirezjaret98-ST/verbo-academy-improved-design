// Per-student leaderboard identity: whether they appear on the Challenges
// leaderboard using their real name+avatar, or a chosen nickname with a
// generic initials avatar. Persisted in localStorage, broadcast so the
// leaderboard reflects edits from the ProfileModal without a reload.
import { useEffect, useState } from "react";

const KEY = "verbo:leaderboard-identity";
const EVT = "verbo:leaderboard-identity-updated";

export type LeaderboardIdentityMode = "real" | "nickname";

export interface LeaderboardIdentity {
  mode: LeaderboardIdentityMode;
  nickname: string;
}

type Map = Record<string, LeaderboardIdentity>;

function read(): Map {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

function write(m: Map) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(m));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function getLeaderboardIdentity(userId: string): LeaderboardIdentity {
  return read()[userId] ?? { mode: "real", nickname: "" };
}

export function setLeaderboardIdentity(userId: string, id: LeaderboardIdentity) {
  const m = read();
  m[userId] = id;
  write(m);
}

export function useLeaderboardIdentity(userId: string | undefined): LeaderboardIdentity {
  const [val, setVal] = useState<LeaderboardIdentity>({ mode: "real", nickname: "" });
  useEffect(() => {
    if (!userId) return;
    const sync = () => setVal(getLeaderboardIdentity(userId));
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);
  return val;
}

export function subscribeLeaderboardIdentity(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", onStorage);
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
