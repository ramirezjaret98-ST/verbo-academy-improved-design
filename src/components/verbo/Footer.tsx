// Shared site footer (Landing + logged-in panels).
//
// Visual: an oversized band that fades from transparent into the brand navy,
// with a giant "VERBO" wordmark anchored to the floor as a watermark.
// Link groups are passed in per panel so no panel ever shows another's routes.
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/verbo/Logo";
import { FOOTER_CONTACT_LINKS, OFFICIAL_SITE_URL } from "@/lib/footer-links";

export interface FooterNavGroup {
  label: string;
  items: { label: string; to: string }[];
}

const colTitle =
  "text-[10px] font-medium uppercase tracking-[0.22em] text-white/35";

const linkCls =
  "block text-[11px] font-light uppercase tracking-[0.16em] text-white/70 transition-colors duration-200 ease-out hover:text-[var(--orange-500)] focus:outline-none focus-visible:text-[var(--orange-500)]";

const placeholderCls =
  "block cursor-not-allowed text-[11px] font-light uppercase tracking-[0.16em] text-white/30";

export function Footer({ nav = [] }: { nav?: FooterNavGroup[] }) {
  return (
    <footer className="relative isolate overflow-hidden">
      {/* Navy fade — transparent at the top, solid brand navy at the floor. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(to top, var(--navy-700) 0%, var(--navy-700) 28%, color-mix(in oklab, var(--navy-700) 55%, transparent) 62%, transparent 100%)",
        }}
      />

      {/* Oversized wordmark watermark, anchored to the bottom edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 overflow-hidden">
        <div
          className="translate-y-[22%] select-none text-center font-semibold leading-[0.78] tracking-[-0.04em] text-white/[0.06]"
          style={{ fontSize: "clamp(6rem, 19vw, 18rem)" }}
        >
          VERBO
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-40 pt-24">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          {/* Panel-specific navigation (never mixed across panels). */}
          <div className="flex flex-wrap gap-x-14 gap-y-10">
            {nav.map((group) => (
              <nav key={group.label} className="min-w-[9rem]">
                <p className={colTitle}>{group.label}</p>
                <div className="mt-4 space-y-2.5">
                  {group.items.map((it) => (
                    <Link key={it.to} to={it.to} className={linkCls}>
                      {it.label}
                    </Link>
                  ))}
                </div>
              </nav>
            ))}

            <nav className="min-w-[9rem]">
              <p className={colTitle}>Company</p>
              <div className="mt-4 space-y-2.5">
                <a href={OFFICIAL_SITE_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  Official Website
                </a>
                <span className={placeholderCls} aria-disabled="true">
                  FAQs
                </span>
              </div>
            </nav>
          </div>

          {/* Text-only contact channels. */}
          <nav className="min-w-[9rem]">
            <p className={colTitle}>Connect</p>
            <div className="mt-4 space-y-2.5">
              {FOOTER_CONTACT_LINKS.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {l.label}
                </a>
              ))}
            </div>
          </nav>
        </div>

        {/* Baseline row */}
        <div className="mt-24 flex flex-col items-start gap-6 border-t border-white/10 pt-8 md:flex-row md:items-center md:justify-between">
          <Logo dark />
          <div className="flex flex-col gap-3 text-[11px] font-light uppercase tracking-[0.16em] text-white/45 md:flex-row md:items-center md:gap-8">
            <span>© 2026 Verbo Language Solutions. All rights reserved.</span>
            <span className={placeholderCls} aria-disabled="true">
              Terms &amp; Conditions
            </span>
            <Link to="/privacy" className={linkCls}>
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
