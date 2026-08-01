import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Info, Clock, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card, GhostButton, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import { ConfirmAvailabilityModal } from "@/components/verbo/ConfirmAvailabilityModal";
import {
  DAY_KEYS, DAY_LABELS, MIN_MINUTES, MAX_MINUTES,
  emptyWeekly, getAvailability, saveAvailability,
  hasPendingRequest, submitChangeRequest, subscribeAvailability,
  minutesToTime, timeToMinutes,
  type DayKey, type Weekly,
} from "@/lib/availability-store";

export const Route = createFileRoute("/teacher/availability")({
  head: () => ({
    meta: [
      { title: "My Availability — Teacher" },
      { name: "description", content: "Set the weekly hours you're available to teach." },
    ],
  }),
  component: AvailabilityPage,
});

function AvailabilityPage() {
  const { user } = useAuth();
  const teacherId = user?.id ?? "";
  const [, tick] = useState(0);
  useEffect(() => subscribeAvailability(() => tick((n) => n + 1)), []);

  const stored = useMemo(() => getAvailability(teacherId), [teacherId]);
  const [weekly, setWeekly] = useState<Weekly>(() => stored.weekly ?? emptyWeekly());
  const [pending, setPending] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    setWeekly(getAvailability(teacherId).weekly);
    setPending(hasPendingRequest(teacherId));
  }, [teacherId]);

  const alreadyConfirmed = !!stored.confirmedAt;

  const addBlock = (day: DayKey) => {
    setWeekly((w) => {
      const existing = w[day];
      const last = existing[existing.length - 1];
      const startMin = last ? Math.min(MAX_MINUTES - 60, last.endMin + 30) : MIN_MINUTES;
      const endMin = Math.min(MAX_MINUTES, startMin + 60);
      return { ...w, [day]: [...existing, { startMin, endMin }] };
    });
  };
  const removeBlock = (day: DayKey, idx: number) => {
    setWeekly((w) => ({ ...w, [day]: w[day].filter((_, i) => i !== idx) }));
  };
  const updateBlock = (day: DayKey, idx: number, patch: Partial<{ startMin: number; endMin: number }>) => {
    setWeekly((w) => ({
      ...w,
      [day]: w[day].map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  };

  const validateWeekly = (): string | null => {
    for (const d of DAY_KEYS) {
      for (const b of weekly[d]) {
        if (b.startMin < MIN_MINUTES || b.endMin > MAX_MINUTES) return `${DAY_LABELS[d]}: time must be between 07:00 and 22:00.`;
        if (b.endMin <= b.startMin) return `${DAY_LABELS[d]}: end must be after start.`;
      }
    }
    return null;
  };

  const onSaveClick = () => {
    const err = validateWeekly();
    if (err) { setSavedFlash(err); return; }
    setConfirmOpen(true);
  };
  const confirmSave = () => {
    saveAvailability(teacherId, weekly);
    setConfirmOpen(false);
    setSavedFlash("Availability saved.");
  };

  const submitChange = () => {
    const err = validateWeekly();
    if (err) { setSavedFlash(err); return; }
    const req = submitChangeRequest(teacherId, weekly, changeReason.trim() || undefined);
    if (req) {
      setPending(true);
      setChangeOpen(false);
      setChangeReason("");
      setSavedFlash("Change request sent to Admin.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Availability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set your weekly teaching hours between 7:00 AM and 10:00 PM.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> All times shown in Mexico City time (GMT-6).
        </div>
      </div>

      <Card>
        <SectionTitle>Weekly Schedule</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DAY_KEYS.map((day) => (
            <div key={day} className="rounded-xl border border-border bg-secondary/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">{DAY_LABELS[day]}</div>
                <button
                  onClick={() => addBlock(day)}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
                >
                  <Plus className="h-3 w-3" /> Add Time Block
                </button>
              </div>
              {weekly[day].length === 0 && (
                <div className="text-xs text-muted-foreground">Not available</div>
              )}
              <div className="space-y-2">
                {weekly[day].map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      min="07:00"
                      max="22:00"
                      value={minutesToTime(b.startMin)}
                      onChange={(e) => updateBlock(day, i, { startMin: timeToMinutes(e.target.value) })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">–</span>
                    <input
                      type="time"
                      min="07:00"
                      max="22:00"
                      value={minutesToTime(b.endMin)}
                      onChange={(e) => updateBlock(day, i, { endMin: timeToMinutes(e.target.value) })}
                      className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => removeBlock(day, i)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-4 text-xs text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>
            Your availability is used both for new assignments and for reschedules/substitutions. By setting these hours, you're confirming you're able and willing to work during them — declining a covered session without a valid reason may affect your standing.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">
            Your schedule cannot be changed without prior Admin approval.
          </p>
          <div className="flex items-center gap-2">
            {pending ? (
              <span className="text-xs italic text-muted-foreground">Request pending admin review.</span>
            ) : (
              alreadyConfirmed && (
                <GhostButton onClick={() => setChangeOpen(true)}>
                  <Send className="h-3.5 w-3.5" /> Request Change
                </GhostButton>
              )
            )}
            {!alreadyConfirmed && (
              <PrimaryButton onClick={onSaveClick}>Save Availability</PrimaryButton>
            )}
          </div>
        </div>

        {savedFlash && (
          <div className="mt-3 text-xs text-muted-foreground">{savedFlash}</div>
        )}
      </Card>

      {confirmOpen && (
        <ConfirmAvailabilityModal onCancel={() => setConfirmOpen(false)} onConfirm={confirmSave} />
      )}

      {changeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-card p-6 shadow-floating">
            <h3 className="text-base font-semibold text-foreground">Request Change</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Your current edits above will be sent as the proposed schedule.
            </p>
            <label className="mt-4 block text-xs font-medium text-foreground">Reason (optional)</label>
            <textarea
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="Briefly explain why you need to change your schedule…"
            />
            <div className="mt-5 flex justify-end gap-2">
              <GhostButton onClick={() => setChangeOpen(false)}>Cancel</GhostButton>
              <PrimaryButton onClick={submitChange}>Submit Request</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}