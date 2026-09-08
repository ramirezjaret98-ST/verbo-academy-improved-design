// 2026-09-08: Jaret's ask — the avatar upload in ProfileModal.tsx /
// StaffProfileModal.tsx used to just take whatever image was selected and
// store it as-is (rendered with CSS `object-cover`, so an odd aspect ratio
// or an off-center face got silently cropped with no way for the user to
// fix it). This adds a lightweight, dependency-free crop/reposition/zoom
// step between "pick a file" and "save as my avatar" — no library, since
// there's no way to verify a new npm dependency installs cleanly in this
// environment (see project memory: no bun/tsc available here).
//
// Math: `baseScale` fits the image's SHORTER side exactly to the circular
// viewport (matches the old default `object-cover` look at zoom=1), then
// `zoom` (1..MAX_ZOOM) scales up from there. `offset` is the image's pan in
// on-screen pixels, clamped so the viewport never shows empty space. On
// save, the visible circle is mapped back into the original image's pixel
// coordinates and drawn onto an offscreen canvas at OUTPUT resolution.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X, ZoomIn, ZoomOut } from "lucide-react";
import { GhostButton, PrimaryButton } from "@/components/verbo/ui";

const VIEWPORT = 260; // on-screen crop window, px (square)
const OUTPUT = 480; // exported avatar resolution, px (square)
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function AvatarCropper({
  imageSrc,
  onCancel,
  onSave,
}: {
  /** Data URL of the file the user just picked (unmodified, full-size). */
  imageSrc: string;
  onCancel: () => void;
  /** Called with the cropped square avatar as a data URL (JPEG). */
  onSave: (dataUrl: string) => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const baseScale = natural ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const displayScale = baseScale * zoom;
  const dispW = natural ? natural.w * displayScale : 0;
  const dispH = natural ? natural.h * displayScale : 0;
  const maxOffsetX = Math.max(0, (dispW - VIEWPORT) / 2);
  const maxOffsetY = Math.max(0, (dispH - VIEWPORT) / 2);

  const clamp = useCallback(
    (o: { x: number; y: number }) => ({
      x: Math.min(maxOffsetX, Math.max(-maxOffsetX, o.x)),
      y: Math.min(maxOffsetY, Math.max(-maxOffsetY, o.y)),
    }),
    [maxOffsetX, maxOffsetY],
  );

  // Re-clamp whenever zoom (or the loaded image) changes the pan bounds.
  useEffect(() => {
    setOffset((o) => clamp(o));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.startOffset.x + dx, y: dragRef.current.startOffset.y + dy }));
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const handleSave = () => {
    if (!natural) return;
    const cropSizeNatural = VIEWPORT / displayScale;
    const cropLeftNatural = (dispW / 2 - VIEWPORT / 2 - offset.x) / displayScale;
    const cropTopNatural = (dispH / 2 - VIEWPORT / 2 - offset.y) / displayScale;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, cropLeftNatural, cropTopNatural, cropSizeNatural, cropSizeNatural, 0, 0, OUTPUT, OUTPUT);
      onSave(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = imageSrc;
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center verbo-backdrop p-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Adjust photo</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Drag to reposition, use the slider to zoom.</p>

        <div
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-full border border-border bg-secondary/40"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {natural && (
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                width: dispW,
                height: dispH,
                maxWidth: "none",
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-[#5fca16]"
            aria-label="Zoom"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSave} disabled={!natural}>
            <Check className="h-3.5 w-3.5" /> Save photo
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
