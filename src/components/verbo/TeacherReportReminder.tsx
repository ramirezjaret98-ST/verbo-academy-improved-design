import { useEffect, useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { academyToday } from "@/lib/academy-time";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

/** A reminder per authenticated login and CDMX day; navigation/refresh do not repeat it. */
export function TeacherReportReminder() {
  const { user } = useAuth();
  const teacherId = user?.role === "teacher" ? user.id : null;
  const [loginStamp, setLoginStamp] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const acknowledged = useRef<string | null>(null);
  const storageKey = `verbo:teacher-report-reminder:v1:${teacherId}`;

  useEffect(() => {
    if (!teacherId) return;
    let cancelled = false;
    const apply = (stamp?: string) => {
      if (!cancelled) setLoginStamp(stamp || "current-session");
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user.last_sign_in_at)).catch(() => apply());
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") apply(session?.user.last_sign_in_at);
    });
    return () => { cancelled = true; data.subscription.unsubscribe(); };
  }, [teacherId]);

  useEffect(() => {
    if (!teacherId || !loginStamp) return;
    const check = () => {
      const key = `${loginStamp}:${academyToday()}`;
      let stored: string | null = null;
      try { stored = sessionStorage.getItem(storageKey); } catch { /* Session memory works if storage is unavailable. */ }
      if (acknowledged.current !== key && stored !== key) setPendingKey(key);
    };
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [teacherId, loginStamp, storageKey]);

  const dismiss = () => {
    acknowledged.current = pendingKey;
    try { if (pendingKey) sessionStorage.setItem(storageKey, pendingKey); } catch { /* Keep the in-memory acknowledgement. */ }
    setPendingKey(null);
  };
  if (!teacherId) return null;
  return (
    <Dialog open={Boolean(pendingKey)} onOpenChange={open => { if (!open) dismiss(); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-0 p-0 sm:max-w-lg [&>button]:text-white">
        <div className="bg-[#01304a] px-6 pt-7 pb-5 text-white">
          <ClipboardCheck size={28} className="mb-3 text-[#f38934]" aria-hidden />
          <DialogTitle className="pr-6 text-xl text-white">Completa tus reportes a tiempo</DialogTitle>
        </div>
        <div className="space-y-5 px-6 pt-1 pb-6">
          <DialogDescription className="text-sm leading-relaxed text-foreground">
            No olvides completar los reportes de tus sesiones a tiempo. Aunque el alumno no haya asistido,
            debes enviar el reporte y marcarlo como ausente. Sin el reporte, la sesión no se contabilizará
            y esto puede afectar tus KPIs.
          </DialogDescription>
          <button type="button" onClick={dismiss} className="w-full rounded-lg bg-[#01304a] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f38934]">
            Entendido
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
