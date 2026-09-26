// Signed-URL resolver for the `content` and `materials` Storage buckets.
//
// Security audit 2026-09-15 (Hallazgo 2, ver memoria del proyecto): both
// buckets were PUBLIC, so any session-report/unit PDF URL saved in the DB
// (report_pdf_url, pdf_url, file_url, cover_url, upload_url, video_url,
// audio_url) could be opened by anyone with the link, forever, no login
// required. The fix is in two parts:
//   1. THIS FILE (frontend, deployed first) — every place that turns a
//      stored URL into something the browser actually fetches (an <a href>
//      opened in a new tab, an <img>/<iframe>/<video>/<audio> src) now asks
//      this helper for a short-lived SIGNED url instead of using the stored
//      string directly.
//   2. Making the buckets private in Supabase Storage (done AFTER this code
//      is live and confirmed — see auditoria_seguridad_2026-09-15.md,
//      "Ojo con el orden inverso"). Doing it in the other order breaks every
//      PDF/video/audio in the app immediately.
//
// Deliberately NOT migrating the stored strings themselves: they already
// contain the bucket + path, which is all `createSignedUrl` needs — no DB
// migration required, and this keeps working even for URLs entered by hand
// (e.g. someone pasted an external image/PDF link instead of uploading one,
// which several of these fields allow) since anything that isn't a
// recognized Storage URL is returned completely unchanged.
//
// NOTE ("lo que este enfoque NO cierra", per el hallazgo): this only stops
// the "any link, no login, forever" problem (2a). It does NOT stop an
// authenticated student from signing another student's object if they
// somehow learn its exact path (2b) — the `content_bucket_select` RLS
// policy still just checks `bucket_id='content'`, not ownership. Closing
// 2b needs an edge function that verifies the caller owns the object (or
// re-organizing paths to embed the student id and migrating the 28
// existing objects) — intentionally left for a separate batch.
import { supabase } from "@/integrations/supabase/client";

const SIGNABLE_BUCKETS = ["content", "materials", "challenge-evidence"] as const;
type SignableBucket = (typeof SIGNABLE_BUCKETS)[number];

// How long a signed URL stays valid. Long enough that opening a PDF/video
// and reading it for a while doesn't expire mid-view; short enough that a
// forwarded link (the original problem — these get emailed) goes stale the
// same day instead of working forever.
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
// Re-sign a bit before the cached URL actually expires, so a slow render
// never hands out a URL that dies moments later.
const CACHE_SAFETY_MARGIN_MS = 5 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

/** Extracts {bucket, path} from a Supabase public-Storage URL, for one of
 *  the buckets this app signs. Returns null for anything else — an external
 *  URL, a mock placeholder ("#", "/mock-report.pdf", "/demo/...pdf"), some
 *  other bucket — so the caller can fall back to using the original string
 *  untouched. */
function parseStorageUrl(url: string): { bucket: SignableBucket; path: string } | null {
  const marker = "/storage/v1/object/public/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length); // "<bucket>/<path...>"
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  const rawPath = rest.slice(slash + 1).split(/[?#]/)[0]; // drop any query/hash
  if (!rawPath) return null;
  if (!(SIGNABLE_BUCKETS as readonly string[]).includes(bucket)) return null;
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    path = rawPath;
  }
  return { bucket: bucket as SignableBucket, path };
}

async function fetchSignedUrl(bucket: SignableBucket, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[storage-signed-url] failed to sign", bucket, path, error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Resolves a stored `content`/`materials` public-Storage URL to a
 * short-lived signed URL, with an in-memory cache (shared across every
 * call site, keyed by bucket+path) so re-opening the same file doesn't
 * re-sign on every click. Anything that isn't a recognized content/
 * materials Storage URL — an external link, a mock/demo placeholder, an
 * empty string — is returned unchanged.
 *
 * Never throws: on any Storage error this falls back to the original
 * (public) URL, so the UI degrades the same way it already did for a dead
 * link instead of crashing. Once the bucket is switched to private, that
 * fallback will 403 in the browser exactly like a broken link used to —
 * safe, just not silent.
 */
export async function resolveContentUrl(url: string | null | undefined): Promise<string> {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return trimmed;
  const parsed = parseStorageUrl(trimmed);
  if (!parsed) return trimmed;

  // Evidence must not reuse another signed-in account's cached authorization.
  let accountScope = "";
  if (parsed.bucket === "challenge-evidence") {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return trimmed;
    accountScope = `${data.session.user.id}:`;
  }
  const key = `${accountScope}${parsed.bucket}/${parsed.path}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt - CACHE_SAFETY_MARGIN_MS > now) return cached.url;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchSignedUrl(parsed.bucket, parsed.path);
    inFlight.set(key, pending);
    pending.finally(() => inFlight.delete(key));
  }
  const signed = await pending;
  if (!signed) return trimmed;
  cache.set(key, { url: signed, expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000 });
  return signed;
}

/**
 * Click-handler helper for "open this file in a new tab" links (the
 * `<a href=… target="_blank">` pattern used everywhere for PDFs/videos).
 * Opens the tab synchronously (before the `await`) so browser popup
 * blockers still treat it as a direct response to the user's click, then
 * navigates it to the resolved signed URL once ready.
 */
export async function openSignedContentUrl(url: string | null | undefined): Promise<void> {
  const trimmed = (url ?? "").trim();
  if (!trimmed || typeof window === "undefined") return;
  const win = window.open("", "_blank");
  const resolved = await resolveContentUrl(trimmed);
  if (!resolved) {
    win?.close();
    return;
  }
  if (win) win.location.href = resolved;
  else window.open(resolved, "_blank");
}
