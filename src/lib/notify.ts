// Centralized save/error feedback — 2026-08-26.
//
// Jaret's exact complaint: saving something in the Admin/Teacher/Student
// panels just closes the modal, with no confirmation that it actually
// worked — and if the write silently failed (a real, recurring bug class in
// this app — see e.g. students-store.ts/teacher-model.ts optimistic writes,
// or the "cascarón" student created without a real account), nobody finds
// out until much later. Two rules, straight from that conversation:
//
//  1. Every save/create/update/delete gets a visible confirmation, success
//     OR error — nothing should ever "just close" silently again.
//  2. Admins see the real, specific error (they're the ones who can act on
//     it — reach out to Jaret/support with something concrete). Teachers and
//     students see a plain-language message with NO technical detail, code,
//     or jargon — just enough of a hint to describe what happened if they
//     need to report it.
//
// Uses the `sonner` toast library already wired up app-wide via
// <Toaster /> in routes/__root.tsx.
import { toast } from "sonner";
import { getCurrentRole } from "./auth";
import type { Role } from "./mock-data";

function rawErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const anyErr = error as { message?: string; error?: string; error_description?: string; details?: string };
    return anyErr.message || anyErr.error || anyErr.error_description || anyErr.details || JSON.stringify(error);
  }
  return String(error);
}

export interface NotifyErrorOptions {
  /** Short label for what was being saved (e.g. "Saving student",
   *  "Updating session"). Shown to admins right before the technical
   *  detail; folded into the friendly hint for teachers/students. */
  context?: string;
  /** Override the viewer's role instead of reading the live session — rare,
   *  only for a call site that already knows better than the logged-in
   *  session (e.g. acting explicitly "as" a different role). */
  role?: Role | null;
}

/** Show an error toast, phrased for whoever is actually looking at the
 *  screen right now. Safe to call from anywhere — plain lib/store modules
 *  included, not just React components. */
export function notifyError(error: unknown, opts: NotifyErrorOptions = {}): void {
  const role = opts.role !== undefined ? opts.role : getCurrentRole();
  const context = opts.context?.trim();

  if (role === "admin") {
    const detail = rawErrorMessage(error);
    toast.error(context ? `${context}: ${detail}` : detail);
    return;
  }

  // Teachers/students: no stack traces, no raw Supabase/Postgres error text,
  // no field names — just a plain-language heads-up with a small hint so
  // they can describe what happened if they report it.
  const hint = context ? ` (${context})` : "";
  toast.error(`Something went wrong and this didn't save${hint}. Please try again — if it keeps happening, let us know so we can look into it.`);
}

/** Thin, explicit wrapper around toast.success — exists mainly so success
 *  and error feedback are grep-able together as "the notify system" and so
 *  a future global change (icon, duration, copy) has one place to happen. */
export function notifySuccess(message: string): void {
  toast.success(message);
}
