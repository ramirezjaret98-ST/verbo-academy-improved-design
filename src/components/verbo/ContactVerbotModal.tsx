import { AccentModal } from "@/components/verbo/ui";

import contactIcon from "@/assets/contact.svg.asset.json";
import contactRobotIcon from "@/assets/contact-robot.png.asset.json";

import supportIcon from "@/assets/support.svg.asset.json";
import academicIcon from "@/assets/academic.svg.asset.json";
import instagramIcon from "@/assets/Instagram_Logo_Effect.svg.asset.json";
import facebookIcon from "@/assets/Facebook_Animated_Icon.svg.asset.json";
import linkedinIcon from "@/assets/linkedin_icon.svg.asset.json";
import websiteIcon from "@/assets/Logo.svg.asset.json";
import { openContactModal, closeContactModal, useContactModalOpen } from "@/lib/contact-modal";

interface ContactOption {
  label: string;
  description: string;
  href: string;
  iconSrc: string;
  color: string;
  /** Wordmark-style art needs a wider box than the round social marks. */
  wide?: boolean;
  /** Soft pulsing glow (used for the Verbo logo on "Our website"). */
  pulse?: boolean;
}

/**
 * The two wa.link URLs already carry their own prescribed message on Verbo's
 * side — they are used verbatim, no message is built here.
 */
const OPTIONS: ContactOption[] = [
  { label: "Support", description: "Account, billing, or platform questions", href: "https://wa.link/zomggz", iconSrc: supportIcon.url, color: "#5fca16" },
  { label: "Academic team", description: "Questions about your classes or content", href: "https://wa.link/638ofg", iconSrc: academicIcon.url, color: "#01304a" },
  { label: "Instagram", description: "See what we're up to", href: "https://www.instagram.com/verbo_language_solutions", iconSrc: instagramIcon.url, color: "#a34ac0" },
  { label: "Facebook", description: "See what we're up to", href: "https://www.facebook.com/people/Verbo-Language-Solutions/61576604487318/", iconSrc: facebookIcon.url, color: "#1877f2" },
  { label: "LinkedIn", description: "Connect with us", href: "https://www.linkedin.com/company/verbo-language-solutions/", iconSrc: linkedinIcon.url, color: "#0a66c2" },
  { label: "Our website", description: "Learn more about Verbo", href: "https://verbolanguagesolutions.com/", iconSrc: websiteIcon.url, color: "#f38934", wide: true, pulse: true },
];

/** Navbar trigger — reused in the Student, Teacher and Admin panels. */
export function ContactVerbotButton({ variant = "light" }: { variant?: "light" | "dark" }) {
  return (
    <button
      type="button"
      onClick={openContactModal}
      aria-label="Contact VERBOT"
      title="Contact VERBOT"
      className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ease-out hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5fca16]/70 motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      {/* Subtle lime glow behind the icon on hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ boxShadow: "0 0 18px 6px rgba(95,202,22,0.35)", backgroundColor: "rgba(95,202,22,0.14)" }}
      />
      <img
        src={contactIcon.url}
        alt=""
        aria-hidden
        className={`relative h-8 w-8 select-none object-contain ${variant === "dark" ? "" : ""}`}
      />
    </button>
  );
}

/** Single instance is mounted at the app root; opened through the global store. */
export function ContactVerbotModal() {
  const open = useContactModalOpen();
  if (!open) return null;

  return (
    <AccentModal
      background="linear-gradient(135deg, #01304a 0%, #024a6e 100%)"
      iconTint="#ffffff"
      logoSrc={contactRobotIcon.url}
      eyebrow="Contact VERBOT"
      title="Need help or want to say hi?"
      watermark={{ type: "text", value: "HELLO" }}
      onClose={closeContactModal}
      maxWidth="max-w-lg"
      zClass="z-[70]"
    >

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <a
            key={o.label}
            href={o.href}
            target="_blank"
            rel="noopener noreferrer"
            className="verbo-press group relative flex items-center gap-3 overflow-hidden rounded-xl border border-white/60 bg-white/95 p-3 text-left shadow-soft transition-[transform,box-shadow] duration-200 ease-out hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            {/* Left accent rail keeps the brand identity without competing with the icon. */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 h-full w-1"
              style={{ backgroundColor: o.color }}
            />
            <img
              src={o.iconSrc}
              alt=""
              aria-hidden
              className={`shrink-0 select-none object-contain ${o.wide ? "h-9 w-14" : "h-9 w-9"} ${o.pulse ? "verbo-logo-pulse" : ""}`}
              style={o.pulse ? { filter: "drop-shadow(0 0 6px rgba(255,255,255,0.55))" } : undefined}
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight" style={{ color: o.color }}>
                {o.label}
              </span>
              <span className="block text-[11px] leading-snug text-[#111111]/70">{o.description}</span>
            </span>
          </a>
        ))}
      </div>
    </AccentModal>
  );
}
