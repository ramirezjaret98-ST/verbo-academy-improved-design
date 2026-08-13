// Admin action: forcibly set/reset a user's login password, for the
// "I forgot my password and can't get back in" / "I need to hand this
// person a working login right now" operational case — distinct from the
// pre-existing "Require Password Reset" button (which only flips
// must_change_password so the user is prompted to pick a NEW password the
// next time they successfully log in with their OLD one; that doesn't help
// if they're already locked out or never knew the password to begin with).
//
// Two modes:
//  - Generate a temporary password (default): the server picks a random
//    complex password, sets it, and returns it once so the admin can hand
//    it to the user. It is never shown or stored again after this modal
//    closes.
//  - Set a specific password: admin types one in (validated client-side
//    with the same complexity rule used everywhere else in the app).
//
// Either way the target account is flagged must_change_password = true, so
// the recipient is forced to pick their own password on next login.
import { useState } from "react";
import { X, KeyRound, Copy, Check, Eye, EyeOff } from "lucide-react";
import { GhostButton, PrimaryButton } from "@/components/verbo/ui";
import { validatePasswordComplexity } from "@/lib/auth";
import { adminSetPassword } from "@/lib/admin-password";
import { toast } from "sonner";

export function ResetPasswordModal({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"generate" | "custom">("generate");
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const complexityError = mode === "custom" ? validatePasswordComplexity(custom) : null;
  const canSubmit = mode === "generate" || (!complexityError && custom.length > 0);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    const res = await adminSetPassword(userId, mode === "custom" ? custom : undefined);
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    setResult(res.password);
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy the password manually.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="h-4 w-4" /> Reset password
          </h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        {result ? (
          <div className="space-y-4 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              New password for <span className="font-medium text-foreground">{userName}</span>.
              This is shown only once — copy it now and send it to them securely. They'll be asked
              to set their own password the next time they sign in.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <code className="flex-1 select-all font-mono text-sm">{result}</code>
              <button onClick={copy} className="rounded-md p-1.5 hover:bg-secondary" aria-label="Copy password">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <PrimaryButton onClick={onClose}>Done</PrimaryButton>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Set a new login password for <span className="font-medium text-foreground">{userName}</span>.
              </p>
              <div className="flex gap-2 rounded-lg border border-border bg-secondary/30 p-1">
                <button
                  onClick={() => setMode("generate")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "generate" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                >
                  Generate temporary password
                </button>
                <button
                  onClick={() => setMode("custom")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "custom" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
                >
                  Set a specific password
                </button>
              </div>

              {mode === "custom" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">New password</label>
                  <div className="relative mt-1">
                    <input
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      type={showCustom ? "text" : "password"}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm"
                    />
                    <button type="button" onClick={() => setShowCustom((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Toggle password">
                      {showCustom ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">At least 4 characters, one uppercase letter, one number.</p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <GhostButton onClick={onClose} disabled={submitting}>Cancel</GhostButton>
              <PrimaryButton onClick={submit} disabled={!canSubmit || submitting}>
                {submitting ? "Setting…" : "Set password"}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
