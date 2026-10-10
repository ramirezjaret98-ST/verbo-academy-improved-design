import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, Clock3, ExternalLink, FileDown, TriangleAlert, Video } from "lucide-react";
import { Logo } from "@/components/verbo/Logo";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { guestRequest, type GuestDetail } from "@/lib/guest-clubs-api";
import "./guest.clubs.css";

export const Route = createFileRoute("/guest/my-club")({
  head: () => ({ meta: [{ title: "Mi Verbo Club" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: MyGuestClubPage,
});

const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long", year: "numeric",
}).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit",
}).format(new Date(value));

function MyGuestClubPage() {
  const [accessToken, setAccessToken] = useState("");
  const [detail, setDetail] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access") || "";
    if (!/^[0-9a-f]{64}$/.test(candidate)) {
      setError("Abre esta página desde el enlace personal que llegó a tu correo.");
      setLoading(false);
      return;
    }
    setAccessToken(candidate);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await guestRequest<GuestDetail>({ action: "detail", accessToken });
        if (active) { setDetail(result); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No pudimos cargar tu club.");
      } finally { if (active) setLoading(false); }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [accessToken]);

  const openResource = async (action: "material" | "meeting") => {
    if (!accessToken || busy) return;
    setBusy(true); setError("");
    // Open now, before the asynchronous request, so browsers do not block it.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    try {
      const result = await guestRequest<{ url: string }>({ action, accessToken });
      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    } catch (cause) {
      tab?.close();
      setError(cause instanceof Error ? cause.message : "No pudimos abrir el enlace.");
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!accessToken || !detail?.cancellationAvailable || busy) return;
    setBusy(true); setCancelError("");
    try {
      await guestRequest<{ cancelled: true }>({ action: "cancel", accessToken });
      setDetail(current => current ? { ...current, bookingStatus: "cancelled", materialAvailable: false,
        meetingAvailable: false, cancellationAvailable: false } : null);
      setCancelOpen(false);
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : "No pudimos cancelar tu lugar.");
    } finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#f7f5f1] text-[#01304a]">
    <header className="border-b border-[#dce5e8] bg-white px-5 py-4 sm:px-10">
      <div className="mx-auto max-w-5xl"><Logo /></div>
    </header>
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:px-10">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#db6d13]">Tu encuentro en Verbo</p>
      <h1 className="mt-2 text-4xl font-semibold">Ver mi club</h1>
      {loading && <p className="mt-8">Cargando tu reserva…</p>}
      {error && <p className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      {detail && <>
        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dce5e8] bg-white shadow-sm">
          {detail.club.cover_image && <img src={detail.club.cover_image} alt="" className="h-52 w-full object-cover sm:h-64" />}
          <div className="p-6 sm:p-8">
            <span className="rounded-full bg-[#e9f1f2] px-3 py-1 text-xs font-bold">{detail.club.type === "book" ? "BOOK CLUB" : "INSIGHT"}</span>
            <h2 className="mt-4 text-3xl font-semibold">{detail.club.title}</h2>
            <p className="mt-2 text-[#526b79]">Hola {detail.guestName}. {detail.bookingStatus === "booked" && detail.club.status !== "cancelled" ? "Tu lugar está confirmado." : detail.bookingStatus === "cancelled" ? "Tu reserva fue cancelada. El código de cortesía no puede volver a usarse." : "Este lugar ya no está activo."}</p>
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium">
              <p className="flex items-center gap-2"><CalendarDays size={18} /> {formatDate(detail.club.date)}</p>
              <p className="flex items-center gap-2"><Clock3 size={18} /> {formatTime(detail.club.date)} · Ciudad de México</p>
            </div>
            {detail.club.description && <p className="mt-6 max-w-2xl leading-relaxed text-[#476171]">{detail.club.description}</p>}
            {detail.club.instructions && detail.bookingStatus === "booked" && <div className="mt-6 rounded-xl bg-[#f2f6f6] p-5">
              <h3 className="font-semibold">Antes del encuentro</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#526b79]">{detail.club.instructions}</p>
            </div>}
          </div>
        </section>
        {detail.bookingStatus === "booked" && detail.club.status !== "cancelled" && <div className="mt-6 grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-[#dce5e8] bg-white p-6">
            <BookOpen className="text-[#db6d13]" size={28} />
            <h2 className="mt-4 text-xl font-semibold">Material de preparación</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#526b79]">{detail.materialAvailable ? "Abre o descarga el material de este club. Si Verbo lo actualiza, aparecerá aquí." : "El material todavía no está disponible. Vuelve a esta página más tarde."}</p>
            {detail.materialAvailable && <button type="button" onClick={() => void openResource("material")} disabled={busy}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#01304a] px-5 py-3 font-semibold text-white disabled:opacity-50"><FileDown size={18} /> Abrir material</button>}
          </section>
          <section className="rounded-2xl border border-[#dce5e8] bg-white p-6">
            <Video className="text-[#db6d13]" size={28} />
            <h2 className="mt-4 text-xl font-semibold">Entrar a la reunión</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#526b79]">El botón estará disponible desde 10 minutos antes de empezar y durante el club.</p>
            {detail.meetingAvailable ? <button type="button" onClick={() => void openResource("meeting")} disabled={busy}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#f58a18] px-5 py-3 font-semibold disabled:opacity-50"><ExternalLink size={18} /> Entrar al club</button>
              : <p className="mt-5 text-sm font-semibold text-[#617a87]">Aún no es hora de entrar.</p>}
          </section>
        </div>}
        {detail.cancellationAvailable && <div className="mt-8 border-t border-[#dce5e8] pt-6 text-sm text-[#526b79]">
          <p>Si no puedes asistir, puedes liberar el lugar hasta 24 horas antes. La cortesía no se recupera.</p>
          <button type="button" onClick={() => { setCancelError(""); setCancelOpen(true); }} disabled={busy} className="mt-3 font-semibold text-red-700 underline underline-offset-4">Cancelar mi lugar</button>
        </div>}
      </>}
    </div>
    <AlertDialog open={cancelOpen} onOpenChange={open => { if (!busy) { setCancelOpen(open); if (!open) setCancelError(""); } }}>
      <AlertDialogContent className="guest-feedback-dialog guest-feedback-dialog--danger max-w-[min(92vw,34rem)] gap-0 overflow-hidden rounded-[1.5rem] border border-[#efc6bf] bg-white p-0 text-[#01304a]">
        <div className="guest-feedback-top guest-feedback-top--danger px-7 pb-7 pt-9 sm:px-9">
          <span className="guest-feedback-icon guest-feedback-icon--danger"><TriangleAlert size={30} aria-hidden="true" /></span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#b23e34]">Antes de cancelar</p>
          <AlertDialogTitle className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">¿Cancelar tu lugar?</AlertDialogTitle>
          <AlertDialogDescription className="mt-3 text-sm leading-relaxed text-[#526b79]">
            Liberarás tu asiento en <strong className="text-[#01304a]">{detail?.club.title}</strong>, pero tu código de cortesía ya fue utilizado y <strong className="text-[#9d3028]">no podrás reservar otro Club con él</strong>.
          </AlertDialogDescription>
        </div>
        <div className="space-y-3 px-7 pb-8 pt-6 sm:px-9">
          {cancelError && <p className="rounded-xl border border-[#e9b9b1] bg-[#fff3f0] p-3 text-sm text-[#9d3028]" role="alert">{cancelError}</p>}
          <button type="button" onClick={() => void cancel()} disabled={busy} className="guest-danger-action w-full rounded-xl px-5 py-3.5 font-semibold text-white disabled:opacity-60">
            {busy ? "Cancelando…" : "Sí, cancelar mi lugar"}
          </button>
          <AlertDialogCancel disabled={busy} className="m-0 w-full rounded-xl border border-[#dce5e8] bg-white px-5 py-3.5 font-semibold text-[#01304a] shadow-none hover:bg-[#f2f7f7]">No, conservar mi lugar</AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
