// ============================================================================
// Manual financial entries — one-off income/expense lines an admin types
// into The Money Lab by hand, for anything the automatic engines (student
// billing, teacher hours) don't cover. Concrete example that prompted this
// (2026-08-19): a teacher who occasionally gives an in-person class with no
// matching student record in the system — there's no session to bill, so
// nothing would otherwise show up as an expense for that class.
//
// These are pure additive/subtractive ledger lines: no Paid/Pending status,
// no recurrence (Jaret confirmed one-off capture is enough for now — no
// "repeat monthly" flag). `linked_teacher_id`/`linked_student_id` are purely
// informational (shown next to the entry so it's clear who it's about) and
// never feed back into the automatic hours/billing engines — same
// "additional layer, don't touch the automatic engine" principle as Feature B
// (manual teacher-pay review) from the same day.
//
// Same architecture as payments-log.ts: Supabase-backed (`public
// .manual_financial_entries`, RLS: coordinator_fin/super_admin only —
// matches the Financial gate in admin-roles.ts), global cache hydrated once +
// Postgres Realtime.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export type ManualEntryType = "income" | "expense";

export interface ManualFinancialEntry {
  id: string;
  entry_type: ManualEntryType;
  label: string;
  amount: number; // MXN
  entry_date: string; // ISO date (YYYY-MM-DD)
  month: string;       // YYYY-MM
  linked_teacher_id?: string; // legacy id, informational only
  linked_teacher_name?: string;
  linked_student_id?: string; // legacy id, informational only
  linked_student_name?: string;
  notes?: string;
  created_at: string;
}

type Row = Database["public"]["Tables"]["manual_financial_entries"]["Row"];

let cache: ManualFinancialEntry[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("verbo:manual-financial-entries-updated"));
}

function mapRow(row: Row): ManualFinancialEntry {
  return {
    id: `mfe-${row.id}`,
    entry_type: row.entry_type as ManualEntryType,
    label: row.label,
    amount: Number(row.amount),
    entry_date: row.entry_date,
    month: row.month,
    linked_teacher_id: row.linked_teacher_id ? uuidToLegacySync(row.linked_teacher_id) : undefined,
    linked_student_id: row.linked_student_id ? uuidToLegacySync(row.linked_student_id) : undefined,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
  };
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    await hydrateUserIdBridge();
    const { data, error } = await supabase
      .from("manual_financial_entries")
      .select("*")
      .order("entry_date", { ascending: false });
    if (error) {
      console.error("[manual-financial-entries] failed to load", error);
      hydrated = true;
      return;
    }
    cache = (data ?? []).map(mapRow);
    hydrated = true;
  })();
  await hydratePromise;
  hydratePromise = null;
  notify();
}

if (typeof window !== "undefined") {
  void hydrate();
  supabase
    .channel("manual-financial-entries-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "manual_financial_entries" }, () => {
      hydrated = false;
      void hydrate();
    })
    .subscribe();
}

export function loadManualEntries(): ManualFinancialEntry[] {
  if (!hydrated) void hydrate();
  return cache;
}

export function subscribeManualEntries(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function manualEntriesForMonth(mkey: string): ManualFinancialEntry[] {
  return loadManualEntries().filter((e) => e.month === mkey);
}

/** Add a manual entry. Optimistic (temp id, rolled back on failure) — same
 *  convention as logPayment in payments-log.ts. `teacherName`/`studentName`
 *  are only used for the optimistic local row; the real names always come
 *  from resolving the linked id on read. */
export function addManualEntry(input: {
  entry_type: ManualEntryType;
  label: string;
  amount: number;
  entry_date: string;
  linked_teacher_id?: string;
  linked_teacher_name?: string;
  linked_student_id?: string;
  linked_student_name?: string;
  notes?: string;
  createdBy?: string;
}): void {
  const month = input.entry_date.slice(0, 7);
  const tempId = `temp-${Date.now()}`;
  const optimistic: ManualFinancialEntry = {
    id: tempId,
    entry_type: input.entry_type,
    label: input.label,
    amount: input.amount,
    entry_date: input.entry_date,
    month,
    linked_teacher_id: input.linked_teacher_id,
    linked_teacher_name: input.linked_teacher_name,
    linked_student_id: input.linked_student_id,
    linked_student_name: input.linked_student_name,
    notes: input.notes,
    created_at: new Date().toISOString(),
  };
  cache = [optimistic, ...cache];
  notify();

  void (async () => {
    const [teacherUuid, studentUuid, createdByUuid] = await Promise.all([
      input.linked_teacher_id ? legacyToUuid(input.linked_teacher_id) : Promise.resolve(null),
      input.linked_student_id ? legacyToUuid(input.linked_student_id) : Promise.resolve(null),
      input.createdBy ? legacyToUuid(input.createdBy) : Promise.resolve(null),
    ]);
    const { data, error } = await supabase
      .from("manual_financial_entries")
      .insert({
        entry_type: input.entry_type,
        label: input.label,
        amount: input.amount,
        entry_date: input.entry_date,
        month,
        linked_teacher_id: teacherUuid,
        linked_student_id: studentUuid,
        notes: input.notes || null,
        created_by: createdByUuid,
      })
      .select("*")
      .single();
    if (error || !data) {
      console.error("[manual-financial-entries] failed to save", error);
      cache = cache.filter((e) => e.id !== tempId);
      notify();
      return;
    }
    const saved = mapRow(data);
    // Preserve the display names we already had locally — mapRow only knows
    // ids, and the caller-supplied names avoid an extra roster lookup here.
    saved.linked_teacher_name = input.linked_teacher_name;
    saved.linked_student_name = input.linked_student_name;
    cache = cache.map((e) => (e.id === tempId ? saved : e));
    notify();
  })();
}

/** Remove a manual entry ("quitar"). Optimistic, rolled back on failure. */
export function deleteManualEntry(id: string): void {
  const prev = cache;
  cache = cache.filter((e) => e.id !== id);
  notify();

  const dbId = Number(id.replace("mfe-", ""));
  if (!Number.isFinite(dbId)) return; // still-optimistic temp row, nothing to delete server-side yet
  void (async () => {
    const { error } = await supabase.from("manual_financial_entries").delete().eq("id", dbId);
    if (error) {
      console.error("[manual-financial-entries] failed to delete", error);
      cache = prev;
      notify();
    }
  })();
}
