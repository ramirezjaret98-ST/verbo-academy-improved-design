import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StaffProfileModal } from "./StaffProfileModal";
import { useAvatar } from "@/lib/avatar-store";
import { NotificationsBell } from "./NotificationsBell";
import { ContactVerbotButton } from "./ContactVerbotModal";
import type { User } from "@/lib/mock-data";


function roleLabel(u?: User | null): string {
  if (!u) return "";
  if (u.role === "admin") {
    if (u.admin_type === "coordinator_ops") return "Coordinator · Operations";
    if (u.admin_type === "coordinator_fin") return "Coordinator · Financial";
    return "Super Admin";
  }
  if (u.role === "teacher") return "Teacher";
  return "Student";
}

export interface NavItem { to: string; label: string }
export interface NavGroup { label: string; items: NavItem[] }
export type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

function isActive(pathname: string, item: NavItem, exact?: boolean): boolean {
  return exact || item.to === "/teacher" || item.to === "/student" || item.to === "/admin"
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + "/");
}

function isGroupActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((it) => isActive(pathname, it));
}

const tabCls =
  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors duration-200 ease-out text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const activeTabCls =
  "data-[status=active]:bg-secondary data-[status=active]:text-foreground";

const darkTabCls =
  "relative z-10 inline-flex items-center gap-1 px-3 py-1.5 text-sm transition-colors duration-200 ease-out text-[#94a3b8] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f38934]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent data-[status=active]:text-white";

function SingleNav({ item, pathname, isDark, registerRef }: { item: NavItem; pathname: string; isDark?: boolean; registerRef?: (key: string, el: HTMLElement | null) => void }) {
  const active = isActive(pathname, item);
  return (
    <Link
      ref={(el: HTMLAnchorElement | null) => registerRef?.(item.to, el)}
      to={item.to}
      activeOptions={{ exact: active }}
      data-status={active ? "active" : undefined}
      className={isDark ? darkTabCls : `${tabCls} ${activeTabCls}`}
    >
      {item.label}
    </Link>
  );
}


