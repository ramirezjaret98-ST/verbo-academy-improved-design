import { supabase } from "@/integrations/supabase/client";

const COVER_BUCKET = "public-assets";
const MATERIAL_BUCKET = "materials";
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
const PRIVATE_PREFIX = "storage://materials/";

export type ClubMediaKind = "cover" | "material";
export type UploadedClubMedia = { url: string; bucket: string; path: string };

export function validateClubFile(file: File, kind: ClubMediaKind): string | null {
  const allowed = kind === "cover" ? ["image/jpeg", "image/png", "image/webp"] : ["application/pdf"];
  const max = kind === "cover" ? MAX_COVER_BYTES : MAX_MATERIAL_BYTES;
  if (!file.size) return "The selected file is empty.";
  if (!allowed.includes(file.type)) return kind === "cover" ? "Choose a JPG, PNG or WebP image." : "Choose a PDF file.";
  if (file.size > max) return kind === "cover" ? "The image must be under 8 MB." : "The PDF must be under 20 MB.";
  return null;
}

export async function uploadClubFile(file: File, kind: ClubMediaKind): Promise<UploadedClubMedia> {
  const problem = validateClubFile(file, kind);
  if (problem) throw new Error(problem);
  const bucket = kind === "cover" ? COVER_BUCKET : MATERIAL_BUCKET;
  const folder = kind === "cover" ? "club-covers" : "club-materials";
  const extension = kind === "cover" ? (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg") : "pdf";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`Could not upload ${kind === "cover" ? "the cover" : "the PDF"}. Please retry.`);
  const url = kind === "cover"
    ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
    : `${PRIVATE_PREFIX}${path}`;
  return { url, bucket, path };
}

export async function removeUploadedClubFiles(files: UploadedClubMedia[]): Promise<void> {
  await Promise.all(files.map(async ({ bucket, path }) => {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) console.error("[club-media] cleanup failed", error);
  }));
}

export async function openClubMaterial(material: string): Promise<void> {
  if (!material.startsWith(PRIVATE_PREFIX)) {
    window.open(material, "_blank", "noopener,noreferrer");
    return;
  }
  const tab = window.open("", "_blank");
  const path = material.slice(PRIVATE_PREFIX.length);
  const { data, error } = await supabase.storage.from(MATERIAL_BUCKET).createSignedUrl(path, 60 * 5);
  if (error || !data?.signedUrl) { tab?.close(); throw new Error("Could not open the PDF. Please retry."); }
  if (tab) { tab.opener = null; tab.location.href = data.signedUrl; }
  else window.location.href = data.signedUrl;
}
