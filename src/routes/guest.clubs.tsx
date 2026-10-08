import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Clock3, LockKeyhole, Sparkles } from "lucide-react";
import { Logo } from "@/components/verbo/Logo";
import { guestRequest, type GuestClub } from "@/lib/guest-clubs-api";

export const Route = createFileRoute("/guest/clubs")({
  head: () => ({ meta: [{ title: "Explora Verbo Clubs" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: GuestClubsPage,
});

const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long",
}).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit",
}).format(new Date(value));

function GuestClubsPage() {
  const [clubs, setClubs] = useState<GuestClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<GuestClub | null>(null);
  const [code, setCode] = useState("");
  const [booking, setBooking] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(true);
  const [collection, setCollection] = useState<"all" | "insight" | "book">("all");

  useEffect(() => {
    guestRequest<{ clubs: GuestClub[] }>({ action: "catalog" })
      .then(result => setClubs(result.clubs))
      .catch(cause => setError(cause instanceof Error ? cause.message : "No pudimos cargar los clubes."))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => clubs.filter(club => collection === "all" || club.type === collection), [clubs, collection]);
  const reserve = async () => {
    if (!selected || booking) return;
    setBooking(true); setError("");
    try {
      const result = await guestRequest<{ booked: boolean; emailSent: boolean; email: string }>({
        action: "book", code, clubId: selected.id,
      });
      setConfirmationEmail(result.email);
      setEmailSent(result.emailSent);
      setSelected(null);
      setClubs(current => current.map(club => club.id === selected.id ? { ...club, guestSeatAvailable: false } : club));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos reservar tu lugar.");
    } finally { setBooking(false); }
  };

  return <main className="min-h-screen bg-[#f7f5f1] text-[#01304a]">
    <header className="border-b border-[#dce5e8] bg-white/95 px-5 py-4 sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Logo />
        <span className="rounded-full bg-[#e9f1f2] px-3 py-1 text-xs font-semibold tracking-wide">CLUBS · INVITADOS</span>
      </div>
    </header>
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-10">
      <div className="mb-8 max-w-3xl">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#db6d13]">Conversaciones que vale la pena vivir</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Explora Verbo Clubs</h1>
        <p className="mt-4 text-base leading-relaxed text-[#476171]">Elige el tema que te mueva. Tu invitación te permite reservar un encuentro; puedes seguir explorando los demás cuando quieras.</p>
      </div>
      {confirmationEmail && <section className="mb-8 rounded-2xl border border-[#91cba2] bg-[#effaf1] p-6" role="status">
        <h2 className="text-xl font-semibold">Tu lugar está confirmado</h2>
        <p className="mt-2">{emailSent ? `Enviamos los detalles y tu acceso a ${confirmationEmail}.` : `Reservamos tu lugar, pero el correo a ${confirmationEmail} no pudo enviarse. Contacta a Verbo para que te reenvíe el acceso.`}</p>
        <p className="mt-2 text-sm">Tu código ya fue utilizado y no permite otra reserva.</p>
      </section>}
      {error && <p className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}
      <div className="mb-7 flex flex-wrap gap-2" role="group" aria-label="Filtrar clubes">
        {([{ id: "all", label: "Todos" }, { id: "insight", label: "Insights" }, { id: "book", label: "Book Clubs" }] as const).map(item =>
          <button key={item.id} type="button" onClick={() => setCollection(item.id)} aria-pressed={collection === item.id}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${collection === item.id ? "bg-[#01304a] text-white" : "border border-[#cad8dc] bg-white hover:border-[#01304a]"}`}>{item.label}</button>) }
      </div>
      {loading ? <p className="py-16 text-center">Cargando próximos clubes…</p> : visible.length === 0 ?
        <p className="rounded-2xl border border-[#dae4e5] bg-white p-10 text-center">Por ahora no hay próximos clubes en esta colección.</p> :
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map(club =>
          <article key={club.id} className="overflow-hidden rounded-2xl border border-[#dce5e8] bg-white shadow-sm">
            <div className="relative h-48 overflow-hidden bg-[#0b3d59]">
              {club.cover_image ? <img src={club.cover_image} alt="" className="h-full w-full object-cover"
                style={{ objectPosition: `${club.cover_position_x ?? 50}% ${club.cover_position_y ?? 50}%`, transform: `scale(${club.cover_scale ?? 1})` }} />
                : <div className="flex h-full items-center justify-center text-white/70">{club.type === "book" ? <BookOpen size={54} /> : <Sparkles size={54} />}</div>}
              <span className="absolute bottom-3 left-4 rounded-full bg-white/95 px-3 py-1 text-xs font-bold">{club.type === "book" ? "BOOK CLUB" : "INSIGHT"}</span>
            </div>
            <div className="p-5">
              <h2 className="text-xl font-semibold">{club.title}</h2>
              {club.subtitle && <p className="mt-1 text-sm text-[#657b86]">{club.subtitle}</p>}
              <div className="mt-4 space-y-1 text-sm text-[#365568]">
                <p className="flex items-center gap-2"><CalendarDays size={16} /> {formatDate(club.date)}</p>
                <p className="flex items-center gap-2"><Clock3 size={16} /> {formatTime(club.date)} · Ciudad de México</p>
              </div>
              {club.description && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[#526b79]">{club.description}</p>}
              <button type="button" disabled={!club.guestSeatAvailable || Boolean(confirmationEmail)}
                onClick={() => { setSelected(club); setCode(""); setError(""); }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f58a18] px-4 py-3 font-semibold text-[#01304a] transition hover:bg-[#e97908] disabled:cursor-not-allowed disabled:bg-[#e4e9e9] disabled:text-[#637985]">
                {club.guestSeatAvailable ? <>Reservar con mi cortesía <ArrowRight size={17} /></> : "Cortesía no disponible"}
              </button>
            </div>
          </article>)}</div>}
      <p className="mt-10 flex items-center gap-2 text-sm text-[#647985]"><LockKeyhole size={15} /> La reservación requiere el código personal enviado por Verbo.</p>
    </div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001d2e]/70 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="guest-reserve-title">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#db6d13]">Una experiencia Verbo</p>
        <h2 id="guest-reserve-title" className="mt-2 text-2xl font-semibold">Reserva {selected.title}</h2>
        <p className="mt-2 text-sm text-[#526b79]">{formatDate(selected.date)} · {formatTime(selected.date)} (Ciudad de México)</p>
        <label htmlFor="guest-code" className="mt-6 block text-sm font-semibold">Código de cortesía</label>
        <input id="guest-code" autoComplete="off" maxLength={17} value={code} onChange={event => setCode(event.target.value.toUpperCase())}
          placeholder="ABCD-EFGH-JKLM" className="mt-2 w-full rounded-xl border border-[#bdcfd3] px-4 py-3 font-mono text-lg tracking-wide outline-none focus:border-[#f58a18]" />
        <p className="mt-4 text-sm leading-relaxed text-[#526b79]">Al confirmar, tu código se consume definitivamente, incluso si después cancelas. Los detalles y tu acceso llegarán al correo al que Verbo envió la invitación.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => setSelected(null)} className="rounded-xl px-4 py-3 font-semibold">Volver</button>
          <button type="button" onClick={reserve} disabled={booking || !code.trim()}
            className="rounded-xl bg-[#01304a] px-5 py-3 font-semibold text-white disabled:opacity-50">{booking ? "Reservando…" : "Confirmar reserva"}</button>
        </div>
      </section>
    </div>}
  </main>;
}
