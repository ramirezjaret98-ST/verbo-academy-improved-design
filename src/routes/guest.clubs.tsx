import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, CalendarDays, Clock3, LockKeyhole, Sparkles } from "lucide-react";
import { Logo } from "@/components/verbo/Logo";
import { guestRequest, type GuestClub } from "@/lib/guest-clubs-api";
import "./guest.clubs.css";

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
const monthParts = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit",
});
const monthKey = (value: string) => {
  const parts = monthParts.formatToParts(new Date(value));
  return [parts.find(part => part.type === "year")?.value, parts.find(part => part.type === "month")?.value].join("-");
};
const formatMonth = (value: string) => {
  const label = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City", month: "long", year: "numeric",
  }).format(new Date(value));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const formatCardDate = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short",
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
  const months = useMemo(() => {
    const grouped = new Map<string, GuestClub[]>();
    [...visible].sort((a, b) => +new Date(a.date) - +new Date(b.date)).forEach(club => {
      const key = monthKey(club.date);
      grouped.set(key, [...(grouped.get(key) || []), club]);
    });
    return [...grouped.values()];
  }, [visible]);
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
        <div className="space-y-12">{months.map(monthClubs =>
          <section key={monthKey(monthClubs[0].date)} aria-label={formatMonth(monthClubs[0].date)}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2 border-b border-[#cbdadd] pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ce6a1c]">Próximos encuentros</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{formatMonth(monthClubs[0].date)}</h2>
              </div>
              <p className="text-sm font-medium text-[#607785]">{monthClubs.length} {monthClubs.length === 1 ? "encuentro" : "encuentros"}</p>
            </div>
            <div className="guest-month-grid">{monthClubs.map(club =>
              <article key={club.id} className={club.type === "insight" ? "guest-club-card guest-club-card--insight" : "guest-club-card guest-club-card--book"}>
                <div className="relative h-52 overflow-hidden bg-[#0b2f42]">
                  {club.cover_image ? <div className="guest-club-cover-zoom">
                    <img src={club.cover_image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover"
                      style={{ objectPosition: `${club.cover_position_x ?? 50}% ${club.cover_position_y ?? 50}%`, transform: `scale(${club.cover_scale ?? 1})` }} />
                  </div> : <div className="flex h-full items-center justify-center text-white/70">{club.type === "book" ? <BookOpen size={54} /> : <Sparkles size={54} />}</div>}
                  {club.type === "insight" && <div className="guest-insight-cover-copy">
                    <span>{club.title}</span>
                  </div>}
                  <span className="absolute bottom-3 left-4 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-[#01304a] shadow-sm">{club.type === "book" ? "BOOK CLUB" : "INSIGHT"}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-xl font-semibold leading-tight">{club.title}</h3>
                  {club.subtitle && <p className="mt-1 text-sm leading-snug text-[#657b86]">{club.subtitle}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <time dateTime={club.date} className={club.type === "insight" ? "guest-date-pill guest-date-pill--insight" : "guest-date-pill guest-date-pill--book"}>
                      <CalendarDays size={14} aria-hidden="true" /> {formatCardDate(club.date)}
                    </time>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#365568]"><Clock3 size={15} aria-hidden="true" /> {formatTime(club.date)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[#69808b]">Hora de Ciudad de México</p>
                  {club.description && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-[#526b79]">{club.description}</p>}
                  <div className="mt-auto pt-6">
                    <button type="button" disabled={!club.guestSeatAvailable || Boolean(confirmationEmail)}
                      onClick={() => { setSelected(club); setCode(""); setError(""); }}
                      className="guest-club-reserve flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-semibold">
                      {club.guestSeatAvailable ? <>Reservar con mi cortesía <ArrowRight size={17} aria-hidden="true" /></> : "Cortesía no disponible"}
                    </button>
                  </div>
                </div>
              </article>)}</div>
          </section>)}</div>}
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
