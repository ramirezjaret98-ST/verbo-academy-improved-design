// Free-text issue reports a teacher files from Teacher > Financial.
// Persisted locally; consumed by notifications-store to surface an admin
// notification in the bell (no separate inbox page — reuses /admin/financial).

export interface FinancialIssue {
  id: string;
  teacher_id: string;
  text: string;
  created_at: string; // ISO
}

export const FIN_ISSUES_KEY = "verbo:financial-issues";
export const FIN_ISSUES_EVENT = "verbo:financial-issues-updated";

function readAll(): FinancialIssue[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FIN_ISSUES_KEY) || "[]") as FinancialIssue[]; }
  catch { return []; }
}

function writeAll(list: FinancialIssue[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FIN_ISSUES_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(FIN_ISSUES_EVENT));
  } catch { /* noop */ }
}

export function loadFinancialIssues(): FinancialIssue[] {
  return readAll();
}

export function addFinancialIssue(input: { teacherId: string; text: string }): FinancialIssue {
  const issue: FinancialIssue = {
    id: `fin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    teacher_id: input.teacherId,
    text: input.text.trim(),
    created_at: new Date().toISOString(),
  };
  writeAll([issue, ...readAll()]);
  return issue;
}
