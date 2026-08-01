// Pure-CSS confetti burst, extracted from Learning Path so any surface that
// wants to celebrate can reuse the exact same visual. Honors
// prefers-reduced-motion via an inline media query. Accepts an optional
// `theme` prop so lightning completions use an electric yellow/blue palette
// instead of the generic celebratory mix.
export function Confetti({ theme = "default" }: { theme?: "default" | "lightning" }) {
  const pieces = Array.from({ length: 40 }).map((_, i) => i);
  const colors =
    theme === "lightning"
      ? ["#fde047", "#facc15", "#eab308", "#0ea5e9", "#38bdf8", "#1e40af"]
      : ["#f38934", "#024366", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes verbo-confetti { 0% { transform: translateY(-20vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .verbo-confetti-piece { display: none; } }
      `}</style>
      {pieces.map((i) => (
        <span
          key={i}
          className="verbo-confetti-piece absolute block"
          style={{
            left: `${(i * 137) % 100}%`,
            top: 0,
            width: 8,
            height: 14,
            background: colors[i % colors.length],
            animation: `verbo-confetti ${2 + (i % 5) * 0.3}s cubic-bezier(0.2,0.6,0.2,1) ${(i % 10) * 0.05}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
