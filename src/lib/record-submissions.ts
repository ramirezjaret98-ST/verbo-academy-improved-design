import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid } from "@/lib/user-id-bridge";

const BUCKET = "record-yourself";
export const MAX_RECORD_BYTES = 10 * 1024 * 1024;

export type RecordSubmission = {
  id: string;
  student_id: string;
  activity_id: number;
  audio_path: string;
  reflection: string;
  duration_seconds: number;
  created_at: string;
};

export async function submitRecordPractice(input: {
  studentId: string;
  activityId: string;
  audio: Blob;
  durationSeconds: number;
  reflection: string;
}): Promise<void> {
  const reflection = input.reflection.trim();
  if (reflection.length < 10 || reflection.length > 1000)
    throw new Error("Write at least 10 characters about what you would improve.");
  if (input.durationSeconds < 2 || input.durationSeconds > 90)
    throw new Error("Record between 2 and 90 seconds.");
  if (!input.audio.size || input.audio.size > MAX_RECORD_BYTES)
    throw new Error("The recording must be smaller than 10 MB. Please try again.");
  const format = input.audio.type.startsWith("audio/mp4")
    ? "mp4"
    : input.audio.type.startsWith("audio/ogg")
      ? "ogg"
      : input.audio.type.startsWith("audio/webm")
        ? "webm"
        : null;
  if (!format) throw new Error("This audio format isn't supported. Try another browser.");

  const [{ data, error: authError }, studentUuid] = await Promise.all([
    supabase.auth.getUser(),
    legacyToUuid(input.studentId),
  ]);
  if (authError || !data.user || !studentUuid || data.user.id !== studentUuid) {
    throw new Error("Please sign in again before submitting your recording.");
  }
  const path = `${studentUuid}/${crypto.randomUUID()}.${format}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, input.audio, {
    contentType: `audio/${format}`,
    upsert: false,
  });
  if (uploadError) throw new Error("Your recording couldn't be uploaded. Please try again.");

  const { error: insertError } = await supabase.from("record_submissions").insert({
    student_id: studentUuid,
    activity_id: Number(input.activityId),
    audio_path: path,
    reflection,
    duration_seconds: input.durationSeconds,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error("Your recording wasn't saved. Please try again.");
  }
}

export async function loadRecordSubmissions(
  studentId: string,
  activityId?: string,
): Promise<RecordSubmission[]> {
  const studentUuid = await legacyToUuid(studentId);
  if (!studentUuid) return [];
  let query = supabase
    .from("record_submissions")
    .select("*")
    .eq("student_id", studentUuid)
    .order("created_at", { ascending: false })
    .limit(30);
  if (activityId) query = query.eq("activity_id", Number(activityId));
  const { data, error } = await query;
  if (error) throw new Error("Recordings couldn't be loaded right now.");
  return data ?? [];
}

export async function signedRecordUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) throw new Error("The recording couldn't be opened right now.");
  return data.signedUrl;
}
