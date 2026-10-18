import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { Ban, TriangleAlert, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  noticeAction,
  noticeDate,
  type NoticeAction,
  type SuspensionAccess,
} from "@/lib/suspension-notices";
import { SuspensionHistory } from "./SuspensionHistory";

export function SuspensionNoticeGate({ children }: { children: ReactNode }) {
  const { suspensionAccess, clearSuspension } = useAuth();
  return suspensionAccess ? (
    <SuspensionScreen
      key={suspensionAccess.token}
      access={suspensionAccess}
      onExit={clearSuspension}
    />
  ) : (
    <>{children}</>
  );
}

function SuspensionScreen({ access, onExit }: { access: SuspensionAccess; onExit: () => void }) {
  const navigate = useNavigate();
  const [notice, setNotice] = useState(access.notice);
  const [stage, setStage] = useState<"first" | "warning" | "receipt">("first");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(5);
  const lockUntil = useRef(0);
  const operation = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void noticeAction(access.token, "shown")
      .then((result) => {
        if (!cancelled) setNotice(result.notice);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [access.token]);
  useEffect(() => {
    if (stage !== "warning") return;
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((lockUntil.current - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [stage]);
  const act = async (action: NoticeAction, next?: () => void, onFailure?: () => void) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await noticeAction(access.token, action);
      setNotice(result.notice);
      next?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el registro.");
      onFailure?.();
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const exit = () => {
    onExit();
    void navigate({ to: "/login" });
  };
  const close = () => {
    if (busy) return;
    if (stage === "first") {
      void act("warning_opened", () => {
        lockUntil.current = Date.now() + 5000;
        setRemaining(5);
        setStage("warning");
      });
    } else if (stage === "warning" && remaining === 0) void act("closed", exit, exit);
  };
  const button =
    "rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  const locked = busy || (stage === "warning" && remaining > 0);
  return (
    <main className="min-h-screen bg-[#f4f6f8] px-5 py-16">
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-2xl font-semibold text-[#01304a]">Estado de tu cuenta</h1>
        <p className="text-sm text-slate-600">
          Tu acceso a Academy continúa suspendido. Aquí puedes consultar tus avisos y acuses.
        </p>
        <SuspensionHistory
          token={access.token}
          refresh={`${notice.first_shown_at ?? ""}:${notice.acknowledged_at ?? ""}`}
        />
        {stage === "receipt" && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"
          >
            Tu clic en Entendido quedó registrado el {noticeDate(notice.acknowledged_at)}. El correo
            de constancia quedó en cola de envío.
          </p>
        )}
        {stage === "receipt" && (
          <div className="flex flex-wrap gap-3">
            <a
              href="https://wa.link/zomggz"
              target="_blank"
              rel="noopener noreferrer"
              className={`${button} bg-[#f38934] text-white`}
            >
              Contactar a Verbo
            </a>
            <button onClick={exit} className={`${button} border border-slate-300`}>
              Volver al inicio de sesión
            </button>
          </div>
        )}
      </div>
      <Dialog.Root
        open={stage !== "receipt"}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#001a29]/75 backdrop-blur-sm" />
          <Dialog.Content
            onPointerDownOutside={(event) => {
              event.preventDefault();
              close();
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              close();
            }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white shadow-2xl focus:outline-none"
          >
            <div
              className={`relative p-7 pr-14 text-white ${stage === "warning" ? "bg-[#8d2f20]" : "bg-[#01304a]"}`}
            >
              {stage === "warning" ? (
                <TriangleAlert className="mb-3 h-8 w-8" />
              ) : (
                <Ban className="mb-3 h-8 w-8" />
              )}
              <p className="mb-2 text-xs font-bold uppercase tracking-widest opacity-75">
                Verbo Academy
              </p>
              <Dialog.Title className="text-2xl font-semibold">
                {stage === "warning" ? notice.copy.warningTitle : notice.copy.title}
              </Dialog.Title>
              <button
                aria-label="Cerrar aviso"
                disabled={locked}
                onClick={close}
                className="absolute right-5 top-5 rounded-md p-1 focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <X />
              </button>
            </div>
            <div className="space-y-5 p-7">
              <Dialog.Description className="text-[15px] leading-7 text-slate-700">
                {stage === "warning" ? notice.copy.warning : notice.copy.body}
              </Dialog.Description>
              {notice.deadline_at && (
                <p className="rounded-xl bg-orange-50 p-4 text-sm font-semibold text-[#8d2f20]">
                  Fecha límite: {noticeDate(notice.deadline_at)}
                  <span className="mt-1 block text-xs font-normal">
                    Hora de Ciudad de México. La baja requiere revisión de Administración.
                  </span>
                </p>
              )}
              {error && (
                <div role="alert" className="text-sm text-red-700">
                  {error}
                  {!notice.first_shown_at && (
                    <button onClick={() => void act("shown")} className="ml-2 underline">
                      Reintentar
                    </button>
                  )}
                </div>
              )}
              {stage === "first" ? (
                <div className="flex flex-col gap-3">
                  <button
                    disabled={busy || !notice.first_shown_at}
                    onClick={() => {
                      window.open("https://wa.link/zomggz", "_blank", "noopener,noreferrer");
                      void act("contact_opened", exit, exit);
                    }}
                    className={`${button} bg-[#f38934] text-white`}
                  >
                    Contactar a Verbo
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void act("returned_to_login", exit, exit)}
                    className={`${button} border border-slate-300 text-[#01304a]`}
                  >
                    Volver al inicio de sesión
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500">{notice.copy.receipt}</p>
                  <button
                    disabled={locked}
                    onClick={() => void act("acknowledged", () => setStage("receipt"))}
                    className={`${button} w-full bg-[#8d2f20] text-white`}
                  >
                    {busy
                      ? "Guardando…"
                      : remaining > 0
                        ? `Entendido (${remaining} s)`
                        : "Entendido"}
                  </button>
                  {remaining > 0 && (
                    <p role="status" className="text-center text-xs text-slate-500">
                      Podrás confirmar o cerrar este aviso en {remaining} segundos.
                    </p>
                  )}
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
