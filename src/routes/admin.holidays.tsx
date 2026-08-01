// Admin > Holidays.
// Reference-only list. Does NOT block or auto-cancel anything — it exists so
// Admin can validate "Cancelled Holiday" justifications teachers post in the
// Session Report against a canonical, admin-maintained calendar.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2, Plus, CalendarDays } from "lucide-react";
import { Card, PrimaryButton, GhostButton } from "@/components/verbo/ui";
import { addHoliday, removeHoliday, useHolidays } from "@/lib/holidays-store";

export const Route = createFileRoute("/admin/holidays")({ component: Page });

function fmt(dateISO: string) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function Page() {
  const holidays = useHolidays();
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<number, typeof holidays>();
    for (const h of holidays) {
      const y = Number(h.date.slice(0, 4));
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(h);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [holidays]);

  const submit = () => {
    setError(null);
    if (!date) { setError("Pick a date."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError("Invalid date format."); return; }
    if (!label.trim()) { setError("Add a label so teachers know what this holiday is."); return; }
    addHoliday({ date, label });
    setDate("");
    setLabel("");
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Holidays</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Reference calendar of official holiday dates. This list does not
          block scheduling or auto-cancel any session — it exists so that
          "Cancelled Holiday" justifications on Session Reports can be
          validated against a canonical list.
        </p>
      </header>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="text-xs font-medium text-foreground">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. New Year's Day"
              className="mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <PrimaryButton onClick={submit}><Plus className="h-4 w-4" /> Add Holiday</PrimaryButton>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </Card>

      {holidays.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <CalendarDays className="h-6 w-6 opacity-50" />
            No holidays yet. Add the first one above.
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([year, list]) => (
            <Card key={year}>
              <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">{year}</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-medium w-[220px]">Date</th>
                      <th className="px-3 py-2 font-medium">Label</th>
                      <th className="w-[80px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((h) => (
                      <tr key={h.id} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground">{fmt(h.date)}</td>
                        <td className="px-3 py-2 text-foreground">{h.label}</td>
                        <td className="px-3 py-2 text-right">
                          <GhostButton onClick={() => removeHoliday(h.id)} className="!px-2">
                            <Trash2 className="h-4 w-4" />
                          </GhostButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
