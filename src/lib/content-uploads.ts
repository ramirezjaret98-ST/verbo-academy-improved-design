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
  // Every path is a fresh random UUID (never reused/overwritten), so the
  // file at this path is immutable — safe to cache for a full year both at
  // the CDN edge and in the browser. Without this, Supabase's default
  // (cacheControl: "3600" = 1 hour) meant every unit PDF was re-fetched in
  // full from origin on almost every open, which is what blew up Storage
  // egress (see egress investigation, 2026-09-09: a handful of 2-4.5MB unit
  // PDFs being re-downloaded repeatedly accounted for several GB/day).
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    console.error("[content-uploads] failed to upload file", error);
    return { ok: false, error: "Upload failed — please try again." };
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, fileName: file.name };
}

// Segundo bucket, separado de "content" a propósito: avatares, íconos de
// badges/challenges y cualquier otra imagen "decorativa" de bajo riesgo que
// se muestra en <img> por toda la app. Antes esto se guardaba como base64
// directo en columnas de texto (app_users.avatar_url, badge_defs.image_url,
// challenges.icon_image_url) — cada select=* sobre esas tablas viajaba con
// las imágenes completas incrustadas en el JSON, y eso fue lo que disparó el
// egress de PostgREST a ~900MB/día (auditoría 2026-09-16). "public-assets" SÍ
// es un bucket público (a diferencia de "content"): estas imágenes no son
// sensibles y se muestran con mucha frecuencia, así que conviene que el
// navegador las cachee por URL en vez de repetir un viaje de firma de URL
// cada vez.
const PUBLIC_BUCKET = "public-assets";
export const MAX_PUBLIC_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB
export const MAX_PUBLIC_IMAGE_ERROR = "Image is too large — please upload a file under 2MB";

/** Sube una imagen al bucket público, en una ruta ESTABLE por entidad
 *  (`${folder}/${id}.${ext}`, upsert:true) — a diferencia de
 *  `uploadContentFile()` (ruta con UUID aleatorio, nunca se sobreescribe),
 *  aquí SÍ se espera reemplazar la imagen de la misma entidad con el tiempo
 *  (cambiar de avatar, editar el ícono de un badge), así que no se usa cache
 *  inmutable de un año — se deja el cacheControl por default de Supabase. */
export async function uploadPublicImage(
  file: File | Blob,
  folder: string,
  id: string | number,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (file.size > MAX_PUBLIC_IMAGE_BYTES) return { ok: false, error: MAX_PUBLIC_IMAGE_ERROR };
  const mime = file.type || "image/png";
  const ext = mime.split("/")[1]?.split("+")[0] || "png";
  const path = `${folder}/${id}.${ext}`;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: true,
  });
  if (error) {
    console.error("[content-uploads] failed to upload public image", error);
    return { ok: false, error: "Upload failed — please try again." };
  }
  const { data } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path);
  // Cache-busting: la ruta es estable (mismo nombre si se reemplaza la
  // imagen), así que sin esto el navegador podría seguir sirviendo la copia
  // vieja desde caché tras un re-upload.
  return { ok: true, url: `${data.publicUrl}?v=${Date.now()}` };
}
