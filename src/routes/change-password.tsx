import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth, validatePasswordComplexity } from "@/lib/auth";
import { Logo } from "@/components/verbo/Logo";
import { Loader2, Check, X } from "lucide-react";

export const Route = createFileRoute("/change-password")({
  head: () => ({ meta: [{ title: "Change your password — Verbo Language Solutions" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user) return <Navigate to="/login" />;

  const complexityError = validatePasswordComplexity(next);
  const hasUpper = /[A-Z]/.test(next);
  const hasDigit = /[0-9]/.test(next);
  const hasMinLen = next.length >= 4;
  const matches = next.length > 0 && next === confirm;
  const canSubmit = !complexityError && matches && !submitting;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setError("");
    if (complexityError) return setError(complexityError);
    if (!matches) return setError("Passwords do not match.");
    setSubmitting(true);
    setTimeout(() => {
      const res = updateProfile({ newPassword: next, forceChange: true });
      if (!res.ok) {
        setError(res.error);
        setSubmitting(false);
        return;
      }
      const dest = user.role === "admin" ? "/admin" : user.role === "teacher" ? "/teacher" : "/student";
      navigate({ to: dest });
    }, 500);
  };

  const showErrors = touched || attempted;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 [&_span]:text-[#01304a] [&_span.text-muted-foreground]:text-[#01304a]/70" />
        <div className="inline-flex items-center rounded-md bg-[#01304a]/5 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-[#01304a]/70">
          FIRST SIGN-IN
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#01304a]">Change your password</h1>
        <p className="mt-1.5 text-sm text-[#01304a]/70">
          For security, please set a new password before continuing to your dashboard.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#01304a]">New password</label>
            <input
              type="password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={submitting}
              className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#01304a] focus:outline-none ${
                showErrors && complexityError ? "border-destructive" : "border-[#01304a]/15"
              }`}
              placeholder="••••••••"
            />
          </div>

          <ul className="space-y-1 text-xs text-[#01304a]/70">
            <RuleRow ok={hasMinLen} label="At least 4 characters" />
            <RuleRow ok={hasUpper} label="At least one uppercase letter" />
            <RuleRow ok={hasDigit} label="At least one number" />
          </ul>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#01304a]">Confirm new password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={submitting}
              className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#01304a] focus:outline-none ${
                showErrors && confirm.length > 0 && !matches ? "border-destructive" : "border-[#01304a]/15"
              }`}
              placeholder="••••••••"
            />
            {showErrors && confirm.length > 0 && !matches && (
              <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f38934] px-4 py-3 text-sm font-semibold text-white shadow-soft disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                Updating...
              </>
            ) : (
              "Update password and continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function RuleRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-[#01304a]/40" />}
      <span className={ok ? "text-emerald-700" : "text-[#01304a]/70"}>{label}</span>
    </li>
  );
}
