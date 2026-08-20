// Landing page for the link Supabase's password-recovery email sends
// (see login.tsx's "Forgot your password?" modal, which triggers
// supabase.auth.resetPasswordForEmail with redirectTo pointing here).
//
// Unlike change-password.tsx (the forced first-login flow), this page must
// work WITHOUT an existing app session/useAuth().user — the visitor is
// arriving fresh from an email link. Supabase's client auto-detects the
// recovery token in the URL (detectSessionInUrl defaults to true) and fires
// a PASSWORD_RECOVERY auth event once it's established a temporary session
// from it; we listen for that (and also check for an already-active session
// in case the event fired before this component mounted) before allowing
// the form to submit.
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validatePasswordComplexity } from "@/lib/auth";
import { notifyAccountEvent } from "@/lib/account-notify";
import { Logo } from "@/components/verbo/Logo";
import { Loader2, Check, X, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset your password — Verbo Language Solutions" }] }),
  component: ResetPasswordPage,
});

type LinkState = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setLinkState("ready");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setLinkState("ready");
      }
    });

    // Give the recovery-token exchange a few seconds to complete before
    // concluding the link is invalid/expired.
    const timeout = setTimeout(() => {
      if (!cancelled) setLinkState((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const complexityError = validatePasswordComplexity(next);
  const hasUpper = /[A-Z]/.test(next);
  const hasDigit = /[0-9]/.test(next);
  const hasMinLen = next.length >= 4;
  const matches = next.length > 0 && next === confirm;
  const canSubmit = !complexityError && matches && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setError("");
    if (complexityError) return setError(complexityError);
    if (!matches) return setError("Passwords do not match.");
    setSubmitting(true);

    const { error: updateErr } = await supabase.auth.updateUser({ password: next });
    if (updateErr) {
      setError(updateErr.message);
      setSubmitting(false);
      return;
    }

    // Clear the forced-change flag now that a real password has been set —
    // best-effort: the password change itself already succeeded above, so a
    // failure here just means they'll also see the "first sign-in" prompt
    // once, which is harmless.
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase.from("app_users").update({ must_change_password: false }).eq("id", userData.user.id);
      // 2026-08-20: security confirmation email — "tu contraseña fue
      // actualizada" — same as when Admin resets it on someone's behalf
      // (see adminSetPassword in admin-password.ts). Fire-and-forget, never
      // blocks the sign-out/redirect below.
      notifyAccountEvent(userData.user.id, "password_changed");
    }

    // Sign out of the temporary recovery session and send them to a normal
    // login — simpler and safer than trying to splice this session into the
    // app's existing AuthContext.
    await supabase.auth.signOut();
    setDone(true);
    setSubmitting(false);
    setTimeout(() => navigate({ to: "/login" }), 1800);
  };

  const showErrors = touched || attempted;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-10">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 [&_span]:text-[#01304a] [&_span.text-muted-foreground]:text-[#01304a]/70" />

        {linkState === "checking" && (
          <div className="flex items-center gap-2 text-sm text-[#01304a]/70">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying your reset link…
          </div>
        )}

        {linkState === "invalid" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This reset link is invalid or has expired. Request a new one from the sign-in page.</span>
            </div>
            <Link to="/login" className="inline-block rounded-lg bg-[#f38934] px-4 py-2.5 text-sm font-semibold text-white shadow-soft">
              Back to sign in
            </Link>
          </div>
        )}

        {linkState === "ready" && done && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Password updated. Taking you to sign in…</span>
          </div>
        )}

        {linkState === "ready" && !done && (
          <>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#01304a]">Set a new password</h1>
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
