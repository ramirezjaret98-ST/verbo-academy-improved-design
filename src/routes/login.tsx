import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { USERS } from "@/lib/mock-data";
import { Logo } from "@/components/verbo/Logo";
import { PhotoPlaceholder } from "@/components/verbo/ui";
import logoSrc from "@/assets/verbo-logo.png";
import { ArrowLeft, X } from "lucide-react";

/** Animated eye that opens/closes its lid instead of toggling a slash. */
function EyeToggle({ open }: { open: boolean }) {
  const lid = open
    ? "M2 12 C6 5, 18 5, 22 12 C18 19, 6 19, 2 12 Z"
    : "M2 12 C6 12, 18 12, 22 12 C18 12, 6 12, 2 12 Z";
  return (
    <svg
      className="verbo-eye h-[18px] w-[18px]"
      data-closed={!open}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path className="verbo-eye-lid" d={lid} />
      <circle className="verbo-eye-pupil" cx="12" cy="12" r="3.1" />
      <g className="verbo-eye-lash">
        <path d="M5 14.5 L3.6 16.6" />
        <path d="M12 15.4 L12 18" />
        <path d="M19 14.5 L20.4 16.6" />
      </g>
    </svg>
  );
}


export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Verbo Language Solutions" }] }),
  component: LoginPage,
});

const EXECUTIVE_PHRASES = [
  "Fluency isn't about grammar rules. It's about walking into any room, in any language, and being fully yourself.",
  "We built Verbo because your career shouldn't wait for 'someday I'll be fluent.'",
  "The best negotiators aren't the ones with the biggest vocabulary. They're the ones who sound like themselves in any language.",
];

