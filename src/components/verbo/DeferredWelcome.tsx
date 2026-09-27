import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { legacyToUuid } from "@/lib/user-id-bridge";

export function DeferredWelcome({ studentId, name, email, initialPassword }: {
  studentId: string; name: string; email: string; initialPassword: string;
}) {
  const [uuid, setUuid] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [password, setPassword] = useState(initialPassword);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const id = await legacyToUuid(studentId);
        if (!id) throw new Error("Account not found in Academy Auth.");
        const { data, error: readError } = await supabase.from("app_users")
          .select("welcome_pending").eq("id", id).maybeSingle();
        if (readError) throw readError;
        if (live) { setUuid(id); setPending(!!data?.welcome_pending); }
      } catch (e) { if (live) setError(e instanceof Error ? e.message : "Could not check welcome status."); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [studentId]);

  const send = async () => {
    if (!uuid || !password || sending) return;
    setSending(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-send-welcome", {
        body: { studentId: uuid, password },
      });
      const responseError = (data as { error?: string } | null)?.error;
      if (invokeError || responseError) throw new Error(responseError ?? invokeError?.message ?? "Could not send welcome email.");
      setPending(false); setPassword("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send welcome email."); }
    finally { setSending(false); }
  };

  if (loading) return <p className="text-xs text-muted-foreground">Checking welcome status…</p>;
  if (!pending) return error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null;
  return <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
    <p className="text-sm font-semibold">Welcome email pending for {name}</p>
    <p className="text-xs text-muted-foreground">Send to {email} when the course and materials are ready. This button disappears after the email service accepts the message.</p>
    <label className="block text-xs font-medium">Temporary password used at registration
      <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" />
    </label>
    <p className="text-[11px] text-muted-foreground">Confirm it matches the account's temporary password. Academy cannot retrieve a password from Auth after registration.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <button type="button" disabled={sending || !password || !uuid}
      className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      onClick={() => { void send(); }}>{sending ? "Sending…" : "Send welcome email"}</button>
  </div>;
}
