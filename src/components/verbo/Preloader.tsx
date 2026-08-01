import { useEffect, useState } from "react";

export function Preloader() {
  const [phase, setPhase] = useState<"reveal" | "exit" | "done">("reveal");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMounted(true);
    document.body.style.overflow = "hidden";

    const t1 = setTimeout(() => setPhase("exit"), 2600);
    const t2 = setTimeout(() => {
      setPhase("done");
      document.body.style.overflow = "";
    }, 3700);

    return () => {
      [t1, t2].forEach(clearTimeout);
      document.body.style.overflow = "";
    };
  }, []);

  if (phase === "done") return null;

  const exiting = phase === "exit";

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{
        pointerEvents: exiting ? "none" : "auto",
        opacity: mounted ? 1 : 0,
      }}
      aria-hidden={exiting}
    >
      {/* Top half */}
      <div
        className="absolute left-0 right-0 top-0 h-1/2 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, #01304a 0%, #051a26 55%, #02121c 100%)",
          transform: exiting ? "translateY(-100%)" : "translateY(0)",
          transition: "transform 1100ms cubic-bezier(0.85, 0, 0.15, 1)",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            opacity: 0.02,
          }}
        />
      </div>

      {/* Bottom half */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, #01304a 0%, #051a26 55%, #02121c 100%)",
          transform: exiting ? "translateY(100%)" : "translateY(0)",
          transition: "transform 1100ms cubic-bezier(0.85, 0, 0.15, 1)",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            opacity: 0.02,
          }}
        />
      </div>

      {/* Slogan */}
      <div
        className="absolute inset-0 flex items-center justify-center px-6"
        style={{
          opacity: exiting ? 0 : 1,
          transition: "opacity 500ms ease",
        }}
      >
        <h2
          className="verbo-pre-reveal text-center text-3xl font-semibold md:text-5xl"
          style={{
            color: "#f5f7fa",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          }}
        >
          Speak the Language of{" "}
          <span
            style={{
              fontWeight: 800,
              fontSize: "1.08em",
              color: "#f38934",
            }}
          >
            Growth!
          </span>
        </h2>
      </div>
    </div>
  );
}
