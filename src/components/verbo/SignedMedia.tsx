// Small reusable wrappers around storage-signed-url.ts for the two places
// stored content/materials URLs need to become an actual browser fetch:
// an <img>/<iframe>/<video>/<audio> `src` (needs the resolved URL present
// BEFORE the element renders → SignedImg/SignedIframe/SignedVideo/
// SignedAudio, backed by the useSignedContentUrl hook below) and an
// "open in a new tab" link (resolved on click → SignedDownloadTrigger,
// backed by openSignedContentUrl — no hook/state needed, so it's safe to
// use from inside a .map() row without violating rules-of-hooks).
//
// See storage-signed-url.ts for why this exists (Hallazgo 2, auditoría de
// seguridad 2026-09-15) and what it deliberately does NOT close.
import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode, VideoHTMLAttributes } from "react";
import { openSignedContentUrl, resolveContentUrl } from "@/lib/storage-signed-url";

/**
 * Resolves `url` to a signed URL when it points at the `content`/`materials`
 * Storage bucket (passes anything else through unchanged). Re-resolves
 * whenever `url` changes. Returns the original value until resolution
 * finishes so callers never render an empty `src` while waiting.
 */
export function useSignedContentUrl(url: string | null | undefined): { url: string; resolving: boolean } {
  const trimmed = (url ?? "").trim();
  const [resolved, setResolved] = useState(trimmed);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolved(trimmed);
    setResolving(true);
    resolveContentUrl(trimmed).then((signed) => {
      if (!cancelled) {
        setResolved(signed);
        setResolving(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  return { url: resolved, resolving };
}

export function SignedImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const { url } = useSignedContentUrl(src);
  return <img src={url} alt={alt} className={className} />;
}

export function SignedIframe({ src, title, className }: { src: string; title: string; className?: string }) {
  const { url } = useSignedContentUrl(src);
  // Hide the browser's own PDF-viewer chrome (toolbar, side "navpanes" with
  // thumbnails/bookmarks) so a PDF preview shows just the document instead of
  // a second, generic browser-within-our-browser UI sitting on top of ours.
  // Widely-supported "open parameters" for Chromium/Firefox's built-in
  // viewers — a plain '#' fragment, so it never touches the signed query
  // string or gets sent to the server.
  const viewerUrl = url ? `${url}#toolbar=0&navpanes=0` : url;
  return <iframe src={viewerUrl} title={title} className={className} />;
}

export function SignedVideo({
  src,
  className,
  controls = true,
  children,
  ...rest
}: {
  src: string;
  className?: string;
  controls?: boolean;
  children?: ReactNode;
} & Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "className" | "controls" | "children">) {
  const { url } = useSignedContentUrl(src);
  return (
    <video src={url} controls={controls} className={className} {...rest}>
      {children}
    </video>
  );
}

/**
 * Drop-in replacement for `<a href={url} target="_blank" rel="noreferrer">`
 * download/view links. Renders as a <button> (same classes/children work
 * unchanged) and resolves the signed URL on click, opening it in a new tab.
 * Safe to use anywhere, including inline inside a `.map()` row, since it
 * carries no hook state of its own.
 */
export function SignedDownloadTrigger({
  href,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "href">) {
  const handleClick: NonNullable<ButtonHTMLAttributes<HTMLButtonElement>["onClick"]> = (e) => {
    onClick?.(e);
    if (!e.defaultPrevented) void openSignedContentUrl(href);
  };
  return (
    <button type="button" onClick={handleClick} disabled={disabled} className={className} {...rest}>
      {children}
    </button>
  );
}