type BtnState = "idle" | "loading" | "success" | "error";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [btnState, setBtnState] = useState<BtnState>("idle");
  const [pop, setPop] = useState(false);
  const [overlay, setOverlay] = useState<{ x: number; y: number } | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const [showDevSandbox, setShowDevSandbox] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const submitting = btnState !== "idle";

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    const devFlag =
      new URLSearchParams(window.location.search).get("dev") === "1" ||
      window.localStorage.getItem("verbo_dev") === "1";
    setShowDevSandbox(devFlag);
  }, []);

  const phrase = useMemo(
    () => EXECUTIVE_PHRASES[Math.floor(Math.random() * EXECUTIVE_PHRASES.length)],
    [],
  );

  useEffect(() => {
    if (user && btnState === "idle") {
      if (user.must_change_password) {
        navigate({ to: "/change-password" });
        return;
      }
      const dest = user.role === "admin" ? "/admin" : user.role === "teacher" ? "/teacher" : "/student";
      navigate({ to: dest });
    }
  }, [user, navigate, btnState]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setBtnState("loading");
    later(() => {
      const res = login(email.trim(), password, remember);
      if (!res.ok) {
        setError(res.error);
        setBtnState("error");
        later(() => setBtnState("idle"), 900);
        return;
      }
      const match = USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      const dest = match?.must_change_password
        ? "/change-password"
        : res.role === "admin"
          ? "/admin"
          : res.role === "teacher"
            ? "/teacher"
            : "/student";

      setBtnState("success");

      if (prefersReducedMotion()) {
        navigate({ to: dest });
        return;
      }

      setPop(true);
      later(() => setPop(false), 200);
      later(() => {
        const rect = btnRef.current?.getBoundingClientRect();
        setOverlay({
          x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
          y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
        });
        requestAnimationFrame(() => requestAnimationFrame(() => setOverlayOpen(true)));
        later(() => navigate({ to: dest }), 520);
      }, 200);
    }, 900);
  };


  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 p-6 lg:p-10">
      <div className="w-full max-w-5xl">
        <Link to="/" className="mb-4 inline-flex w-fit items-center gap-2 text-sm text-[#01304a]/60 transition-colors hover:text-[#01304a]">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>
      </div>

      <div className="grid w-full max-w-5xl grid-cols-1 items-stretch overflow-hidden rounded-[2rem] shadow-floating lg:grid-cols-2">
      {/* Form side */}
      <div className="relative flex flex-col overflow-hidden">
        <div className="relative z-10 flex h-full flex-col bg-white px-6 py-8">
          {/* Decorative orange blob */}
          <div
            className="pointer-events-none absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-accent/10"
            aria-hidden
          />

        <div className="relative z-10 m-auto w-full max-w-sm">

          <Logo className="verbo-signin-rise mb-10 [&_span]:text-[#01304a] [&_span.text-muted-foreground]:text-[#01304a]/70" />
          <h1 className="verbo-signin-rise text-3xl font-semibold tracking-tight text-[#01304a]" style={{ animationDelay: "70ms" }}>Sign in</h1>
          <p className="verbo-signin-rise mt-1.5 text-sm text-[#01304a]/70" style={{ animationDelay: "130ms" }}>Enter the credentials provided by your administrator.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="verbo-field verbo-signin-rise" style={{ animationDelay: "200ms" }}>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#01304a]">Email</label>
              <input
                type="email"
                required
                disabled={submitting}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="verbo-login-input mt-1.5 w-full rounded-lg border border-[#01304a]/15 bg-white px-3 py-2.5 text-sm text-[#01304a] placeholder:text-[#01304a]/40 focus:outline-none"
                placeholder="name@company.com"
              />
            </div>
            <div className="verbo-field verbo-signin-rise" style={{ animationDelay: "260ms" }}>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#01304a]">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  disabled={submitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="verbo-login-input mt-1.5 w-full rounded-lg border border-[#01304a]/15 bg-white px-3 py-2.5 pr-10 text-sm text-[#01304a] placeholder:text-[#01304a]/40 focus:outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  onMouseDown={(e) => e.preventDefault()}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="verbo-eye-btn absolute right-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-[#01304a]/45 hover:text-[#f38934]"
                >
                  <EyeToggle open={showPassword} />
                </button>
              </div>
            </div>

            <div className="verbo-signin-rise flex items-center justify-between gap-3" style={{ animationDelay: "320ms" }}>
              <label className="flex items-center gap-2 text-xs text-[#01304a]/70">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={submitting}
                  className="h-3.5 w-3.5 rounded border-[#01304a]/25 accent-[#f38934] transition-transform duration-200 active:scale-90"
                />
                Remember me for 30 days
              </label>
              <a href="#" className="text-xs text-[#01304a]/70 transition-colors hover:text-[#01304a] hover:underline">
                Forgot your password?
              </a>
            </div>

            <div className="verbo-error-slot" data-open={error ? "true" : "false"} aria-live="polite">
              <div>
                <div
                  key={error}
                  className={`${error ? "verbo-error-nudge" : ""} flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive`}
                >
                  <X className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{error || "\u00a0"}</span>
                </div>
              </div>
            </div>


            <div className="flex justify-center">
              <button
                ref={btnRef}
                type="submit"
                disabled={submitting}
                aria-busy={btnState === "loading"}
                className={`${btnState === "idle" ? "verbo-cta-shimmer verbo-btn-glow" : ""} ${btnState === "error" ? "verbo-btn-shake" : ""} relative flex h-12 items-center justify-center overflow-hidden text-sm font-semibold text-white shadow-soft outline-none active:scale-[0.97]`}
                style={{
                  width: btnState === "idle" ? "100%" : "48px",
                  borderRadius: 9999,
                  backgroundColor:
                    btnState === "error"
                      ? "var(--destructive)"
                      : btnState === "idle"
                        ? "#f38934"
                        : "#01304a",
                  boxShadow:
                    btnState === "success"
                      ? "0 0 0 6px rgba(1,48,74,0.10), 0 12px 30px -10px rgba(1,48,74,0.55)"
                      : undefined,
                  transition:
                    "width 300ms cubic-bezier(0.16,1,0.3,1), background-color 260ms ease-out, box-shadow 320ms ease-out, transform 150ms ease-out",

                }}
              >
                <span
                  className="pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap"
                  style={{
                    opacity: btnState === "idle" ? 1 : 0,
                    filter: btnState === "idle" ? "blur(0px)" : "blur(2px)",
                    transition: "opacity 200ms ease-out, filter 200ms ease-out",
                  }}
                >
                  Sign in
                </span>
                <span
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  style={{
                    opacity: btnState === "idle" ? 0 : 1,
                    filter: btnState === "idle" ? "blur(2px)" : "blur(0px)",
                    transition: "opacity 200ms ease-out, filter 200ms ease-out",
                  }}
                  aria-hidden
                >
                  {btnState === "error" ? (
                    <X className="h-5 w-5 text-white" />
                  ) : (
                    <img
                      src={logoSrc}
                      alt=""
                      className={`h-6 w-6 rounded object-cover ${btnState === "loading" ? "verbo-iso-pulse" : ""}`}
                      style={{
                        transform: pop ? "scale(1.15)" : "scale(1)",
                        transition: "transform 200ms ease-out",
                      }}
                    />
                  )}
                </span>
              </button>
            </div>

            <div className="text-center">
              <a
                href="https://wa.link/9my846"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#01304a]/55 underline-offset-2 transition-colors hover:text-[#01304a] hover:underline"
              >
                Report an issue
              </a>
            </div>
          </form>


          {showDevSandbox && (
            <div className="verbo-glass-light mt-8 rounded-2xl p-4">
              <div className="inline-flex items-center rounded-md bg-[#01304a]/5 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[#01304a]/70">
                DEVELOPER SANDBOX
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-[#01304a]/75">
                <li><span className="font-semibold text-[#01304a]">Student:</span> elena@student.com / student123</li>
                <li><span className="font-semibold text-[#01304a]">Teacher:</span> sarah@verbo.com / teacher123</li>
                <li><span className="font-semibold text-[#01304a]">Admin:</span> admin@verbo.com / admin123</li>
              </ul>
            </div>
          )}
        </div>

        <div className="relative z-10 text-center text-xs text-[#01304a]/50">
          Verbo Language Solutions · Private platform · No self-registration
        </div>
        </div>
      </div>

      {/* Visual side */}
      <div
        className="group relative hidden overflow-hidden bg-[#01304a] lg:flex lg:flex-col lg:justify-between lg:p-12"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });
        }}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      >
        {/* Diagonal depth layer */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(135deg, var(--navy-900), #01304a 60%)" }}
          aria-hidden
        />
        {/* Aurora glow that follows the pointer */}
        <div
          className="verbo-panel-parallax pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(circle at 70% 60%, rgba(243,137,52,0.20), transparent 50%)",
            transform: `translate3d(${tilt.x * -22}px, ${tilt.y * -18}px, 0)`,
          }}
          aria-hidden
        />
        {/* Orange glow orb */}
        <div
          className="verbo-aurora-a verbo-panel-parallax pointer-events-none absolute -bottom-16 -right-16 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: "var(--orange-500)", opacity: 0.4 }}
          aria-hidden
        />
        {/* Cool counter-glow for depth */}
        <div
          className="verbo-aurora-b pointer-events-none absolute -left-24 top-[-10%] h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: "#2f7fa8", opacity: 0.4 }}
          aria-hidden
        />
        {/* Hairline sheen */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(120deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 30%), linear-gradient(0deg, rgba(0,0,0,0.18), transparent 45%)",
          }}
          aria-hidden
        />



        <div
          className="verbo-panel-parallax relative z-10 mt-auto"
          style={{ transform: `translate3d(${tilt.x * 10}px, ${tilt.y * 8}px, 0)` }}
        >

          <div className="verbo-fade-up text-xs font-medium uppercase tracking-[0.25em] text-white/60" style={{ animationDelay: "120ms" }}>
            A note from our team
          </div>
          <p
            className="verbo-fade-up mt-4 max-w-md text-2xl font-medium leading-snug tracking-tight text-white antialiased"
            style={{ animationDelay: "320ms", WebkitFontSmoothing: "antialiased" }}
          >
            "{phrase}"
          </p>
          <div className="verbo-fade-up mt-6 flex items-center gap-3" style={{ animationDelay: "520ms" }}>
            <PhotoPlaceholder tone="dark" shape="circle" className="h-12 w-12" />
            <span className="text-sm text-white/70">— The Verbo team</span>
          </div>
        </div>
      </div>
      </div>

      {overlay && (
        <div
          aria-hidden
          className="fixed inset-0 z-50"
          style={{
            backgroundColor: "#01304a",
            clipPath: `circle(${overlayOpen ? Math.hypot(typeof window !== "undefined" ? window.innerWidth : 1600, typeof window !== "undefined" ? window.innerHeight : 900) : 24}px at ${overlay.x}px ${overlay.y}px)`,
            transition: "clip-path 560ms cubic-bezier(0.65, 0, 0.35, 1)",
          }}
        />
      )}
    </div>


  );
}
