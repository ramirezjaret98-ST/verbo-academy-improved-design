import { supabase } from "@/integrations/supabase/client";

export const CHALLENGE_EVIDENCE_BUCKET = "challenge-evidence";
export const MAX_CHALLENGE_EVIDENCE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
};
export const CHALLENGE_EVIDENCE_ACCEPT = Object.keys(FILE_TYPES).map(ext => `.${ext}`).join(",");

export function validateChallengeEvidence(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return "This file is empty. Choose another file.";
  if (file.size > MAX_CHALLENGE_EVIDENCE_BYTES) return "Choose a file under 10 MB.";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const expectedType = FILE_TYPES[extension];
  if (!expectedType || (file.type && file.type !== expectedType)) {
    return "Choose a PDF, image (JPG, PNG, WebP, GIF), or video (MP4, WebM, MOV).";
  }
  return null;
}

/** Files stay private; this permanent locator is signed only when opened. */
export async function uploadChallengeEvidence(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const validationError = validateChallengeEvidence(file);
  if (validationError) return { ok: false, error: validationError };
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !data.session) return { ok: false, error: "Please sign in again before uploading your work." };
  const extension = file.name.split(".").pop()!.toLowerCase();
  const objectPath = `${data.session.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(CHALLENGE_EVIDENCE_BUCKET).upload(objectPath, file, {
    contentType: FILE_TYPES[extension], upsert: false, cacheControl: "3600",
  });
  if (error) {
    console.error("[challenge-evidence] upload failed", { status: error.statusCode });
    return { ok: false, error: "Your file couldn't be uploaded. Please try again." };
  }
  const { data: locator } = supabase.storage.from(CHALLENGE_EVIDENCE_BUCKET).getPublicUrl(objectPath);
  return { ok: true, url: locator.publicUrl };
}
