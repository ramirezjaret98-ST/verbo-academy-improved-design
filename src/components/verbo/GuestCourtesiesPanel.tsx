import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Gift, Mail, RotateCcw, ShieldX } from "lucide-react";
import { guestAdminRequest, type GuestAdminList } from "@/lib/guest-clubs-api";

const formatDate = (value: string) => new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));

export function GuestCourtesiesPanel() {
  const [data, setData] = useState<GuestAdminList | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const result = await guestAdminRequest<GuestAdminList>({ action: "list" });
    setData(result);
  };
  useEffect(() => { void refresh().catch(() => setError("No se pudieron cargar las cortesías.")); }, []);

  const run = async (body: Record<string, unknown>, success: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      await guestAdminRequest(body);
      await refresh();
      setMessage(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la acción.");
      return false;
    } finally { setBusy(false); }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) return;
    if (await run({ action: "create", name, email }, `Invitación enviada a ${email.trim()}.`)) {
      setName(""); setEmail("");
    }
  };

  return <section className="rounded-2xl border border-[#d7e1e6] bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d16d14]">Acceso por invitación</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-[#01304a]"><Gift size={21} /> Cortesías para invitados</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#5d7380]">Una invitación permite reservar un solo club y vence a los 7 días. La reserva consume el código definitivamente, incluso si después se cancela.</p>
      </div>
      <a href="/guest/clubs" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border border-[#b8cbd3] px-4 py-2 text-sm font-semibold text-[#01304a] hover:bg-[#f4f8f8]">Ver calendario de invitados <ArrowUpRight size={16} /></a>
    </div>
    <form onSubmit={event => void create(event)} className="mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <label className="text-sm font-semibold text-[#01304a]">Nombre del invitado
        <input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120}
          className="mt-1 block w-full rounded-lg border border-[#cbd8dd] px-3 py-2.5 font-normal outline-none focus:border-[#f58a18]" placeholder="Nombre" /></label>
      <label className="text-sm font-semibold text-[#01304a]">Correo del invitado
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254}
          className="mt-1 block w-full rounded-lg border border-[#cbd8dd] px-3 py-2.5 font-normal outline-none focus:border-[#f58a18]" placeholder="persona@correo.com" /></label>
      <button type="submit" disabled={busy} className="self-end rounded-lg bg-[#01304a] px-5 py-2.5 font-semibold text-white disabled:opacity-50">
        {busy ? "Procesando…" : "Crear y enviar"}</button>
    </form>
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
    {message && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800" role="status">{message}</p>}
    <div className="mt-7 border-t border-[#e2eaed] pt-5">
      <h3 className="font-semibold text-[#01304a]">Invitaciones recientes</h3>
      {!data ? <p className="mt-3 text-sm text-[#667c87]">Cargando…</p> : data.invitations.length === 0 ?
        <p className="mt-3 text-sm text-[#667c87]">Todavía no hay cortesías emitidas.</p> :
        <div className="mt-3 space-y-3">{data.invitations.map(invitation => {
          const booking = data.bookings.find(item => item.invitation_id === invitation.id);
          const club = booking && data.clubs.find(item => item.id === booking.club_id);
          const status = invitation.revoked_at ? "Revocada" : booking?.status === "cancelled" ? "Reserva cancelada" :
            booking?.status === "booked" ? "Reservada" : new Date(invitation.expires_at) <= new Date() ? "Vencida" : "Disponible";
          return <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e0e8eb] p-4 text-sm">
            <div>
              <p className="font-semibold text-[#01304a]">{invitation.guest_name} <span className="ml-2 rounded-full bg-[#e9f1f2] px-2 py-0.5 text-xs">{status}</span></p>
              <p className="mt-1 text-[#667c87]">{invitation.email}</p>
              <p className="mt-1 text-xs text-[#667c87]">{club ? `${club.title} · ${formatDate(club.date)}` : `Invitación hasta ${formatDate(invitation.expires_at)}`}</p>
              {booking?.status === "booked" && !booking.confirmation_sent_at && <p className="mt-1 text-xs font-semibold text-amber-700">Confirmación pendiente de envío</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {booking?.status === "booked" && !booking.confirmation_sent_at && !invitation.revoked_at && <button type="button" disabled={busy}
                onClick={() => void run({ action: "resendConfirmation", id: invitation.id }, "Acceso reenviado al correo registrado.")}
                className="inline-flex items-center gap-1 rounded-lg border border-[#bbced4] px-3 py-2 font-semibold disabled:opacity-50"><Mail size={15} /> Reenviar acceso</button>}
              {!invitation.revoked_at && <button type="button" disabled={busy}
                onClick={() => { if (window.confirm("¿Revocar esta cortesía y su acceso?")) void run({ action: "revoke", id: invitation.id }, "Cortesía revocada."); }}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 disabled:opacity-50"><ShieldX size={15} /> Revocar</button>}
            </div>
          </div>;
        })}</div>}
      <button type="button" onClick={() => void refresh().catch(() => setError("No se pudieron actualizar las cortesías."))}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#365b6f]"><RotateCcw size={14} /> Actualizar lista</button>
    </div>
  </section>;
}
