// Shared reservation modal for Verbo Insights and Book Clubs.
// Handles the <24h cutoff, X/month cap (individual, even for Group members)
// and both reserve + cancel actions. Same visual language as the Live
// Sessions modals (Card / PrimaryButton / GhostButton / semantic tokens).
import { useEffect, useMemo, useState } from "react";
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
import { getInsightReport, getClubAttendanceForStudent, subscribeClubReports } from "@/lib/club-reports-store";
import { openClubMaterial } from "@/lib/club-media";

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
  preview = false,
}: {
  club: Club;
  studentId: string;
  onClose: () => void;
  preview?: boolean;
}) {
  // Subscribe so the modal re-renders after reserve/cancel.
  useBookings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const [, refreshReport] = useState(0);
  useEffect(() => subscribeClubReports(() => refreshReport((n) => n + 1)), []);

  const booked = !preview && isBooked(studentId, club.id);
  const outcome = booked ? getClubAttendanceForStudent(club.id, studentId) : undefined;
  const report = booked && club.type === "insight" ? getInsightReport(club.id) : undefined;
  const used = bookingsThisMonth(studentId, club.type);
  const cap = monthlyCap(studentId, club.type);
  const isCore = userById(studentId)?.access_plan === "Core";
  const isSignature = userById(studentId)?.access_plan === "Signature";
  const capDisplay = isSignature || !isFinite(cap) ? "∞" : String(cap);
  const teacher = club.teacher_id ? userById(club.teacher_id) : null;


  // The interval refreshes the cutoff and meeting state while this dialog is open.
  const reserveBlocked = booked ? null : reserveBlockedReason(studentId, club);
  const cancelBlocked = booked ? cancelBlockedReason(club) : null;

  const isBook = club.type === "book";

  // The join action updates while the modal stays open.
  const connectOpen = useMemo(() => {
    const start = new Date(club.date).getTime();
    return now >= start - 10 * 60 * 1000 && now <= start + club.duration_minutes * 60 * 1000;
  }, [club.date, club.duration_minutes, now]);
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
  const titleFontClass = club.title_font === "serif" ? "font-serif" : club.title_font === "display" ? "font-black uppercase tracking-wide" : "font-semibold";
  const openMaterial = async () => {
    if (!club.material) return;
    setMaterialError(null);
    try { await openClubMaterial(club.material); }
    catch (cause) { setMaterialError(cause instanceof Error ? cause.message : "Could not open the PDF."); }
  };

  return (
    <div
      className={`verbo-overlay-in fixed inset-0 flex items-center justify-center verbo-backdrop p-4 ${preview ? "z-[60]" : "z-50"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={club.title}
        className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card shadow-floating"
      >
        {club.cover_image ? (
          <div className="relative h-[280px] w-full overflow-hidden bg-[#092637] sm:h-[370px]">
            <div
              aria-hidden
              className="absolute inset-[-12%] bg-cover bg-center opacity-60 blur-3xl"
              style={{ backgroundImage: `url("${club.cover_image}")` }}
            />
            <img
              src={club.cover_image}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              style={{ objectPosition: `${club.cover_position_x ?? 50}% ${club.cover_position_y ?? 50}%` }}
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to bottom, transparent 0%, transparent 46%, color-mix(in oklab, var(--card) 12%, transparent) 61%, var(--card) 100%)" }}
              aria-hidden
            />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
              <div className="rounded-full border border-white/35 bg-[#072637]/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur-md">
                {label}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-[#072637]/70 text-white backdrop-blur-md transition hover:scale-105 hover:bg-[#072637]">
                <X className="h-4 w-4" />
              </button>
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

        <div className={club.cover_image ? "-mt-12 relative px-6 pb-7 pt-0 sm:px-9" : "p-6 sm:px-9"}>
        <div className="min-w-0">
          {club.status === "completed" && booked && <div className={`mb-3 rounded-lg px-3 py-2 text-xs font-medium ${outcome === "present" ? "bg-green-50 text-green-800" : outcome === "absent" ? "bg-red-50 text-red-800" : "bg-secondary text-muted-foreground"}`}>{outcome === "present" ? "Completed · You attended" : outcome === "absent" ? "Absent · Your teacher recorded no attendance" : "This Insight has finished. Attendance is pending."}</div>}
          {booked && (
            <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" /> You're in
            </span>
          )}
          <h3 className={`text-3xl leading-tight sm:text-4xl ${titleFontClass}`} style={{ color: "#01304a" }}>
            {club.title}
          </h3>
          {club.subtitle && <p className="mt-2 text-base font-medium text-[#a8582c]">{club.subtitle}</p>}
          {club.description && (
            <p className="mt-1 text-sm text-muted-foreground">{club.description}</p>
          )}
          {club.instructions && <section className="mt-4 rounded-xl bg-secondary/50 p-3"><h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Instructions</h4><p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{club.instructions}</p></section>}
          {club.topic_tag && <span className="mt-3 inline-block rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">{club.topic_tag}</span>}
          {club.status === "completed" && booked && report?.comments && <div className="mt-4 rounded-xl bg-secondary/50 p-3"><div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Teacher's group notes</div><p className="mt-1 text-sm text-foreground">{report.comments}</p></div>}
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
                  <FileText className="h-4 w-4" />Before you join
                </span>
                <button
                  type="button"
                  onClick={() => void openMaterial()}
                  className="truncate text-right font-medium text-accent underline-offset-2 hover:underline"
                >
                  Check this before you join
                </button>
              </div>
            )}
          </div>
        )}
        {materialError && <p role="alert" className="mt-2 text-xs text-red-700">{materialError}</p>}


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
          {preview ? <div className="mt-0.5">Admin preview: reservation controls and personal quota are hidden.</div> : <div className="mt-0.5">
            {isCore && cap === 0
              ? <>Core courtesy access applies while your credit is available.</>
              : isSignature || !isFinite(cap)
              ? <>You have <strong>unlimited</strong> {isBook ? "Book Clubs" : "Insights"} this month.</>
              : <>You've used <strong>{used} of your {capDisplay}</strong> {isBook ? "Book Clubs" : "Insights"} this month.</>}
          </div>}
        </div>


        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6">
          {preview ? <><div className="grid grid-cols-2 gap-2"><button type="button" disabled className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground">Reserve seat</button><button type="button" disabled className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground">Join the conversation</button></div><PrimaryButton className="mt-3 w-full justify-center" onClick={onClose}>Close preview</PrimaryButton></> : club.status === "completed" ? <PrimaryButton className="w-full justify-center" onClick={onClose}>Close</PrimaryButton> : booked ? (
            <>
              {connectOpen && club.link ? (
                <PrimaryButton
                  className="w-full justify-center verbo-btn-glow"
                  style={{ backgroundColor: accent, boxShadow: `0 8px 20px -6px ${accent}` }}
                  onClick={() => club.link && window.open(club.link, "_blank", "noopener,noreferrer")}
                >
                  <Video className="h-4 w-4" /> Join the conversation
                </PrimaryButton>
              ) : (
                <span className="block" title={club.link ? "Available 10 minutes before the session starts." : "The meeting link is not available yet."} tabIndex={0}>
                  <button type="button" disabled className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
                    <Video className="h-4 w-4" /> Join the conversation
                  </button>
                </span>
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
