import { useState } from "react";
import { SignedImg } from "@/components/verbo/SignedMedia";
import type { StoredMaterial } from "@/lib/materials-store";

export type MaterialCoverSettings = Pick<
  StoredMaterial,
  "cover_fit" | "cover_scale" | "cover_position_x" | "cover_position_y"
>;

/** All material cards use a 16:9 frame. Size the original image itself so
 * repositioning reveals its edges instead of moving an already cropped box. */
export function MaterialCover({
  src,
  alt,
  settings,
}: {
  src: string;
  alt: string;
  settings: MaterialCoverSettings;
}) {
  const [aspect, setAspect] = useState(16 / 9);
  const naturalWidth = (aspect / (16 / 9)) * 100;
  const fittedWidth =
    settings.cover_fit === "contain" ? Math.min(100, naturalWidth) : Math.max(100, naturalWidth);
  const x = settings.cover_position_x ?? 50;
  const y = settings.cover_position_y ?? 50;
  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <SignedImg
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalHeight) setAspect(image.naturalWidth / image.naturalHeight);
        }}
        className="absolute h-auto max-w-none select-none"
        style={{
          width: `${fittedWidth * (settings.cover_scale ?? 1)}%`,
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-${x}%, -${y}%)`,
        }}
      />
    </div>
  );
}

export function MaterialCoverEditor({
  src,
  value,
  onChange,
}: {
  src: string;
  value: MaterialCoverSettings;
  onChange: (value: MaterialCoverSettings) => void;
}) {
  const controls = [
    { key: "cover_scale", label: "Zoom", min: 0.5, max: 3, step: 0.05, initial: 1 },
    {
      key: "cover_position_x",
      label: "Horizontal position",
      min: 0,
      max: 100,
      step: 1,
      initial: 50,
    },
    { key: "cover_position_y", label: "Vertical position", min: 0, max: 100, step: 1, initial: 50 },
  ] as const;
  return (
    <div className="mt-3 space-y-4 rounded-xl border border-border bg-secondary/30 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Adjust cover</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Preview how the cover will look on the material card.
        </p>
      </div>
      <div className="mx-auto aspect-video w-full max-w-lg overflow-hidden rounded-lg border border-border bg-background">
        <MaterialCover src={src} alt="Cover framing preview" settings={value} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={value.cover_fit === "contain"}
          className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
          onClick={() =>
            onChange({
              cover_fit: "contain",
              cover_scale: 1,
              cover_position_x: 50,
              cover_position_y: 50,
            })
          }
        >
          Show full image
        </button>
        <button
          type="button"
          aria-pressed={(value.cover_fit ?? "cover") === "cover"}
          className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
          onClick={() =>
            onChange({
              cover_fit: "cover",
              cover_scale: 1,
              cover_position_x: 50,
              cover_position_y: 50,
            })
          }
        >
          Fill cover / reset
        </button>
      </div>
      {controls.map(({ key, label, min, max, step, initial }) => (
        <label key={key} className="block text-xs font-medium text-foreground">
          <span className="flex justify-between gap-3">
            {label}
            <span>{Math.round((value[key] ?? initial) * (key === "cover_scale" ? 100 : 1))}%</span>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value[key] ?? initial}
            aria-label={label}
            className="mt-2 w-full accent-primary"
            onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
