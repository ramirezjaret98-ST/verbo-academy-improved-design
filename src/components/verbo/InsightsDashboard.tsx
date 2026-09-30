import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Pause, Play, Sparkles } from "lucide-react";
import { Card, PrimaryButton } from "@/components/verbo/ui";
import { loadClubs, subscribeClubs, type Club } from "@/lib/clubs-store";
import { bookingsForStudent, isBooked, resolvedMonthlyCap, resolvedRemainingSeats, subscribeBookings } from "@/lib/club-bookings-store";
import { ClubReservationModal } from "@/components/verbo/ClubReservationModal";

function dateLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** One source of content for student home and the admin's read-only preview. */
export function InsightsDashboard({ name, studentId, preview = false, onExplore }: {
  name: string;
  studentId?: string;
  preview?: boolean;
  onExplore?: () => void;
}) {
  const [, refresh] = useState(0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState<Club | null>(null);
  useEffect(() => {
    const bump = () => refresh((n) => n + 1);
    const a = subscribeClubs(bump);
    const b = subscribeBookings(bump);
    return () => { a(); b(); };
  }, []);

  const now = Date.now();
  const upcoming = loadClubs().filter((c) => c.type === "insight" && c.status !== "cancelled" && c.status !== "completed" && new Date(c.date).getTime() > now).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const bookings = studentId ? bookingsForStudent(studentId).filter((b) => b.club_type === "insight") : [];
  const reserved = upcoming.filter((c) => studentId && isBooked(studentId, c.id));
  const next = reserved[0];
  const discover = upcoming.filter((c) => !studentId || !isBooked(studentId, c.id));
  const activeIndex = discover.length ? index % discover.length : 0;
  const featured = discover[activeIndex];
  const cap = studentId ? resolvedMonthlyCap(studentId, "insight") : null;
  const remaining = studentId ? resolvedRemainingSeats(studentId, "insight") : null;
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const reservedThisMonth = bookings.filter((b) => { const d = new Date(b.booked_at); return d.getMonth() === month && d.getFullYear() === year; }).length;

  useEffect(() => {
    if (paused || hovered || discover.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((n) => n + 1), 6500);
    return () => window.clearInterval(timer);
  }, [paused, hovered, discover.length]);

  const explore = onExplore ? <button type="button" onClick={onExplore} className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">Explore the calendar <ArrowRight className="h-4 w-4" /></button> : <Link to="/student/insights" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline">Explore the calendar <ArrowRight className="h-4 w-4" /></Link>;

  return <div className="space-y-8">
    <section className="relative overflow-hidden rounded-3xl p-7 text-white shadow-floating md:p-10" style={{ background: "linear-gradient(120deg, #01304a, #075275 62%, #e87529 160%)" }}>
      <div className="absolute -right-10 -top-14 h-64 w-64 rounded-full border border-white/10" aria-hidden />
      <div className="relative grid gap-8 md:grid-cols-[1fr_230px] md:items-center">
        <div><div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-200"><Sparkles className="h-4 w-4" /> Your Verbo Insights space</div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{preview ? "Welcome to Verbo Insights." : `Good to see you, ${name}.`}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80">Find a topic worth talking about, reserve your place, and keep your next live Insight close at hand.</p>
          <div className="mt-6">{explore}</div>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/70">This month</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{preview ? "—" : remaining === Infinity ? "∞" : remaining ?? 0}<span className="ml-2 text-base font-normal text-white/70">{preview ? "preview" : cap === Infinity ? "available" : `of ${cap ?? 0} left`}</span></div>
          <p className="mt-2 text-xs text-white/70">{preview ? "Quota and reservations appear for each real student." : `${reservedThisMonth} reserved this month`}</p>
        </div>
      </div>
    </section>

    <section><div className="mb-4"><h2 className="text-xl font-semibold tracking-tight">Your next Insight</h2><p className="mt-1 text-sm text-muted-foreground">Your closest upcoming reservation.</p></div>
      <Card className="!p-6">{preview ? <p className="text-sm text-muted-foreground">A student's next reservation appears here. This preview does not use or alter a student account.</p> : next ? <div className="flex flex-wrap items-center justify-between gap-5"><div><span className="text-xs font-semibold uppercase tracking-wider text-accent">Seat reserved</span><h3 className="mt-1 text-lg font-semibold">{next.title}</h3><p className="mt-1 text-sm text-muted-foreground">{dateLabel(next.date)} · {next.duration_minutes} min</p>{next.topic_tag && <span className="mt-3 inline-block rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">{next.topic_tag}</span>}</div><PrimaryButton onClick={() => setSelected(next)}>View details</PrimaryButton></div> : <p className="text-sm text-muted-foreground">No Insight reserved yet. Choose one from the calendar.</p>}</Card>
    </section>

    <section aria-roledescription="carousel" aria-label="Upcoming Insights" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setHovered(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false); }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">Discover what's coming up</h2><p className="mt-1 text-sm text-muted-foreground">Live topics from the Academy calendar.</p></div>{explore}</div>
      {featured ? <Card className="!overflow-hidden !p-0"><div className="grid md:grid-cols-[42%_1fr]">
        <div className="relative flex min-h-56 items-end overflow-hidden bg-gradient-to-br from-[#01304a] via-[#075275] to-[#d86722] p-6">{featured.cover_image && <img src={featured.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" /><span className="relative rounded-full border border-white/40 bg-black/25 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">{featured.topic_tag || "Verbo Insight"}</span></div>
        <div className="flex flex-col justify-between gap-5 p-6 md:p-8"><div><div className="text-xs font-semibold uppercase tracking-widest text-accent">Upcoming Insight</div><h3 className="mt-2 text-2xl font-semibold tracking-tight">{featured.title}</h3><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">{featured.description || "Explore this live topic with your Verbo teacher."}</p><p className="mt-4 text-xs font-medium text-foreground">{dateLabel(featured.date)} · {featured.duration_minutes} min</p></div><div>{preview ? <span className="text-xs text-muted-foreground">Reservations are disabled in admin preview.</span> : <PrimaryButton onClick={() => setSelected(featured)}>View Insight <ArrowRight className="h-4 w-4" /></PrimaryButton>}</div></div>
      </div></Card> : <Card><p className="text-sm text-muted-foreground">New Insights will appear here as soon as they are published.</p></Card>}
      {discover.length > 1 && <div className="mt-4 flex items-center justify-between gap-4"><span className="text-xs tabular-nums text-muted-foreground">{activeIndex + 1} / {discover.length}</span><div className="flex gap-1" aria-label="Choose an Insight">{discover.map((c, n) => <button key={c.id} type="button" onClick={() => setIndex(n)} aria-label={`Show Insight ${n + 1}`} aria-current={n === activeIndex ? "true" : undefined} className={`h-2 rounded-full transition-all ${n === activeIndex ? "w-6 bg-accent" : "w-2 bg-border"}`} />)}</div><div className="flex items-center gap-2"><button type="button" onClick={() => setIndex((n) => (n - 1 + discover.length) % discover.length)} aria-label="Previous Insight" className="rounded-full border border-border p-2 hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setIndex((n) => n + 1)} aria-label="Next Insight" className="rounded-full border border-border p-2 hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button><button type="button" onClick={() => setPaused((v) => !v)} aria-label={paused ? "Resume carousel" : "Pause carousel"} className="rounded-full border border-border p-2 hover:bg-secondary">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button></div></div>}
    </section>
    <Card className="!p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-accent" /><div><h2 className="text-sm font-semibold">Explore Insights</h2><p className="text-xs text-muted-foreground">See every available date in the calendar.</p></div></div>{explore}</div></Card>
    {selected && studentId && <ClubReservationModal club={selected} studentId={studentId} onClose={() => setSelected(null)} />}
  </div>;
}
