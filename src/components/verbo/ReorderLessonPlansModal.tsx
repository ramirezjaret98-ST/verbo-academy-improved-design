import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, RotateCcw } from "lucide-react";
import { AccentModalHeader, AccentModalFooter, GhostButton } from "@/components/verbo/ui";
import type { ExtSession } from "@/lib/sessions-store";
import {
  applyLessonPlanResequence,
  previewLessonPlanResequence,
  undoLessonPlanResequence,
  type LessonPlan,
  type LessonPlanResequencePreview,
} from "@/lib/lesson-plans-store";
import { notifyError, notifySuccess } from "@/lib/notify";

const eligible = (s: ExtSession) =>
  +new Date(s.date_time) > Date.now() &&
  !s.group_id && !s.workshop_cohort_id &&
  (!s.origin || s.origin === "course") &&
  ["scheduled", "ready", "rescheduled", "rearranged", "delayed"].includes(s.status) &&
  !s.report_submitted_at && !s.report_locked &&
  !s.student_connected_at && !s.teacher_connected_at;

const dateLabel = (iso: string) => new Date(iso).toLocaleString("en-US", {
  timeZone: "America/Mexico_City", weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
});

export function ReorderLessonPlansModal({ source, sessions, plans, onClose }: {
  source: ExtSession;
  sessions: ExtSession[];
  plans: Record<string, LessonPlan>;
  onClose: () => void;
}) {
  const candidates = useMemo(() => sessions
    .filter((s) => s.id !== source.id && s.student_id === source.student_id &&
      s.teacher_id === source.teacher_id && eligible(s) && !!plans[s.id] &&
      Math.abs(+new Date(s.date_time) - +new Date(source.date_time)) <= 30 * 24 * 60 * 60_000)
    .sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time)),
  [sessions, source, plans]);
  const [targetId, setTargetId] = useState(() => candidates.filter((s) => s.date_time < source.date_time).at(-1)?.id ?? candidates[0]?.id ?? "");
  const [preview, setPreview] = useState<LessonPlanResequencePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!targetId || eventId) return;
    let active = true;
    setPreview(null);
    setError("");
    setLoading(true);
    void previewLessonPlanResequence(source.id, targetId)
      .then((result) => { if (active) setPreview(result); })
      .catch(() => { if (active) setError("This sequence is unavailable. Check that all sessions are still future and planned."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [source.id, targetId, eventId, retryKey]);

  const apply = async () => {
    if (!preview || !targetId || saving) return;
    setSaving(true);
    try {
      const result = await applyLessonPlanResequence(source.id, targetId, preview.snapshot);
      setEventId(result.event_id ?? null);
      setPreview(null);
      notifySuccess("Lesson plans reordered. Session dates and credits stayed the same.");
    } catch (cause) {
      setPreview(null);
      setError("The plans or dates may have changed. Select the destination again to refresh the preview.");
      notifyError(cause, { context: "Reordering lesson plans" });
    } finally {
      setSaving(false);
    }
  };

  const undo = async () => {
    if (!eventId || saving) return;
    setSaving(true);
    try {
      await undoLessonPlanResequence(eventId);
      setEventId(null);
      notifySuccess("The previous lesson plan order was restored.");
      onClose();
    } catch (cause) {
      notifyError(cause, { context: "Restoring lesson plans" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="verbo-overlay-in fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div role="dialog" aria-modal="true" aria-label="Reorder lesson plans" className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-floating">
        <AccentModalHeader background="#01304a" iconTint="#01304a" icon={ArrowRightLeft}
          eyebrow="Lesson Planning" title="Reorder lesson plans" onClose={onClose} />
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6">
          <p className="text-sm text-muted-foreground">
            Choose where this plan should go. Academy will rotate the plans in between, preserving every plan and its original preparation date. Session times, attendance and credits will not change.
          </p>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
            <span className="font-semibold">Current plan:</span> {plans[source.id]?.title ?? "—"} · {dateLabel(source.date_time)}
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">There are no other future plans for this student and teacher to reorder.</p>
          ) : !eventId && (
            <div>
              <label htmlFor="plan-resequence-target" className="text-sm font-semibold">Place this plan in</label>
              <select id="plan-resequence-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>{dateLabel(s.date_time)} · {plans[s.id]?.title}</option>
                ))}
              </select>
            </div>
          )}
          {loading && <p role="status" className="text-sm text-muted-foreground">Checking the current plans…</p>}
          {error && !eventId && (
            <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
              <span>{error}</span>
              <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="shrink-0 underline">Refresh preview</button>
            </div>
          )}
          {preview && !eventId && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Before → After</h3>
              {preview.moves.map((move) => (
                <div key={move.session_id} className="grid gap-1 rounded-lg border border-border p-3 text-sm sm:grid-cols-[130px_1fr]">
                  <span className="font-medium">{dateLabel(move.date_time)}</span>
                  <span>{move.before_title} <span aria-hidden="true">→</span> <strong>{move.after_title}</strong></span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Previously unlocked student materials stay available. This action does not send a new lesson-ready email.</p>
            </div>
          )}
          {eventId && <p role="status" className="text-sm text-emerald-700">The plans were reordered. You can undo this now if no affected session or plan has changed.</p>}
        </div>
        <AccentModalFooter>
          {eventId && <GhostButton onClick={undo} disabled={saving}><RotateCcw className="mr-1 h-4 w-4" /> Undo</GhostButton>}
          <GhostButton onClick={onClose}>Close</GhostButton>
          {!eventId && <button type="button" disabled={!preview || loading || saving} onClick={apply}
            className="rounded-lg bg-[#f38934] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "Saving…" : `Confirm ${preview?.moves.length ?? 0} plans`}
          </button>}
        </AccentModalFooter>
      </div>
    </div>
  );
}
