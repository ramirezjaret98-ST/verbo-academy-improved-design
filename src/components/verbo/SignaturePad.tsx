// Firma electrónica — dibujar o subir imagen, 2026-08-26.
//
// Sin dependencia nueva (no se agregó react-signature-canvas/signature_pad al
// proyecto): un <canvas> con pointer events es suficiente para "dibuja tu
// firma", y FileReader.readAsDataURL para "sube una imagen" — ambos casos
// terminan en el mismo dato (un PNG en base64) que consume contract-pdf.ts.
import { useEffect, useRef, useState } from "react";
import { Pencil, Upload, Eraser } from "lucide-react";

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  // Canvas is reset whenever the mode changes so switching tabs never leaves
  // a stray signature from the other mode behind.
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    hasStrokeRef.current = false;
    onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const pointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStrokeRef.current = true;
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasStrokeRef.current) onChange(canvas.toDataURL("image/png"));
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    onChange(null);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadPreview(dataUrl);
      onChange(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("draw")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${mode === "draw" ? "bg-[#01304a] text-white" : "bg-secondary text-muted-foreground"}`}
        >
          <Pencil className="h-3.5 w-3.5" /> Dibujar
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${mode === "upload" ? "bg-[#01304a] text-white" : "bg-secondary text-muted-foreground"}`}
        >
          <Upload className="h-3.5 w-3.5" /> Subir imagen
        </button>
      </div>

      {mode === "draw" ? (
        <div>
          <canvas
            ref={canvasRef}
            width={420}
            height={140}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className="w-full touch-none rounded-lg border border-dashed border-[#01304a]/30 bg-white"
            style={{ maxWidth: 420 }}
          />
          <button type="button" onClick={clearCanvas} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Eraser className="h-3.5 w-3.5" /> Borrar y firmar de nuevo
          </button>
        </div>
      ) : (
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-[#01304a] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />
          {uploadPreview && (
            <img src={uploadPreview} alt="Firma subida" className="mt-2 h-[70px] rounded-lg border border-border object-contain" />
          )}
        </div>
      )}
    </div>
  );
}
