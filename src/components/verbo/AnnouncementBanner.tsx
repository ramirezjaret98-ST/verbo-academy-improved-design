// Dismissible announcement banner stack shown at the top of the Student and
// Teacher panels. Reads the shared announcements store (audience = "all" or
// the current role) and lets each user close individual banners.
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { X } from "lucide-react";
import megaphoneAsset from "@/assets/red_megaphone.svg.asset.json";
import {
  useAnnouncements,
  announcementsForRole,
  dismissAnnouncement,
} from "@/lib/announcements-store";

/** Duration of the dismiss exit animation (.verbo-banner-out) in ms. */
const EXIT_MS = 200;

export function AnnouncementBanner() {
  const { user } = useAuth();
  // Subscribe so the stack re-renders on publish / end / dismiss.
  useAnnouncements();
  // Purely visual: which banner is currently playing its exit animation.
  const [exiting, setExiting] = useState<string | null>(null);

  if (!user || (user.role !== "student" && user.role !== "teacher")) return null;

  const items = announcementsForRole(user.role);
  if (items.length === 0) return null;

  const handleDismiss = (id: string) => {
    setExiting(id);
    window.setTimeout(() => {
      dismissAnnouncement(id);
      setExiting((cur) => (cur === id ? null : cur));
    }, EXIT_MS);
  };

  return (
    <div className="flex flex-col gap-2.5 mb-6">
      {items.map((a, i) => (
        <div
          key={a.id}
          className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-[#f38934]/20 bg-card py-3 pl-5 pr-3 shadow-soft transition-shadow duration-200 ease-out hover:shadow-card ${
            exiting === a.id ? "verbo-banner-out" : "verbo-stagger-in"
          }`}
          style={exiting === a.id ? undefined : { animationDelay: `${i * 60}ms` }}
        >
          {/* Left accent rail */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1"
            style={{ background: "linear-gradient(180deg, #f9b233, #f38934)" }}
          />
          {/* Soft glow bleeding from the left */}
          <span
            aria-hidden
            className="pointer-events-none absolute -left-16 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(243,137,52,0.22), transparent 70%)" }}
          />

          <span
            aria-hidden
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f38934]/12 ring-1 ring-inset ring-[#f38934]/25"
          >
            <img
              src={megaphoneAsset.url}
              alt=""
              className="h-7 w-7 object-contain"
              loading="lazy"
            />
          </span>

          <div className="relative min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f38934]">
              Announcement
            </div>
            <p className="mt-0.5 text-sm leading-snug tracking-[-0.01em] text-foreground">
              {a.message}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleDismiss(a.id)}
            aria-label="Dismiss announcement"
            className="verbo-press relative shrink-0 self-start rounded-full p-1.5 text-muted-foreground opacity-60 transition-[opacity,background-color,color] duration-200 ease-out hover:bg-[#f38934]/10 hover:text-[#f38934] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );

}
