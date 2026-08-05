import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { USERS, type User, type Role } from "./mock-data";
import { isMemberBlocked } from "./groups-store";
import { hydrateAdminRoles, isUserDeactivated } from "./admin-roles";

interface AuthCtx {
  user: User | null;
  /** False until the stored session has been restored on the client. */
  ready: boolean;
  /** True during an intentional sign-out, from the moment `logout()` is called
   *  until the app finishes navigating away from the protected area. Protected
   *  UI (guards, screens) must use it to tell a deliberate logout apart from a
   *  session that actually expired. */
  isLoggingOut: boolean;
  login: (email: string, password: string, remember: boolean) => { ok: true; role: Role } | { ok: false; error: string };

  logout: () => void;
  updateProfile: (
    updates: { name?: string; currentPassword?: string; newPassword?: string; forceChange?: boolean },
  ) => { ok: true } | { ok: false; error: string };
}

/** Password complexity rule shared by forced-change and normal profile flow.
 *  At least 4 chars, at least one uppercase letter, and at least one digit. */
export function validatePasswordComplexity(pwd: string): string | null {
  if (!pwd || pwd.length < 4) return "Password must be at least 4 characters.";
  if (!/[A-Z]/.test(pwd)) return "Password must include at least one uppercase letter.";
  if (!/[0-9]/.test(pwd)) return "Password must include at least one number.";
  return null;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "verbo.auth.user.v2";
const LEGACY_KEYS = ["verbo.auth.user"];

/** Persisted session envelope. `expiresAt` is null for session-only storage. */
type StoredSession = { user: User; expiresAt: number | null };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function safeRead(store: Storage | undefined): StoredSession | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession | User;
    // Tolerate the legacy shape (bare user object) written by older builds.
    if (parsed && typeof parsed === "object" && "user" in parsed) return parsed as StoredSession;
    return { user: parsed as User, expiresAt: null };
  } catch {
    return null;
  }
}

function safeRemove(store: Storage | undefined) {
  try { store?.removeItem(KEY); } catch {}
}

function safeWrite(store: Storage | undefined, session: StoredSession) {
  try { store?.setItem(KEY, JSON.stringify(session)); } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (logoutTimer.current) clearTimeout(logoutTimer.current); }, []);


  useEffect(() => {
    hydrateAdminRoles();
    // Drop legacy-shaped sessions so stale role/admin_type fields don't leak in.
    for (const k of LEGACY_KEYS) {
      try { localStorage.removeItem(k); } catch {}
    }

    const restore = (store: Storage): User | null => {
      const stored = safeRead(store);
      if (!stored) return null;
      if (stored.expiresAt !== null && Date.now() > stored.expiresAt) {
        safeRemove(store);
        return null;
      }
      // Re-hydrate from the canonical USERS list so shape changes (new roles,
      // admin_type, etc.) always take effect without forcing a re-login.
      const canonical = USERS.find((u) => u.id === stored.user.id);
      if (!canonical) {
        safeRemove(store);
        return null;
      }
      const merged: User = { ...canonical, ...(stored.user.password ? { password: stored.user.password } : {}) };
      safeWrite(store, { user: merged, expiresAt: stored.expiresAt });
      return merged;
    };

    const restored = restore(localStorage) ?? restore(sessionStorage);
    if (restored) setUser(restored);
    setReady(true);
  }, []);

  const login: AuthCtx["login"] = (email, password, remember) => {
    hydrateAdminRoles();
    const match = USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    );
    if (!match) return { ok: false, error: "Invalid credentials. Contact your administrator." };
    // Group members in Pending Removal or Archived status lose platform access.
    if (match.role === "student" && isMemberBlocked(match.id)) {
      return { ok: false, error: "Access revoked. Contact your administrator." };
    }
    if (isUserDeactivated(match.id)) {
      return { ok: false, error: "Account deactivated. Contact your administrator." };
    }
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    setIsLoggingOut(false);
    setUser(match);
    if (remember) {
      safeRemove(sessionStorage);
      safeWrite(localStorage, { user: match, expiresAt: Date.now() + THIRTY_DAYS_MS });
    } else {
      safeRemove(localStorage);
      safeWrite(sessionStorage, { user: match, expiresAt: null });
    }
    return { ok: true, role: match.role };
  };

  /** Clears the session. Raises `isLoggingOut` synchronously (before `user`
   *  becomes null) so protected screens can skip the "session expired" state
   *  while the app navigates away; the flag lowers on the next tick pair, or
   *  immediately on a new login. */
  const logout = () => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    setIsLoggingOut(true);
    setUser(null);
    safeRemove(localStorage);
    safeRemove(sessionStorage);
    logoutTimer.current = setTimeout(() => setIsLoggingOut(false), 1200);
  };

  const updateProfile: AuthCtx["updateProfile"] = (updates) => {
    if (!user) return { ok: false, error: "No active session." };

    if (updates.newPassword) {
      if (!updates.forceChange && updates.currentPassword !== user.password) {
        return { ok: false, error: "Current password is incorrect." };
      }
      const complexityError = validatePasswordComplexity(updates.newPassword);
      if (complexityError) {
        return { ok: false, error: complexityError };
      }
    }

    const next: User = {
      ...user,
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.newPassword ? { password: updates.newPassword, must_change_password: false } : {}),
    };

    // Keep the in-memory mock DB in sync so a re-login reflects the change.
    const idx = USERS.findIndex((u) => u.id === user.id);
    if (idx !== -1) USERS[idx] = next;

    setUser(next);
    // Write back into whichever storage currently holds the active session,
    // preserving the original expiry.
    const local = safeRead(localStorage);
    const target = local ? localStorage : sessionStorage;
    const existing = local ?? safeRead(sessionStorage);
    safeWrite(target, { user: next, expiresAt: existing?.expiresAt ?? null });
    return { ok: true };
  };


  return <Ctx.Provider value={{ user, ready, isLoggingOut, login, logout, updateProfile }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
