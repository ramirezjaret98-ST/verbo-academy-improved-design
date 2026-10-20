import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid } from "@/lib/user-id-bridge";
import type { Database } from "@/integrations/supabase/types";
import { academyToday } from "@/lib/academy-time";
import { loadExternalOccurrences, loadExternalOverrides, refreshExternalSchedule, restoreExternalOverride, subscribeExternalSchedule, type ExternalOccurrence } from "@/lib/external-schedule-store";
import { ExternalOccurrenceEditor } from "./ExternalOccurrenceEditor";

type Block = Database["public"]["Tables"]["teacher_external_blocks"]["Row"];
type Draft = Pick<Block, "label" | "weekday" | "start_min" | "end_min" | "start_date" | "end_date">;
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const empty = (): Draft => ({ label: "", weekday: 1, start_min: 900, end_min: 960, start_date: "", end_date: "" });
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutes = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; };

export function ExternalTeacherBlocks({ teacherId }: { teacherId: string }) {
  const [uuid, setUuid] = useState<string | null>(null);
  const [rows, setRows] = useState<Block[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dateEdit, setDateEdit] = useState<ExternalOccurrence | null>(null);

  const reload = async (id: string) => {
    const { data, error: readError } = await supabase.from("teacher_external_blocks")
      .select("*").eq("teacher_id", id).order("weekday").order("start_min");
    if (readError) throw readError;
    setRows(data ?? []);
  };

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const id = await legacyToUuid(teacherId);
        if (!id) throw new Error("This teacher has no Academy account.");
        if (!live) return;
        setUuid(id);
        await Promise.all([reload(id), refreshExternalSchedule()]);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Could not load reserved times.");
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [teacherId]);
  useEffect(() => {
    if (!uuid) return;
    return subscribeExternalSchedule(() => { void reload(uuid).catch((e) => setError(e.message)); });
  }, [uuid]);

  const save = async () => {
    setError(""); setNotice("");
    if (!uuid || !draft.label.trim() || !draft.start_date || !draft.end_date || draft.end_date < draft.start_date
      || draft.start_min < 0 || draft.end_min > 1440 || draft.end_min <= draft.start_min) {
      setError("Add a label, valid dates and an end time after the start time."); return;
    }
    setBusy(true);
    try {
      const record = { ...draft, label: draft.label.trim(), teacher_id: uuid, updated_at: new Date().toISOString() };
      const result = editing == null
        ? await supabase.from("teacher_external_blocks").insert(record).select("id").single()
        : await supabase.from("teacher_external_blocks").update(record).eq("id", editing).eq("teacher_id", uuid).select("id").single();
      if (result.error) throw result.error;
      await Promise.all([reload(uuid), refreshExternalSchedule()]);
      setEditing(null); setDraft(empty()); setNotice("Reserved time saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the reserved time."); }
    finally { setBusy(false); }
  };

  const remove = async (row: Block) => {
    if (!uuid || !window.confirm(`Remove this ${days[row.weekday]} reservation?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: deleteError } = await supabase.from("teacher_external_blocks")
        .delete().eq("id", row.id).eq("teacher_id", uuid).select("id").single();
      if (deleteError) throw deleteError;
      await Promise.all([reload(uuid), refreshExternalSchedule()]);
      if (editing === row.id) { setEditing(null); setDraft(empty()); }
      setNotice("Reserved time removed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove the reserved time."); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Clases presenciales · P</h3>
        <p className="mt-1 text-xs text-muted-foreground">Reserva automática de horario, sin reportes ni asistencia. Puedes cambiar una fecha o editar el patrón semanal. Todos los horarios usan Ciudad de México.</p>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Loading reservations…</p> : rows.length === 0 ? <p className="text-xs text-muted-foreground">No external reservations yet.</p> : (
        <div className="space-y-2">
          {rows.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
            <span className="flex-1 font-medium">{days[row.weekday]} {hhmm(row.start_min)}–{hhmm(row.end_min)} · {row.start_date} to {row.end_date} · {row.label}</span>
            <button type="button" disabled={busy} className="font-semibold text-violet-700" onClick={() => {
              const all = loadExternalOccurrences(teacherId).filter((o) => o.blockId === row.id);
              const next = all.find((o) => o.originalDate >= academyToday()) ?? all[0];
              if (next) setDateEdit(next); else setError("Esta serie no tiene fechas. Revisa su periodo.");
            }}>Cambiar una fecha</button>
            <button type="button" disabled={busy} className="font-semibold text-primary" onClick={() => { setEditing(row.id); setDraft(row); setError(""); setNotice(""); }}>Editar serie</button>
            <button type="button" disabled={busy} className="font-semibold text-destructive" onClick={() => { void remove(row); }}>Remove</button>
            {loadExternalOverrides(row.id).map((o) => <div key={o.on_date} className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
              <span className="flex-1">{o.on_date}: {o.cancelled ? "Horario liberado" : `Movida a ${o.replacement_date} · ${hhmm(o.start_min!)}–${hhmm(o.end_min!)}`}</span>
              <button type="button" disabled={busy} className="font-semibold text-primary" onClick={() => {
                setBusy(true); setError("");
                void restoreExternalOverride(row.id, o.on_date).catch((e) => setError(e.message)).finally(() => setBusy(false));
              }}>Restaurar fecha habitual</button>
            </div>)}
          </div>)}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Day<select className="mt-1 w-full rounded-md border border-input bg-background p-2" value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>{days.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>
        <label className="text-xs">Start<input type="time" className="mt-1 w-full rounded-md border border-input bg-background p-2" value={hhmm(draft.start_min)} onChange={(e) => setDraft({ ...draft, start_min: minutes(e.target.value) })} /></label>
        <label className="text-xs">End<input type="time" className="mt-1 w-full rounded-md border border-input bg-background p-2" value={hhmm(draft.end_min)} onChange={(e) => setDraft({ ...draft, end_min: minutes(e.target.value) })} /></label>
        <label className="text-xs">From<input type="date" className="mt-1 w-full rounded-md border border-input bg-background p-2" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></label>
        <label className="text-xs">Through<input type="date" className="mt-1 w-full rounded-md border border-input bg-background p-2" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></label>
        <label className="text-xs">Nombre(s)<input className="mt-1 w-full rounded-md border border-input bg-background p-2" maxLength={120} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {notice && <p role="status" className="text-xs text-success">{notice}</p>}
      {editing != null && <p className="text-xs text-amber-700">Editar serie cambia el patrón semanal completo. Los cambios guardados para fechas específicas se conservan.</p>}
      {dateEdit && <ExternalOccurrenceEditor occurrence={dateEdit} series={rows.find((row) => row.id === dateEdit.blockId)} onClose={() => setDateEdit(null)} />}
      <div className="flex gap-2">
        <button type="button" disabled={busy || loading || !uuid} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50" onClick={() => { void save(); }}>{busy ? "Saving…" : editing == null ? "Add reserved time" : "Save changes"}</button>
        {editing != null && <button type="button" disabled={busy} className="rounded-lg border border-border px-3 py-2 text-xs" onClick={() => { setEditing(null); setDraft(empty()); }}>Cancel edit</button>}
      </div>
    </div>
  );
}
