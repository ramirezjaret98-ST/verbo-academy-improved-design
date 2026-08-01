import { useEffect, useState } from "react";

const KEY = "verbo:avatars";
const EVT = "verbo:avatars-updated";

type Map = Record<string, string>;

function read(): Map {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function setAvatar(userId: string, dataUrl: string) {
  const m = read();
  m[userId] = dataUrl;
  localStorage.setItem(KEY, JSON.stringify(m));
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useAvatar(userId: string | undefined): string | null {
  const [val, setVal] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    const sync = () => setVal(read()[userId] ?? null);
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
