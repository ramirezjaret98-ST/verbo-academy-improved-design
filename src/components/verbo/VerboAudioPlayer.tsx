import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

function formatDuration(sec?: number): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Shared audio player shell for listening exercises. Plays the real uploaded
 * file via `audioUrl` (from Storage) when present; falls back to the old
 * silent/simulated waveform for legacy activities that predate real audio
 * uploads (audioName set, but no audioUrl). It never exposes the source file
 * name, which is internal Admin metadata and must stay out of student-facing
 * views.
 */
export function VerboAudioPlayer({
  durationSec,
  audioUrl,
  disabled,
  className = "",
}: {
  durationSec?: number;
  audioUrl?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Stop playback if the underlying activity changes out from under us.
    return () => { audioRef.current?.pause(); };
  }, [audioUrl]);

  const toggle = () => {
    if (!audioUrl) { setIsPlaying((p) => !p); return; } // legacy fallback: no real file to play
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) el.pause();
    else void el.play();
  };

  return (
    <div className={`flex items-center gap-4 rounded-xl border border-border bg-secondary/50 p-4 ${className}`}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={isPlaying ? "Pause audio clip" : "Play audio clip"}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform duration-150 ease-out hover:scale-105 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>

      <div className="flex flex-1 items-end gap-1" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className={`w-1.5 rounded-full ${isPlaying ? "verbo-wave-bar bg-accent" : "bg-border"}`}
            style={{
              height: `${8 + ((i * 7) % 28)}px`,
              animationDelay: `${(i % 7) * 90}ms`,
            }}
          />
        ))}
      </div>

      <div className="shrink-0 text-right">
        <div className="text-xs font-medium text-muted-foreground">Audio · Verbo Academy</div>
        <div className="text-sm font-semibold tabular-nums text-foreground">{formatDuration(durationSec)}</div>
      </div>
    </div>
  );
}