function NavGroupDropdown({ group, pathname, isDark, registerRef }: { group: NavGroup; pathname: string; isDark?: boolean; registerRef?: (key: string, el: HTMLElement | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    let raf = 0;
    const update = () => {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setMenuPos({ top: r.bottom + 4, left: r.left });
    };
    update();
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const inTrigger = ref.current?.contains(t);
      const inMenu = menuRef.current?.contains(t);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => () => cancelClose(), []);

  const getMenuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? []);
  const focusItem = (index: number) => {
    const items = getMenuItems();
    if (!items.length) return;
    const i = (index + items.length) % items.length;
    items[i]?.focus();
  };
  const onButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusItem(0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusItem(-1));
    }
  };
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems();
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(current + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(current - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(items.length - 1); }
    else if (e.key === "Tab") { setOpen(false); }
  };

  const active = isGroupActive(pathname, group);

  return (
    <div
      ref={ref}
      className="relative z-10"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={(el) => { buttonRef.current = el; registerRef?.(`group:${group.label}`, el); }}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        data-status={active ? "active" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        className={isDark ? darkTabCls : `${tabCls} ${activeTabCls}`}
      >
        {group.label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={group.label}
          hidden={!open}
          onKeyDown={onMenuKeyDown}
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
          className="z-[60] min-w-[220px] rounded-xl border border-border bg-card p-1.5 shadow-elevated before:absolute before:-top-2 before:left-0 before:h-2 before:w-full before:content-['']"
        >
          {group.items.map((it) => {
            const itemActive = isActive(pathname, it);
            return (
              <Link
                key={it.to}
                to={it.to}
                role="menuitem"
                data-status={itemActive ? "active" : undefined}
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:bg-secondary focus:text-foreground focus:outline-none data-[status=active]:bg-secondary data-[status=active]:text-foreground"
              >
                {it.label}
              </Link>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function TopNav({ items, variant = "light" }: { items: NavEntry[]; variant?: "light" | "dark" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const isStudent = user?.role === "student";
  const isAdmin = user?.role === "admin";
  const isTeacher = user?.role === "teacher";
  const canEditProfile = isStudent || isAdmin || isTeacher;
  const avatar = useAvatar(user?.id);
  const isDark = variant === "dark";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerRef = (key: string, el: HTMLElement | null) => {
    if (el) itemRefs.current.set(key, el);
    else itemRefs.current.delete(key);
  };
  const headerRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0,
    width: 0,
    visible: false,
  });
  const scrollRef = useRef<HTMLElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 2);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 2);
  };

  useEffect(() => {
    updateFades();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);
    return () => {
      el.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
    };
  }, [items, pathname]);

  // Progressive transparency: fully opaque near the top, fully transparent
  // past FADE_END. Applied straight to the DOM node (no React state) so it
  // stays smooth during fast scrolls.
  useEffect(() => {
    const FADE_START = 24;
    const FADE_END = 220;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const el = headerRef.current;
      if (!el) return;
      const y = window.scrollY;
      const t = Math.min(1, Math.max(0, (y - FADE_START) / (FADE_END - FADE_START)));
      const opacity = 1 - t;
      el.style.opacity = String(opacity);
      el.style.pointerEvents = opacity < 0.05 ? "none" : "auto";
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const activeKey = (() => {
    for (const item of items) {
      if (isGroup(item)) {
        if (isGroupActive(pathname, item)) return `group:${item.label}`;
      } else if (isActive(pathname, item)) {
        return item.to;
      }
    }
    return null;
  })();

  useLayoutEffect(() => {
    if (!isDark) return;
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const el = activeKey ? itemRefs.current.get(activeKey) : null;
      if (!el || !el.isConnected) {
        setIndicator((p) => ({ ...p, visible: false }));
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      setIndicator({ left: rect.left - navRect.left, width: rect.width, visible: true });
    };
    measure();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      window.removeEventListener("resize", measure);
    };
  }, [pathname, isDark, items, activeKey]);

  return (
    <header
      ref={headerRef}
      className="fixed top-4 inset-x-4 lg:inset-x-6 z-40"
      style={{ transition: "opacity 180ms ease-out" }}
    >

      <div
        className={`mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full px-6 shadow-elevated ${
          isDark ? "" : "border border-border bg-background/85 backdrop-blur-xl"
        }`}
        style={isDark ? { backgroundColor: "#01304a", border: "1px solid rgba(255,255,255,0.08)" } : undefined}
      >
        <div className="flex min-w-0 flex-1 items-center gap-10">
          <Logo dark={isDark} />
          <div className="relative min-w-0 flex-1">
            <nav
              ref={(el) => { navRef.current = el; if (el) scrollRef.current = el; }}
              className="relative hidden items-center gap-1 md:flex h-16 overflow-x-auto scrollbar-none"
            >
              {isDark && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-1/2 z-0 h-9 rounded-full bg-white/12 transition-[transform,width,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  style={{
                    transform: `translateY(-50%) translateX(${indicator.left}px)`,
                    width: `${indicator.width}px`,
                    opacity: indicator.visible ? 1 : 0,
                  }}
                />
              )}
              {items.map((item) => {
                if (isGroup(item)) {
                  return <NavGroupDropdown key={item.label} group={item} pathname={pathname} isDark={isDark} registerRef={registerRef} />;
                }
                return <SingleNav key={item.to} item={item} pathname={pathname} isDark={isDark} registerRef={registerRef} />;
              })}
            </nav>
            {showLeftFade && (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r ${isDark ? "from-[#01304a]" : "from-background"} to-transparent`}
              />
            )}
            {showRightFade && (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l ${isDark ? "from-[#01304a]" : "from-background"} to-transparent`}
              />
            )}
          </div>
        </div>
        <div className={`flex shrink-0 items-center ${isDark ? "gap-6" : "gap-3"}`}>
          <div className="hidden text-right md:block">
            <div className={`text-sm font-medium ${isDark ? "text-white" : "text-foreground"}`}>{user?.name}</div>
            <div className={`text-xs ${isDark ? "text-[#94a3b8]" : "text-muted-foreground"}`}>{roleLabel(user)}</div>
          </div>
          {isDark ? (
            <div
              className="flex items-center gap-3 rounded-full px-2 py-1"
              style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
            >
              <ContactVerbotButton variant="dark" />
              {user && <NotificationsBell variant={variant} />}
              <span
                aria-hidden="true"
                className="h-6 w-px"
                style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              />
              <button
                type="button"
                onClick={() => canEditProfile && setProfileOpen(true)}
                disabled={!canEditProfile}
                className={`flex h-9 w-9 overflow-hidden items-center justify-center rounded-full text-sm font-bold text-white transition-all bg-[#f38934] ${
                  canEditProfile ? "cursor-pointer hover:ring-2 hover:ring-[#f38934]/60 hover:shadow-md" : ""
                }`}
                aria-label="Open profile"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  user?.name?.[0] ?? "?"
                )}
              </button>
            </div>
          ) : (
            <>
              <ContactVerbotButton />
              {user && <NotificationsBell variant={variant} />}
              <button
                type="button"
                onClick={() => canEditProfile && setProfileOpen(true)}
                disabled={!canEditProfile}
                className={`flex h-9 w-9 overflow-hidden items-center justify-center rounded-full text-sm font-bold text-white transition-all bg-secondary text-foreground ${
                  canEditProfile ? "cursor-pointer hover:ring-2 hover:ring-[#f38934]/60 hover:shadow-md" : ""
                }`}
                aria-label="Open profile"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  user?.name?.[0] ?? "?"
                )}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => { void navigate({ to: "/" }).then(() => logout()); }}
            className="Btn"
            aria-label="Sign out"
          >
            <div className="sign">
              <svg viewBox="0 0 24 24">
                <path d="M4 11h14v-4l6 5-6 5v-4H4z" />
              </svg>
            </div>
            <div className="text">Sign out</div>
          </button>
        </div>
      </div>
      {(isStudent || isAdmin || isTeacher) && (
        <StaffProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
      )}
    </header>
  );
}

