import { useState } from "react";
import { Facebook, Linkedin, Instagram, Check, Copy, X } from "lucide-react";

const VERBO_URL = "https://verbolanguagesolutions.com/";

interface Props {
  levelName: string;
  productLabel: string;
  onClose: () => void;
}

/** Share sheet shown right after a level certificate is generated. */
export function CertificateShareModal({ levelName, productLabel, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  // Placeholder marketing copy — final wording to be defined later.
  const caption = `I just completed ${levelName} at Verbo Language Solutions! 🎉 ${productLabel ? `#Verbo${productLabel.replace(/\s+/g, "")} ` : ""}${VERBO_URL}`;

  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const shareFacebook = () =>
    open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(VERBO_URL)}&quote=${encodeURIComponent(caption)}`);

  const shareLinkedIn = () =>
    open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(VERBO_URL)}`);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = caption;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="verbo-overlay-in fixed inset-0 z-[70] flex items-center justify-center verbo-backdrop p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
        <div className="flex items-start justify-between bg-gradient-to-br from-[#01304a] to-[#024366] p-5 text-white">
          <div>
            <div className="font-display text-lg font-semibold">Share your achievement</div>
            <div className="mt-1 text-sm text-white/80">Your certificate is downloaded. Let the world know.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <button
            onClick={shareFacebook}
            className="flex w-full items-center gap-3 rounded-xl bg-[#1877f2] px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01]"
          >
            <Facebook className="h-5 w-5" /> Share on Facebook
          </button>
          <button
            onClick={shareLinkedIn}
            className="flex w-full items-center gap-3 rounded-xl bg-[#0a66c2] px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01]"
          >
            <Linkedin className="h-5 w-5" /> Share on LinkedIn
          </button>
          <button
            onClick={copyCaption}
            className="flex w-full items-center gap-3 rounded-xl bg-[#a34ac0] px-4 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01]"
          >
            {copied ? <Check className="h-5 w-5" /> : <Instagram className="h-5 w-5" />}
            {copied ? "Caption copied" : "Copy caption for Instagram"}
          </button>

          <div className="rounded-xl border border-border bg-secondary/50 p-3 text-xs leading-relaxed text-muted-foreground">
            {caption}
          </div>

          <button
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <Copy className="hidden" /> Done
          </button>
        </div>
      </div>
    </div>
  );
}
