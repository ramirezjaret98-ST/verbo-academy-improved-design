// Announcements — created by the admin in Overview, reflected as dismissible
// banners at the top of the Student and Teacher panels. Persisted to
// localStorage and broadcast so every open route stays in sync.
import { useSyncExternalStore } from "react";
import type { Role } from "./mock-data";

export type Audience = "all" | "students" | "teachers";

export interface Announcement {
  id: string;
  message: string;
  audience: Audience;
  published_at: string; // ISO datetime
  expires_at?: string; // ISO date (yyyy-mm-dd); undefined = no expiration
}

export const ANNOUNCEMENT_MAX = 280;

const KEY = "verbo:announcements";
const DISMISS_KEY = "verbo:announcements-dismissed";
export const ANN_EVENT = "verbo:announcements-updated";

const SEED: Announcement[] = [
  {
    id: "a-welcome",
    message: "Welcome to the new Verbo experience! Explore your dashboard and reach out to your coach anytime.",
    audience: "all",
    published_at: new Date().toISOString(),
  },
];

function safeRead<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

let cache: Announcement[] | null = null;
function invalidate() {
  cache = null;
}

function write(list: Announcement[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    invalidate();
    window.dispatchEvent(new CustomEvent(ANN_EVENT));
  } catch {
    /* noop */
  }
}

export function loadAnnouncements(): Announcement[] {
  if (typeof window === "undefined") return SEED;
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as Announcement[];
    } catch {
      /* noop */
    }
  }
  write(SEED);
  return SEED;
}

function notExpired(a: Announcement): boolean {
  if (!a.expires_at) return true;
  // active through the end of the expiration day
  const end = new Date(a.expires_at);
  end.setHours(23, 59, 59, 999);
  return end.getTime() >= Date.now();
}

export function activeAnnouncements(): Announcement[] {
  return loadAnnouncements()
    .filter(notExpired)
    .sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
}

export function publishAnnouncement(message: string, audience: Audience, expires_at?: string) {
  const trimmed = message.trim().slice(0, ANNOUNCEMENT_MAX);
  if (!trimmed) return;
  const item: Announcement = {
    id: `a-${Date.now()}`,
    message: trimmed,
    audience,
    published_at: new Date().toISOString(),
    expires_at: expires_at || undefined,
  };
  write([item, ...loadAnnouncements()]);
}

export function endAnnouncement(id: string) {
  write(loadAnnouncements().filter((a) => a.id !== id));
}

// ---- Per-user dismissals (banner close button) ----------------------------
function readDismissed(): string[] {
  return safeRead<string[]>(DISMISS_KEY, []);
}

export function dismissAnnouncement(id: string) {
  if (typeof window === "undefined") return;
  const next = Array.from(new Set([...readDismissed(), id]));
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(ANN_EVENT));
  } catch {
    /* noop */
  }
}

// Active announcements targeting a role, minus those the user dismissed.
export function announcementsForRole(role: Role): Announcement[] {
  const want: Audience = role === "student" ? "students" : "teachers";
  const dismissed = new Set(readDismissed());
  return activeAnnouncements().filter(
    (a) => (a.audience === "all" || a.audience === want) && !dismissed.has(a.id),
  );
}

// ---- React bindings -------------------------------------------------------
function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = () => {
    invalidate();
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === DISMISS_KEY) onEvent();
  };
  window.addEventListener(ANN_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ANN_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Announcement[] {
  if (cache === null) cache = loadAnnouncements();
  return cache;
}

export function useAnnouncements(): Announcement[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => SEED);
}
