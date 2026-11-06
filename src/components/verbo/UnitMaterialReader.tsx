import { useEffect, useState } from "react";
import { Download, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SignedDownloadTrigger } from "@/components/verbo/SignedMedia";
import { resolveContentUrl } from "@/lib/storage-signed-url";
import type { CourseUnit } from "@/lib/product-courses-store";

/** Reads the existing unit file. Opening it never writes learning progress. */
export function UnitMaterialReader({ unit, onClose }: { unit: CourseUnit; onClose: () => void }) {
  const [documentUrl, setDocumentUrl] = useState("");
  const [viewerUrl, setViewerUrl] = useState("");
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [returnFocus] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement),
  );
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    let objectUrl = "";
    setDocumentUrl("");
    setViewerUrl("");
    setError(false);
    void (async () => {
      try {
        const url = await resolveContentUrl(unit.pdf_url);
        if (!live) return;
        const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
        if (!response.ok) throw new Error("Material unavailable");
        const blob = await response.blob();
        if ((await blob.slice(0, 5).text()) !== "%PDF-") throw new Error("Not a PDF");
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setDocumentUrl(objectUrl);
        // Keep the viewer on the existing allowed Storage origin. Blob frames
        // are deliberately excluded by Academy's content security policy.
        setViewerUrl(url);
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [unit.pdf_url, retry]);
  const save = () => {
    if (!documentUrl) return;
    const link = document.createElement("a");
    link.href = documentUrl;
    link.download = unit.title.replace(/[<>:"/\\|?*]/g, "-") + ".pdf";
    link.click();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="uj-material-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus?.isConnected) returnFocus.focus();
        }}
      >
        <header className="uj-reader-header">
          <div className="uj-eyebrow">Session Prep</div>
          <DialogTitle>{unit.title}</DialogTitle>
          <DialogDescription>Read the material here, or keep a copy for later.</DialogDescription>
        </header>
        <div className="uj-reader-body" aria-busy={!documentUrl && !error}>
          {error ? (
            <div className="uj-reader-message" role="alert">
              <p>We couldn't show this material here right now.</p>
              <p>You can try again or open the original file in a new tab.</p>
              <button
                type="button"
                className="uj-button uj-secondary"
                onClick={() => setRetry((n) => n + 1)}
              >
                <RotateCcw size={16} /> Try again
              </button>
            </div>
          ) : documentUrl ? (
            <iframe
              src={viewerUrl + "#toolbar=0&navpanes=0"}
              title={unit.title + " session material"}
            />
          ) : (
            <div className="uj-reader-message" role="status">
              <LoaderCircle className="uj-loading" size={22} /> Opening your material…
            </div>
          )}
        </div>
        <footer className="uj-reader-footer">
          <SignedDownloadTrigger href={unit.pdf_url} className="uj-button uj-secondary">
            <ExternalLink size={16} /> Open separately
          </SignedDownloadTrigger>
          <button type="button" className="uj-button" disabled={!documentUrl} onClick={save}>
            <Download size={16} /> Save a copy
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
