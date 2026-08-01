import logoSrc from "@/assets/verbo-logo.png";

export function Logo({ className = "", showWordmark = true, dark = false }: { className?: string; showWordmark?: boolean; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={logoSrc}
        alt="Verbo Language Solutions"
        className="verbo-logo-pulse h-9 w-9 rounded-lg object-cover"
      />
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-semibold tracking-tight" style={{ color: dark ? "#ffffff" : undefined }}>Verbo</span>
          <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: dark ? "#ffffff" : "#000000" }}>Language Solutions</span>
        </div>
      )}
    </div>
  );
}
