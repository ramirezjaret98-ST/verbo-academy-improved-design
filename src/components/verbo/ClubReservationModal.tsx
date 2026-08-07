// Shared reservation modal for Verbo Insights and Book Clubs.
// Handles the <24h cutoff, X/month cap (individual, even for Group members)
// and both reserve + cancel actions. Same visual language as the Live
// Sessions modals (Card / PrimaryButton / GhostButton / semantic tokens).
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Users, CalendarClock, Clock, FileText, Video, X } from "lucide-react";
import { toast } from "sonner";
import type { Club } from "@/lib/clubs-store";
import { userById } from "@/lib/mock-data";
import {
  isBooked,
  bookingsThisMonth,
  monthlyCap,
  reserveBlockedReason,
  cancelBlockedReason,
  reserveSeat,
  cancelSeat,
  useBookings,
} from "@/lib/club-bookings-store";
import { AccentModalHeader, InfoStatRow, PrimaryButton } from "@/components/verbo/ui";

function fmtLong(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ClubReservationModal({
  club,
  studentId,
  onClose,
}: {
  club: Club;
  studentId: string;
  onClose: () => void;
}) {
  // Subscribe so the modal re-renders after reserve/cancel.
  useBookings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const booked = isBooked(studentId, club.id);
  const used = bookingsThisMonth(studentId, club.type);
  const cap = monthlyCap(studentId, club.type);
  const isSignature = userById(studentId)?.access_plan === "Signature";
  const capDisplay = isSignature || !isFinite(cap) ? "∞" : String(cap);
  const teacher = club.teacher_id ? userById(club.teacher_id) : null;


  const reserveBlocked = useMemo(
    () => (booked ? null : reserveBlockedReason(studentId, club)),
    [booked, studentId, club],
  );
  const cancelBlocked = useMemo(
    () => (booked ? cancelBlockedReason(club) : null),
    [booked, club],
  );

  const isBook = club.type === "book";

  // "Connect" activates 5 minutes before the club starts, until it ends.
  const connectOpen = useMemo(() => {
    const start = new Date(club.date).getTime();
    const now = Date.now();
    return now >= start - 5 * 60 * 1000 && now <= start + club.duration_minutes * 60 * 1000;
  }, [club.date, club.duration_minutes]);
  // Matches calendarEventTheme() for book_club / insight so the modal reads as
  // the same entity as its calendar pill.
  const accent = isBook ? "#c2410c" : "#01304a";

  const label = isBook ? "Book Club" : "Verbo Insight";

  const seatsPct = club.spots_total ? Math.min(100, Math.round(((club.spots_taken ?? 0) / club.spots_total) * 100)) : 0;

  const onReserve = async () => {
    setBusy(true);
    setError(null);
    const res = await reserveSeat(studentId, club.id);
    setBusy(false);
    if (!res.ok) { setError(res.reason); return; }
    toast.success("Seat reserved. See you there!");
  };
  const onCancel = async () => {
    setBusy(true);
    setError(null);
    const res = await cancelSeat(studentId, club.id);
    setBusy(false);
    if (!res.ok) { setError(res.reason); return; }
    toast("Reservation cancelled.");
  };

  const HeaderIcon = isBook ? FileText : Users;
  const headerBg = isBook
    ? "linear-gradient(135deg, #c2410c 0%, #000000 100%)"
    : "linear-gradient(135deg, #01304a 0%, #05070a 100%)";
  const dateShort = new Date(club.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeShort = new Date(club.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div
      className="verbo-overlay-in fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-floating"
      >
        {club.cover_image ? (
          <div className="relative h-32 w-full overflow-hidden">
            <img
              src={club.cover_image}
              alt=""
              className="h-full w-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.08) 100%)" }}
              aria-hidden
            />
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <HeaderIcon className="h-5 w-5" style={{ color: accent }} />
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-full border border-white/40 p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                  {label}
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                  {club.title}
                </h2>
              </div>
            </div>
          </div>
        ) : (
          <AccentModalHeader
            background={headerBg}
            iconTint={accent}
            icon={HeaderIcon}
            eyebrow={label}
            title={club.title}
            watermark={{ type: "icon", icon: HeaderIcon }}
            onClose={onClose}
          />
        )}

        <div className="p-6">
        <div className="min-w-0">
          {booked && (
            <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" /> You're in
            </span>
          )}
          <h3 className="text-lg font-semibold tracking-tight" style={{ color: "#01304a" }}>
            {club.title}
          </h3>
          {club.description && (
            <p className="mt-1 text-sm text-muted-foreground">{club.description}</p>
          )}
        </div>


        <div className="mt-4">
          <InfoStatRow
            items={[
              { icon: CalendarClock, value: dateShort, label: "Date", tint: accent },
              { icon: Clock, value: timeShort, label: "Time", tint: accent },
              { icon: Users, value: `${club.spots_taken ?? 0}/${club.spots_total}`, label: "Seats", tint: accent },
            ]}
          />
        </div>

        {(teacher || club.material) && (
          <div className="mt-4 space-y-2 text-sm">
            {teacher && <Row icon={<Video className="h-4 w-4" />} label="Host" value={teacher.name} />}
            {club.material && (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="h-4 w-4" />Material
                </span>
                <a
                  href={club.material}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-right font-medium text-accent underline-offset-2 hover:underline"
                >
                  View pre-club material
                </a>
              </div>
            )}
          </div>
        )}


        {/* Seat meter */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Seats
            </span>
            <span className="font-semibold text-foreground">
              {club.spots_taken ?? 0} / {club.spots_total}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${seatsPct}%`, background: accent }}
            />
          </div>
        </div>

        {/* Rules */}
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
          <div>Reservations close 24h before start.</div>
          <div className="mt-0.5">
            {isSignature || !isFinite(cap)
              ? <>You have <strong>unlimited</strong> {isBook ? "Book Clubs" : "Insights"} this month.</>
              : <>You've used <strong>{used} of your {capDisplay}</strong> {isBook ? "Book Clubs" : "Insights"} this month.</>}
          </div>
        </div>


        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6">
          {booked ? (
            <>
              {connectOpen ? (
                <PrimaryButton
                  className="w-full justify-center verbo-btn-glow"
                  style={{ backgroundColor: accent, boxShadow: `0 8px 20px -6px ${accent}` }}
                  onClick={() => club.link && window.open(club.link, "_blank")}
                >
                  <Video className="h-4 w-4" /> Connect
                </PrimaryButton>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Activates 5 minutes before your session."
                  className="w-full inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground"
                >
                  <Video className="h-4 w-4" /> Connect
                </button>
              )}
              <div className="mt-3 text-center">
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={onCancel}
                  disabled={busy || !!cancelBlocked}
                  title={cancelBlocked ?? undefined}
                >
                  {cancelBlocked ? cancelBlocked : busy ? "Cancelling…" : "Cancel reservation"}
                </button>
              </div>
            </>
          ) : (
            <>
              <PrimaryButton
                className="w-full justify-center"
                style={{ backgroundColor: accent, boxShadow: `0 8px 20px -6px ${accent}` }}
                onClick={onReserve}
                disabled={busy || !!reserveBlocked}
                title={reserveBlocked ?? undefined}
              >
                {reserveBlocked ? reserveBlocked : busy ? "Reserving…" : "Reserve seat"}
              </PrimaryButton>
              <div className="mt-3 text-center">
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
        </div>

      </div>
    </div>
  );
}


function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
