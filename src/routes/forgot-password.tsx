import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Logo } from "@/components/verbo/Logo";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Check, Loader2, Mail, X } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset your password — Verbo Language Solutions" }] }),
  component: ForgotPasswordPage,
});

/** Client-side format check only — the real "does this account exist" check
 *  happens server-side in request-password-reset, which always replies with
 *  the same generic success message either way (no email enumeration). */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const lastSubmitted = useRef("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("request-password-reset", {
        body: { email: trimmed },
      });
      // Even a non-2xx here is surfaced as a generic "something went wrong,
      // try again" — request-password-reset itself never reports whether
      // the email matched an account, by design.
      if (fnError) throw fnError;
      lastSubmitted.current = trimmed;
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50 px-6 py-10">
      <div className="w-full max-w-sm">
        <Link
          to="/login"
          className="mb-6 inline-flex w-fit items-center gap-2 text-sm text-[#01304a]/60 transition-colors hover:text-[#01304a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>

        <div className="rounded-[1.5rem] bg-white p-8 shadow-floating">
          <Logo className="mb-8 [&_span]:text-[#01304a] [&_span.text-muted-foreground]:text-[#01304a]/70" />

          {sent ? (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#01304a]">Check your email</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#01304a]/70">
                If <span className="font-medium text-[#01304a]">{lastSubmitted.current}</span> has an account with
                us, a password reset link is on its way. It expires in 30 minutes.
              </p>
              <p className="mt-4 text-xs text-[#01304a]/50">
                Didn't get it? Check your spam folder, or{" "}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="font-medium text-[#f38934] hover:underline"
                >
                  try again
                </button>
                .
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-[#01304a]">Forgot your password?</h1>
              <p className="mt-1.5 text-sm text-[#01304a]/70">
                Enter the email on your account and we'll send you a link to reset it.
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#01304a]">Email</label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#01304a]/35" />
                    <input
                      type="email"
                      required
                      autoFocus
                      disabled={submitting}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-[#01304a]/15 bg-white py-2.5 pl-9 pr-3 text-sm text-[#01304a] placeholder:text-[#01304a]/40 focus:outline-none"
                      placeholder="name@company.com"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    <X className="mt-px h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f38934] px-4 py-3 text-sm font-semibold text-white shadow-soft disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
