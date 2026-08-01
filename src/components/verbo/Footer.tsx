// Shared site footer (Landing + logged-in panels).
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/verbo/Logo";

export function Footer() {
  return (
    <footer className="bg-[var(--navy-700)] border-t border-white/5">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs md:flex-row">
        <Logo dark />

        <div className="flex flex-col items-center gap-1 text-white/60 md:flex-row md:gap-3">
          <span>© 2026 Lumina Learning Platform. All rights reserved.</span>
          <Link
            to="/privacy"
            className="font-medium text-white/80 transition-colors duration-200 hover:text-[var(--orange-500)]"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
