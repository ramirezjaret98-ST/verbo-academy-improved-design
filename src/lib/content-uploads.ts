// Shared file-upload helper for the "content" Storage bucket — used by every
// admin/teacher upload button that was previously a disabled stub (tailored
// unit files, VIP unit files, challenge/course/flash video attachments,
// listening-activity audio). One bucket, one helper, namespaced by folder —
// same pattern as materials-store.ts's uploadMaterialFile(), just shared
// across more call sites instead of duplicated per feature.
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "content";

export const MAX_CONTENT_FILE_BYTES = 100 * 1024 * 1024; // 100MB, matches the bucket's file_size_limit
export const MAX_CONTENT_FILE_ERROR = "File is too large — please upload a file under 100MB";

export function isContentFileTooLarge(file: { size: number }): boolean {
  return file.size > MAX_CONTENT_FILE_BYTES;
}

/** Uploads a real file to the shared `content` Storage bucket and returns its
 *  public URL. `folder` namespaces the storage path (e.g. "tailored-units",
 *  "vip-units", "challenge-video", "course-video", "flash-video",
 *  "activity-audio") — purely organizational, no effect on access rules. */
export async function uploadContentFile(
  file: File,
  folder: string,
): Promise<{ ok: true; url: string; fileName: string } | { ok: false; error: string }> {
  if (isContentFileTooLarge(file)) return { ok: false, error: MAX_CONTENT_FILE_ERROR };
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot) : "";
  const path = `${folder}/${crypto.randomUUID()}${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) {
    console.error("[content-uploads] failed to upload file", error);
    return { ok: false, error: "Upload failed — please try again." };
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, fileName: file.name };
}
