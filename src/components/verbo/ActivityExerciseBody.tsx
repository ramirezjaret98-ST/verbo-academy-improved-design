import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { VerboAudioPlayer } from "@/components/verbo/VerboAudioPlayer";
import { ActivityInteractions } from "@/components/verbo/ActivityInteractions";
import type { PracticeStatus } from "@/lib/activity-experience";
import type { Activity } from "@/lib/activities-store";
import {
  loadRecordSubmissions,
  signedRecordUrl,
  submitRecordPractice,
  MAX_RECORD_BYTES,
} from "@/lib/record-submissions";
export function ActivityExerciseBody({
  activity,
  value,
  onChange,
  disabled,
  studentId,
  previewMode,
  onRecordSubmitted,
  status,
}: {
  activity: Activity;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  studentId: string;
  previewMode: boolean;
  onRecordSubmitted: () => void;
  status?: PracticeStatus;
}) {
  const inputCls =
    "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";

  if (activity.type === "fill_gaps" || activity.type === "read_complete") {
    const parts = (activity.paragraph ?? "").split(/\[blank\]|_{2,}/);
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-secondary/50 p-5 text-base leading-relaxed text-foreground">
          {parts.map((p, i) => (
            <span key={i}>
              {p}
              {i < parts.length - 1 && (
                <span className="mx-1 inline-block min-w-[80px] border-b-2 border-accent" />
              )}
            </span>
          ))}
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Type your answer"
          className={inputCls}
          autoFocus
        />
      </div>
    );
  }

  if (activity.type === "read_select" || activity.type === "listen_select") {
    return (
      <div className="space-y-4">
        {activity.type === "listen_select" ? (
          <VerboAudioPlayer
            durationSec={activity.audioDurationSec}
            audioUrl={activity.audioUrl}
            disabled={disabled}
          />
        ) : activity.prompt ? (
          <div className="rounded-xl bg-secondary/50 p-5 text-sm leading-relaxed text-foreground">
            {activity.prompt}
          </div>
        ) : null}
        <div className="text-sm font-semibold text-foreground">{activity.question}</div>
        <div className="space-y-2">
          {activity.options?.filter(Boolean).map((opt, i) => (
            <label
              key={i}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${value === String(i) ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"} ${disabled ? "opacity-70" : ""}`}
            >
              <input
                type="radio"
                name={activity.id}
                checked={value === String(i)}
                onChange={() => onChange(String(i))}
                disabled={disabled}
                className="h-4 w-4 accent-[#f38934]"
              />
              <span className="text-xs font-semibold text-muted-foreground">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-sm text-foreground">{opt}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (activity.type === "drag_drop" || activity.type === "match") {
    return (
      <ActivityInteractions
        items={activity.items ?? []}
        value={value}
        onChange={onChange}
        disabled={disabled}
        ordering={activity.type === "drag_drop" ? undefined : false}
        status={status}
      />
    );
  }

  if (activity.type === "record") {
    return (
      <RecordExercise
        sentence={activity.answer ?? ""}
        activityId={activity.id}
        studentId={studentId}
        disabled={disabled}
        previewMode={previewMode}
        onSubmitted={onRecordSubmitted}
      />
    );
  }

  return null;
}

function RecordExercise({
  sentence,
  activityId,
  studentId,
  disabled,
  previewMode,
  onSubmitted,
}: {
  sentence: string;
  activityId: string;
  studentId: string;
  disabled?: boolean;
  previewMode: boolean;
  onSubmitted: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [previous, setPrevious] = useState<{ url: string; reflection: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const limit = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    if (!disabled || previewMode) return;
    let live = true;
    void (async () => {
      try {
        const rows = await loadRecordSubmissions(studentId, activityId);
        if (!rows[0]) return;
        const url = await signedRecordUrl(rows[0].audio_path);
        if (live) setPrevious({ url, reflection: rows[0].reflection });
      } catch {
        if (live) setError("Your previous recording couldn't be opened right now.");
      }
    })();
    return () => {
      live = false;
    };
  }, [activityId, studentId, disabled, previewMode]);

  useEffect(() => {
    if (!audio) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audio);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) window.clearInterval(timer.current);
      if (limit.current !== null) window.clearTimeout(limit.current);
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (timer.current !== null) window.clearInterval(timer.current);
    if (limit.current !== null) window.clearTimeout(limit.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  };

  const start = async () => {
    if (requesting) return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(
        "This browser can't record audio here. Try an updated browser with microphone access.",
      );
      return;
    }
    setRequesting(true);
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = microphone;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("unsupported");
      const next = new MediaRecorder(microphone, { mimeType });
      recorder.current = next;
      chunks.current = [];
      setAudio(null);
      setElapsed(0);
      next.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      next.onstop = () => {
        setRecording(false);
        if (timer.current !== null) window.clearInterval(timer.current);
        if (limit.current !== null) window.clearTimeout(limit.current);
        microphoneCleanup();
        const seconds = Math.ceil((Date.now() - startedAt.current) / 1000);
        const blob = new Blob(chunks.current, { type: mimeType });
        setDurationSeconds(seconds);
        if (seconds < 2 || !blob.size) setError("Record at least 2 seconds, then try again.");
        else if (blob.size > MAX_RECORD_BYTES)
          setError("That recording is over 10 MB. Please try a shorter one.");
        else setAudio(blob);
      };
      startedAt.current = Date.now();
      next.start();
      setRecording(true);
      timer.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
        1000,
      );
      limit.current = window.setTimeout(stop, 90_000);
    } catch {
      microphoneCleanup();
      if (alive.current)
        setError("Microphone access failed. Check your browser permission and try again.");
    } finally {
      if (alive.current) setRequesting(false);
    }
  };

  const microphoneCleanup = () => stream.current?.getTracks().forEach((track) => track.stop());

  const submit = async () => {
    if (!audio || saving) return;
    setSaving(true);
    setError("");
    try {
      await submitRecordPractice({ studentId, activityId, audio, durationSeconds, reflection });
      onSubmitted();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Your recording wasn't saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-secondary/50 p-5 text-base leading-relaxed text-foreground">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Say this out loud
        </span>
        <div className="mt-2 font-medium">"{sentence}"</div>
      </div>
      {disabled ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-5">
          <p className="text-sm font-medium">Recording practice</p>
          {previous ? (
            <>
              <audio controls src={previous.url} className="w-full" />
              <p className="text-sm text-muted-foreground">
                Your reflection: {previous.reflection}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No submitted audio is available for this activity.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-background p-5">
            <button
              type="button"
              onClick={
                recording
                  ? stop
                  : () => {
                      void start();
                    }
              }
              disabled={saving || requesting}
              aria-label={recording ? "Stop recording" : "Start recording"}
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white shadow-lg disabled:opacity-60 ${recording ? "animate-pulse bg-rose-600" : "bg-accent"}`}
            >
              <Mic className="h-6 w-6" />
            </button>
            <div className="text-sm text-foreground">
              {requesting
                ? "Waiting for microphone access…"
                : recording
                  ? `Recording… ${elapsed}s / 90s. Tap to stop.`
                  : audio
                    ? "Recording ready. Listen before submitting or record again."
                    : "Tap to record. You can try again before submitting."}
            </div>
          </div>
          {audioUrl && <audio controls src={audioUrl} className="w-full" />}
          {audio && (
            <label className="block text-sm font-medium text-foreground">
              What would you improve in your next attempt?
              <textarea
                value={reflection}
                onChange={(event) => setReflection(event.target.value)}
                maxLength={1000}
                rows={3}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"
                placeholder="For example: I want to speak more clearly and pause less."
              />
            </label>
          )}
          {audio && (
            <p className="text-xs text-muted-foreground">
              This is speaking practice, not an automatic pronunciation grade. You can continue once
              it is saved.
            </p>
          )}
          {previewMode ? (
            <p className="text-xs text-muted-foreground">
              Preview only — this recording will not be saved.
            </p>
          ) : (
            audio && (
              <button
                type="button"
                onClick={() => {
                  void submit();
                }}
                disabled={saving || reflection.trim().length < 10}
                className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {saving ? "Saving recording…" : "Submit recording"}
              </button>
            )
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function evaluateActivity(activity: Activity, value: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  if (activity.type === "fill_gaps" || activity.type === "read_complete")
    return norm(value) === norm(activity.answer ?? "");
  if (activity.type === "read_select" || activity.type === "listen_select")
    return Number(value) === activity.correctIndex;
  if (activity.type === "record") return false;
  if (activity.type === "drag_drop" || activity.type === "match") {
    try {
      const map = JSON.parse(value || "{}") as Record<string, string>;
      return (activity.items ?? []).every((it) => norm(map[it.text] ?? "") === norm(it.key));
    } catch {
      return false;
    }
  }
  return false;
}
