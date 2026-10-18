import { useEffect, useState } from "react";
import {
  loadSuspensionHistory,
  noticeDate,
  noticeHistory,
  type SuspensionNotice,
} from "@/lib/suspension-notices";

const labels: Record<string, string> = {
  suspended: "Suspensión registrada",
  shown: "Primer aviso mostrado",
  warning_opened: "Segundo aviso abierto",
  acknowledged: "Clic en Entendido registrado",
  closed: "Cierre sin acuse",
  contact_opened: "Canal de contacto abierto",
  returned_to_login: "Regreso al inicio de sesión",
  reactivated: "Suspensión finalizada",
};
const delivery: Record<string, string> = {
  cancelled: "Envío cancelado tras finalizar la suspensión",
  pending: "Pendiente de envío",
  sending: "En proceso de envío",
  sent: "Aceptado por el proveedor",
  failed: "Envío fallido",
};

export function SuspensionHistory({
  studentId,
  token,
  refresh = "",
}: {
  studentId?: string;
  token?: string;
  refresh?: string;
}) {
  const [history, setHistory] = useState<SuspensionNotice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setHistory([]);
    const request = token
      ? noticeHistory(token)
      : studentId
        ? loadSuspensionHistory(studentId)
        : Promise.resolve([]);
    void request
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el historial de avisos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, token, refresh, retry]);
  return (
    <section
      className="rounded-xl border border-border bg-card p-5 text-foreground"
      aria-label="Historial de avisos de suspensión"
    >
      <h2 className="text-lg font-semibold">Avisos y acuses de suspensión</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Fechas en hora de Ciudad de México. El acuse registra el clic en Entendido.
      </p>
      {loading && (
        <p role="status" className="mt-4 text-sm">
          Cargando historial…
        </p>
      )}
      {error && (
        <div role="alert" className="mt-4 text-sm text-destructive">
          {error}{" "}
          <button onClick={() => setRetry((n) => n + 1)} className="underline">
            Reintentar
          </button>
        </div>
      )}
      {!loading && !error && history.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Sin avisos registrados.</p>
      )}
      {history.map((notice) => (
        <article
          key={notice.id}
          className="mt-4 space-y-2 rounded-lg border border-border p-4 text-sm"
        >
          <p className="font-semibold">
            {notice.ended_at ? "Suspensión finalizada" : "Suspensión activa"} ·{" "}
            {noticeDate(notice.created_at)}
          </p>
          <p>Primer aviso: {noticeDate(notice.first_shown_at)}</p>
          <p className="font-semibold">Fecha límite: {noticeDate(notice.deadline_at)}</p>
          <p>
            Entendido: {notice.acknowledged_at ? noticeDate(notice.acknowledged_at) : "Sin acuse"}
          </p>
          <p className="text-xs text-muted-foreground">
            Referencia: {notice.id} · Versión: {notice.copy.version}
          </p>
          <details>
            <summary className="cursor-pointer font-medium">
              Ver texto del aviso y registro de eventos
            </summary>
            <div className="mt-3 space-y-3">
              <h3 className="font-semibold">{notice.copy.title}</h3>
              <p>{notice.copy.body}</p>
              <h3 className="font-semibold">{notice.copy.warningTitle}</h3>
              <p>{notice.copy.warning}</p>
              <p>{notice.copy.receipt}</p>
              <ul className="space-y-1">
                {notice.events?.map((event) => (
                  <li key={event.id}>
                    {noticeDate(event.created_at)} · {labels[event.kind] ?? event.kind}
                  </li>
                ))}
              </ul>
            </div>
          </details>
          {notice.emails?.map((email) => (
            <p key={email.kind} className="text-xs text-muted-foreground">
              Correo {email.kind === "acknowledged" ? "de acuse" : "de suspensión"}:{" "}
              {delivery[email.status] ?? email.status}
              {email.accepted_at ? ` · ${noticeDate(email.accepted_at)}` : ""}
              {email.status === "failed" && email.last_error ? ` · ${email.last_error}` : ""}
            </p>
          ))}
        </article>
      ))}
    </section>
  );
}
