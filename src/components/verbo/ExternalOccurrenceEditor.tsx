import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { academyDateTime } from "@/lib/academy-time";
import {
  saveExternalOverride,
  restoreExternalOverride,
  type ExternalOccurrence,
  type ExternalBlock,
} from "@/lib/external-schedule-store";
import { AccentModal, GhostButton, PrimaryButton } from "./ui";

const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export function ExternalOccurrenceEditor({
  occurrence,
  series,
  onClose,
}: {
  occurrence: ExternalOccurrence;
  series?: ExternalBlock;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const editable = user?.role === "admin" && user.admin_type === "super_admin";
  const local = academyDateTime(occurrence.date_time);
  const endLocal = academyDateTime(
    new Date(+new Date(occurrence.date_time) + occurrence.duration_minutes * 60_000).toISOString(),
  );
  const [originalDate, setOriginalDate] = useState(occurrence.originalDate);
  const [date, setDate] = useState(local.slice(0, 10));
  const [start, setStart] = useState(local.slice(11, 16));
  const [end, setEnd] = useState(endLocal.slice(11, 16));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [busy, onClose]);
  const close = () => {
    if (!busy) onClose();
  };
  const save = async (action: "move" | "release" | "restore") => {
    if (busy || !editable) return;
    setError("");
    const endMinutes = end === "00:00" ? 1440 : toMinutes(end);
    if (
      !originalDate ||
      (action === "move" && (!date || !start || !end || toMinutes(start) >= endMinutes))
    ) {
      setError("Elige una fecha y una hora de fin posterior al inicio.");
      return;
    }
    setBusy(true);
    try {
      if (action === "restore") await restoreExternalOverride(occurrence.blockId, originalDate);
      else
        await saveExternalOverride({
          block_id: occurrence.blockId,
          on_date: originalDate,
          cancelled: action === "release",
          replacement_date: action === "release" ? null : date,
          start_min: action === "release" ? null : toMinutes(start),
          end_min: action === "release" ? null : endMinutes,
        });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccentModal
      background="#7c3aed"
      iconTint="#6d28d9"
      icon={MapPin}
      eyebrow="P · Presencial"
      title={occurrence.label}
      onClose={close}
      maxWidth="max-w-lg"
      zClass="z-[80]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Presencial: ${occurrence.label}`}
        className="space-y-4 p-5"
      >
        <p className="text-sm text-muted-foreground">
          Horario reservado para una clase presencial. No requiere reporte ni registro de asistencia
          en Academy.
        </p>
        {!editable ? (
          <p className="font-medium">
            {local.slice(0, 10)} · {local.slice(11)}–{endLocal.slice(11)} (Ciudad de México)
          </p>
        ) : (
          <>
            <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
              El cambio afecta solo esta fecha. Las demás semanas conservan su horario habitual.
            </p>
            {series && (
              <label className="block text-sm">
                Fecha original de la clase
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2"
                  min={series.start_date}
                  max={series.end_date}
                  value={originalDate}
                  disabled={busy}
                  onChange={(e) => {
                    setOriginalDate(e.target.value);
                    setDate(e.target.value);
                  }}
                />
              </label>
            )}
            {!series && (
              <p className="text-sm">
                Fecha original: <strong>{originalDate}</strong>
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Nueva fecha
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2"
                  value={date}
                  disabled={busy}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Inicio
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2"
                  value={start}
                  disabled={busy}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Fin
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-input bg-background p-2"
                  value={end}
                  disabled={busy}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Todos los horarios usan Ciudad de México. Al mover o liberar esta fecha, el horario
              original queda disponible.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                disabled={busy}
                onClick={() => {
                  void save("move");
                }}
              >
                Guardar solo esta fecha
              </PrimaryButton>
              <GhostButton
                disabled={busy}
                onClick={() => {
                  void save("release");
                }}
              >
                Liberar esta fecha
              </GhostButton>
              {occurrence.modified && !series && (
                <GhostButton
                  disabled={busy}
                  onClick={() => {
                    void save("restore");
                  }}
                >
                  Restaurar horario habitual
                </GhostButton>
              )}
            </div>
          </>
        )}
        <GhostButton disabled={busy} onClick={close}>
          Cerrar
        </GhostButton>
      </div>
    </AccentModal>
  );
}
