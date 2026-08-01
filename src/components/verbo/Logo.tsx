export function Logo({ className = "", showWordmark = true, dark = false }: { className?: string; showWordmark?: boolean; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent shadow-soft"
        aria-hidden="true"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M12 8L16 10.5V15.5L12 18L8 15.5V10.5L12 8Z"
            fill="white"
            fillOpacity="0.35"
          />
          <path
            d="M12 8V3M12 18V21M8 10.5L4 7.5M16 10.5L20 7.5M8 15.5L4 16.5M16 15.5L20 16.5"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-semibold tracking-tight" style={{ color: dark ? "#ffffff" : undefined }}>Lumina</span>
          <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: dark ? "#ffffff" : "#000000" }}>Learning Platform</span>
        </div>
      )}
    </div>
  );
}
