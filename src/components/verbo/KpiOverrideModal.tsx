// KPI Manual Override modal — used by super_admin and coordinator_ops from
// Admin > KPIs to retroactively correct a single (teacher, month, metric)
// KPI value when a real-world signal was unfair. Requires a justification;
// optionally accepts evidence; the admin's own name is auto-filled as an
// unchangeable signature and the disclaimer makes the accountability explicit.
import { useMemo, useState } from "react";
import { X, ShieldAlert } from "lucide-react";
import type { User } from "@/lib/mock-data";
import { AccentModal, AccentModalFooter } from "./ui";

import {
  KPI_METRIC_LABELS,
  addKpiOverride,
  type KpiMetric,
  type KpiOverrideAdminType,
} from "@/lib/teacher-kpi-overrides-store";
import { monthKeyOf, addMonthKey, monthLabel } from "@/lib/teacher-kpi-history-store";

interface Props {
  teacher: User;
  metric: KpiMetric;
  currentValue: number;
  admin: { id: string; name: string; admin_type: KpiOverrideAdminType | null };
  onClose: () => void;
  onSaved?: () => void;
}

export function KpiOverrideModal({ teacher, metric, currentValue, admin, onClose, onSaved }: Props) {
  const nowKey = monthKeyOf(new Date());
  const [monthKey, setMonthKey] = useState(nowKey);
  const [newValue, setNewValue] = useState<string>(String(currentValue));
  const [justification, setJustification] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Month options — the last 12 including current, so a retroactive fix can
  // reach any month currently visible in the bonus-streak window.
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const k = addMonthKey(nowKey, -i);
      return { key: k, label: monthLabel(k) };
    });
  }, [nowKey]);

  const isStreak = metric === "bonusStreak";
  const maxValue = isStreak ? 6 : 100;
  const parsedValue = Number(newValue);
  const validValue = Number.isFinite(parsedValue) && parsedValue >= 0 && parsedValue <= maxValue;
  const canSave = validValue && justification.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const result = addKpiOverride({
      teacher_id: teacher.id,
      month_key: monthKey,
      metric,
      previous_value: Math.round(currentValue),
      new_value: Math.round(parsedValue),
      justification: justification.trim(),
      evidence_name: evidence?.name,
      admin_id: admin.id,
      admin_name: admin.name,
      admin_type: admin.admin_type ?? undefined,
    });
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    onSaved?.();
    onClose();
  };

  return (
    <AccentModal
      background="linear-gradient(135deg, #01304a 0%, #02466b 100%)"
      iconTint="#ffffff"
      icon={ShieldAlert}
      eyebrow="Manual KPI adjustment"
      title={`${teacher.name} · ${KPI_METRIC_LABELS[metric]}`}
      watermark={{ type: "icon", icon: ShieldAlert }}
      maxWidth="max-w-lg"
      onClose={onClose}
    >


        <div className="space-y-4 px-6 py-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Month affected</label>
              <select
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {monthOptions.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}{m.key === nowKey ? " (current)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current value</label>
              <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-semibold text-foreground">
                {isStreak ? `${Math.round(currentValue)}/6` : `${Math.round(currentValue)}%`}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isStreak ? "New streak (0–6)" : "New value (0–100)"}
            </label>
            <input
              type="number"
              min={0}
              max={maxValue}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {!validValue && newValue !== "" && (
              <p className="mt-1 text-[11px] text-destructive">Enter a number between 0 and {maxValue}.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Justification <span className="text-destructive">*</span>
            </label>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Explain why this adjustment is fair and necessary."
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Evidence (optional) <span className="text-muted-foreground/70">— Strongly recommended</span>
            </label>
            <input
              type="file"
              onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-lg border border-dashed border-input bg-background px-3 py-2 text-xs text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-foreground hover:file:bg-secondary/80"
            />
            {evidence && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">Selected: {evidence.name}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Signature</label>
            <input
              type="text"
              value={admin.name}
              readOnly
              className="w-full cursor-not-allowed rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-semibold text-foreground"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              By saving this change, <strong>{admin.name}</strong> takes full responsibility for this
              manual KPI adjustment and its impact on the teacher&apos;s bonus eligibility. This action
              is permanently logged.
            </span>
          </div>
        </div>

        {saveError && (
          <div className="border-t border-destructive/30 bg-destructive/10 px-6 py-3 text-[12px] font-medium text-destructive">
            {saveError}
          </div>
        )}

      <AccentModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save adjustment
        </button>
      </AccentModalFooter>
    </AccentModal>

  );
}
