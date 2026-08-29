import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/verbo/Logo";
import { supabase } from "@/integrations/supabase/client";
import { Check, Loader2, X } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset your password — Verbo Language Solutions" }] }),
  component: ResetPasswordPage,
});

/** Same complexity rule enforced server-side in confirm-password-reset /
 *  admin-set-password (this sets a real Supabase Auth password — stricter
 *  than the legacy ≥4-char mock-login rule in src/lib/auth.tsx). */
function passwordError(pwd: string): string | null {
  if (!pwd || pwd.length < 6) return "Password must be at least 6 characters.";
  if (!/[A-Z]/.test(pwd)) return "Password must include at least one uppercase letter.";
  if (!/[0-9]/.test(pwd)) return "Password must include at least one number.";
  return null;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  const complexityError = passwordError(next);
  const hasUpper = /[A-Z]/.test(next);
  const hasDigit = /[0-9]/.test(next);
  const hasMinLen = next.length >= 6;
  const matches = next.length > 0 && next === confirm;
  const canSubmit = !complexityError && matches && !submitting && !!token;
  const showErrors = touched || attempted;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setError("");
    if (!token) return setError("This link is invalid or has expired. Please request a new one.");
    if (complexityError) return setError(complexityError);
    if (!matches) return setError("Passwords do not match.");

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("confirm-password-reset", {
        body: { token, newPassword: next },
      });
      if (fnError || (data && (data as { error?: string }).error)) {
        const msg = (data as { error?: string } | null)?.error ?? "This link is invalid or has expired. Please request a new one.";
        setError(msg);
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate({ to: "/login" }), 2200);
    } catch {
      setError("Something went wrong. Please try again in a moment.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 [&_span]:text-[#01304a] [&_span.text-muted-foreground]:text-[#01304a]/70" />

        {success ? (
          <>
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#01304a]">Password updated</h1>
            <p className="mt-2 text-sm text-[#01304a]/70">Taking you to sign in…</p>
          </>
        ) : token === null ? null : !token ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-[#01304a]">Link invalid or expired</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#01304a]/70">
              This password reset link is no longer valid. Reset links expire after 30 minutes and can only be used
              once.
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#f38934] px-4 py-3 text-sm font-semibold text-white shadow-soft"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-[#01304a]">Set a new password</h1>
            <p className="mt-1.5 text-sm text-[#01304a]/70">Choose a new password for your account.</p>

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
                <RuleRow ok={hasMinLen} label="At least 6 characters" />
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
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <X className="mt-px h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
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
                  "Update password"
                )}
              </button>
            </form>
          </>
        )}
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
