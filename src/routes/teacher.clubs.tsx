import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, BookOpen, MessageCircle, Undo2, CalendarClock, User, Users, Clock, ArrowUpRight } from "lucide-react";
import { LogOut } from "lucide-react";
import { Card, GhostButton, PrimaryButton, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import {
  type Club, type ClubType, type ClubReleaseRequest,
  loadClubs, subscribeClubs, claimClub, releaseClub,
  loadReleaseRequests, subscribeReleaseRequests, addReleaseRequest,
  FREE_RELEASE_WINDOW_MS,
} from "@/lib/clubs-store";
import {
  loadStudentRequests, subscribeStudentRequests, claimStudentRequest,
  type StudentRequest,
} from "@/lib/student-requests-store";
import { userById } from "@/lib/mock-data";

export const Route = createFileRoute("/teacher/clubs")({ component: Page });

/** Visual identity per club type — deliberately far apart so the grid reads at a glance. */
const CLUB_IDENTITY: Record<ClubType, { label: string; Icon: typeof Sparkles; grad: string; solid: string; soft: string }> = {
  insight: {
    label: "Insight",
    Icon: Sparkles,
    grad: "linear-gradient(145deg, #6d28d9 0%, #4c1d95 52%, #1e1b4b 100%)",
    solid: "#6d28d9",
    soft: "rgba(109, 40, 217, 0.10)",
  },
  book: {
    label: "Book Club",
    Icon: BookOpen,
    grad: "linear-gradient(145deg, #9d2b52 0%, #6b1230 52%, #240715 100%)",
    solid: "#9d2b52",
    soft: "rgba(157, 43, 82, 0.10)",
  },
};

const PROPOSE_URL = "https://wa.me/522461152136?text=Hola!%20Quiero%20proponer%20una%20idea%20de%20club:%20";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtMMSS(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type SubView = "available" | "mine" | "reschedule_requests" | "spotlight_requests";
type Filter = "all" | ClubType;

function Page() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [requests, setRequests] = useState<ClubReleaseRequest[]>([]);
  const [studentReqs, setStudentReqs] = useState<StudentRequest[]>([]);
  const [sub, setSub] = useState<SubView>("available");
  const [filter, setFilter] = useState<Filter>("all");
  // Live "Release" banner state (last claim by this teacher in this tab).
  const [banner, setBanner] = useState<{ clubId: string; claimedAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [releaseFor, setReleaseFor] = useState<Club | null>(null);

  useEffect(() => {
    setClubs(loadClubs());
    setRequests(loadReleaseRequests());
    setStudentReqs(loadStudentRequests());
    const u1 = subscribeClubs(() => setClubs(loadClubs()));
    const u2 = subscribeReleaseRequests(() => setRequests(loadReleaseRequests()));
    const u3 = subscribeStudentRequests(() => setStudentReqs(loadStudentRequests()));
    return () => { u1(); u2(); u3(); };
  }, []);

  // Tick every second while banner is active.
  useEffect(() => {
    if (!banner) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [banner]);

  // Auto-dismiss banner when window elapses.
  useEffect(() => {
    if (!banner) return;
    const remaining = banner.claimedAt + FREE_RELEASE_WINDOW_MS - now;
    if (remaining <= 0) setBanner(null);
  }, [now, banner]);

  const available = useMemo(
    () => clubs
      .filter((c) => !c.teacher_id && c.status !== "completed" && c.status !== "cancelled")
      .filter((c) => filter === "all" || c.type === filter)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    [clubs, filter],
  );

  const mine = useMemo(
    () => clubs
      .filter((c) => user && c.teacher_id === user.id)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    [clubs, user],
  );

  const pendingByClub = useMemo(() => {
    const set = new Set<string>();
    requests.forEach((r) => set.add(r.club_id));
    return set;
  }, [requests]);

  if (!user) return null;

  const onClaim = (c: Club) => {
    const updated = claimClub(c.id, user.id);
    if (!updated) {
      toast.error("This club was just claimed by another teacher");
      setClubs(loadClubs());
      return;
    }
    setBanner({ clubId: c.id, claimedAt: +new Date(updated.claimed_at ?? new Date().toISOString()) });
    setNow(Date.now());
    toast.success("Club claimed!");
  };

  const onFreeRelease = () => {
    if (!banner) return;
    releaseClub(banner.clubId);
    setBanner(null);
    toast("Club released");
  };

  const onSubmitRelease = (club: Club, reason: string) => {
    addReleaseRequest({ club_id: club.id, teacher_id: user.id, reason });
    setReleaseFor(null);
    toast.success("Release request submitted for admin approval");
  };

  const remaining = banner ? banner.claimedAt + FREE_RELEASE_WINDOW_MS - now : 0;

  const rescheduleCount = studentReqs.filter((r) => r.kind === "reschedule" && (r.status === "open" || r.status === "escalated")).length;
  const spotlightCount = studentReqs.filter((r) => r.kind === "spotlight" && (r.status === "open" || r.status === "escalated")).length;

  const tabs = [
    { id: "available" as const, label: "Available", count: available.length },
    { id: "mine" as const, label: "My Clubs", count: mine.length },
    { id: "reschedule_requests" as const, label: "Reschedule", count: rescheduleCount, alert: rescheduleCount > 0 },
    { id: "spotlight_requests" as const, label: "Spotlight", count: spotlightCount, alert: spotlightCount > 0 },
  ];

  return (
    <div className="space-y-10">
      {/* ---------------- Masthead ---------------- */}
      <header
        className="verbo-club-in relative overflow-hidden rounded-[34px] px-7 py-8 sm:px-10 sm:py-10"
        style={{ background: "linear-gradient(140deg, #01304a 0%, #012234 55%, #05070a 100%)" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-10 select-none text-[190px] font-black leading-none tracking-tighter text-white/[0.05]"
        >
          CLUBS
        </span>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">Teacher Panel</div>
            <h1 className="mt-2 text-[34px] font-semibold leading-none tracking-tight text-white sm:text-[42px]">Clubs</h1>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Claim upcoming Book Clubs and Verbo Insights, and manage the ones you&rsquo;re already leading.
            </p>
          </div>

          <a
            href={PROPOSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="verbo-propose-cta group relative inline-flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-full bg-success px-6 py-3.5 text-sm font-semibold text-success-foreground"
          >
            <span aria-hidden className="verbo-propose-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-white/35 blur-[6px]" />
            <MessageCircle className="relative h-4 w-4" />
            <span className="relative">Propose a Club Idea</span>
            <ArrowUpRight className="relative h-4 w-4 opacity-70 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </header>

      {banner && remaining > 0 && (
        <div className="verbo-club-in flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success/10 px-5 py-4 text-sm">
          <div className="text-foreground">
            <strong>Club claimed!</strong> You can release it free of charge within{" "}
            <span className="font-mono font-semibold">{fmtMMSS(remaining)}</span>.
          </div>
          <PrimaryButton onClick={onFreeRelease}>
            <Undo2 className="h-3.5 w-3.5" /> Release
          </PrimaryButton>
        </div>
      )}

      {/* ---------------- Tabs — underline rail ---------------- */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-border">
        {tabs.map((t) => {
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`verbo-club-tab relative -mb-px flex items-center gap-2 pb-3.5 text-[15px] font-semibold ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  t.alert ? "bg-accent text-white" : active ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                }`}
              >
                {t.count}
              </span>
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[2px] origin-left rounded-full bg-primary transition-transform duration-200 ease-out"
                style={{ transform: `scaleX(${active ? 1 : 0})` }}
              />
            </button>
          );
        })}
      </div>

      {(sub === "reschedule_requests" || sub === "spotlight_requests") && user && (
        <StudentRequestsSection
          kind={sub === "reschedule_requests" ? "reschedule" : "spotlight"}
          teacherId={user.id}
          requests={studentReqs}
          onClaim={(id) => {
            const claimed = claimStudentRequest(id, user.id);
            if (!claimed) toast.error("This request was just claimed by another teacher");
            else toast.success("Request claimed and added to your calendar");
            setStudentReqs(loadStudentRequests());
          }}
        />
      )}

      {sub === "available" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: "all" as const, label: "All clubs" },
              { id: "book" as const, label: "Book Clubs" },
              { id: "insight" as const, label: "Insights" },
            ]).map((t) => {
              const active = filter === t.id;
              const tint = t.id === "all" ? "#01304a" : CLUB_IDENTITY[t.id].solid;
              return (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className="verbo-club-tab rounded-full border px-4 py-1.5 text-[13px] font-semibold"
                  style={
                    active
                      ? { background: tint, borderColor: tint, color: "#fff", boxShadow: `0 10px 24px -14px ${tint}` }
                      : { borderColor: "var(--border)", color: "var(--muted-foreground)" }
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {available.map((c, i) => {
              const id = CLUB_IDENTITY[c.type];
              const pct = c.spots_total ? Math.min(100, Math.round((c.spots_taken / c.spots_total) * 100)) : 0;
              return (
                <article
                  key={c.id}
                  className="verbo-club-poster verbo-club-in relative flex min-h-[268px] flex-col overflow-hidden rounded-[28px] text-white"
                  style={{ background: id.grad, animationDelay: `${Math.min(i, 8) * 55}ms`, boxShadow: `0 24px 50px -32px ${id.solid}` }}
                >
                  <id.Icon
                    aria-hidden
                    className="verbo-club-mark pointer-events-none absolute -right-8 -top-6 h-[190px] w-[190px] text-white/[0.13]"
                    strokeWidth={1}
                  />
                  <div className="relative flex flex-1 flex-col p-6">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-sm">
                        <id.Icon className="h-3 w-3" /> {id.label}
                      </span>
                    </div>

                    <h3 className="mt-5 max-w-[85%] text-[22px] font-semibold leading-[1.15] tracking-tight">
                      {c.title}
                    </h3>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/65">
                      <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{fmtDate(c.date)}</span>
                      <span>{c.duration_minutes} min</span>
                    </div>

                    <div className="mt-auto pt-6">
                      <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-white/65">
                        <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Enrolled</span>
                        <span className="font-mono text-[13px] font-semibold text-white tabular-nums">
                          {c.spots_taken}{c.spots_total ? <span className="text-white/45">/{c.spots_total}</span> : null}
                        </span>
                      </div>
                      {c.spots_total ? (
                        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/15">
                          <div
                            className="h-full rounded-full bg-white/80 transition-[width] duration-500 ease-out"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}

                      <button
                        onClick={() => onClaim(c)}
                        className="verbo-club-cta mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-sm font-semibold hover:bg-white"
                        style={{ color: id.solid }}
                      >
                        Claim this club
                        <ArrowUpRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {available.length === 0 && (
              <Card className="sm:col-span-2 xl:col-span-3">
                <p className="text-sm text-muted-foreground">No available clubs match this filter right now.</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {sub === "mine" && (
        <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-soft">
          {mine.length === 0 && (
            <p className="px-6 py-8 text-sm text-muted-foreground">You haven&rsquo;t claimed any clubs yet.</p>
          )}
          {mine.map((c, i) => {
            const id = CLUB_IDENTITY[c.type];
            const claimedAt = c.claimed_at ? +new Date(c.claimed_at) : 0;
            const withinFree = claimedAt > 0 && Date.now() - claimedAt < FREE_RELEASE_WINDOW_MS;
            const pending = pendingByClub.has(c.id);
            return (
              <div
                key={c.id}
                className={`verbo-club-row verbo-club-in relative flex flex-wrap items-center justify-between gap-4 py-5 pl-7 pr-6 hover:bg-secondary/40 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
                style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              >
                <span
                  aria-hidden
                  className="verbo-club-rail absolute inset-y-2 left-0 w-[3px] rounded-full"
                  style={{ background: id.solid }}
                />
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: id.soft, color: id.solid }}
                  >
                    <id.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-foreground">{c.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      <span style={{ color: id.solid }} className="font-semibold">{id.label}</span>
                      {" · "}{fmtDate(c.date)} · {c.duration_minutes} min
                    </div>
                  </div>
                </div>
                {pending ? (
                  <span className="rounded-full bg-warning/15 px-3 py-1 text-[11px] font-semibold text-warning-foreground">Release requested</span>
                ) : withinFree ? (
                  <GhostButton disabled className="opacity-60">Within free release window</GhostButton>
                ) : (
                  <GhostButton onClick={() => setReleaseFor(c)}>Request Release</GhostButton>
                )}
              </div>
            );
          })}
        </div>
      )}

      {releaseFor && (
        <RequestReleaseModal
          club={releaseFor}
          onClose={() => setReleaseFor(null)}
          onSubmit={(reason) => onSubmitRelease(releaseFor, reason)}
        />
      )}
    </div>
  );
}

/** Club identity, mirroring the Teacher Calendar club theme. */
function clubTheme(type: Club["type"]) {
  const id = CLUB_IDENTITY[type];
  return { background: id.grad, solid: id.solid, label: id.label };
}

function RequestReleaseModal({ club, onClose, onSubmit }: { club: Club; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const theme = clubTheme(club.type);
  return (
    <AccentModal
      background={theme.background}
      iconTint="rgba(255,255,255,0.18)"
      icon={LogOut}
      eyebrow={`Request Release · ${theme.label}`}
      title={club.title}
      watermark={{ type: "icon", icon: LogOut }}
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-5">
          <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{club.title}</div>
            <div>{theme.label} · {fmtDate(club.date)}</div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground">Reason</label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Optional — helps the admin decide.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Why you need to release this club…"
              className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            This does not release the club immediately — an admin will review your request. If approved, a penalty may be applied to your Financial adjustments.
          </p>
      </div>
      <AccentModalFooter accent={theme.solid}>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={() => onSubmit(reason.trim())}>Submit Request</PrimaryButton>
      </AccentModalFooter>
    </AccentModal>
  );
}

// ---------------------------------------------------------------------------
// Reschedule / Spotlight Requests — student-originated queues.
// ---------------------------------------------------------------------------
function StudentRequestsSection({
  kind, teacherId, requests, onClaim,
}: {
  kind: "reschedule" | "spotlight";
  teacherId: string;
  requests: StudentRequest[];
  onClaim: (id: string) => void;
}) {
  const list = useMemo(
    () => requests
      .filter((r) => r.kind === kind && (r.status === "open" || r.status === "escalated"))
      .sort((a, b) => {
        // Own-student first, then earliest requested_at.
        const aOwn = a.assigned_teacher_id === teacherId ? 0 : 1;
        const bOwn = b.assigned_teacher_id === teacherId ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        return +new Date(a.requested_at) - +new Date(b.requested_at);
      }),
    [requests, teacherId, kind],
  );

  const accent = kind === "reschedule" ? "#0f766e" : "#6d28d9";
  const KindIcon = kind === "reschedule" ? CalendarClock : Sparkles;
  const heading = kind === "reschedule" ? "Reschedule Requests" : "Spotlight Requests";

  if (list.length === 0) {
    return (
      <Card><p className="text-sm text-muted-foreground">No {heading} waiting to be claimed.</p></Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${accent}18`, color: accent }}>
          <KindIcon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{heading}</h2>
          <p className="text-xs text-muted-foreground">{list.length} waiting to be claimed</p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r, i) => {
          const student = userById(r.student_id);
          const yourStudent = r.assigned_teacher_id === teacherId;
          const escalated = r.status === "escalated";
          return (
            <article
              key={r.id}
              className="verbo-club-poster verbo-club-in relative flex flex-col overflow-hidden rounded-[26px] border border-border bg-card shadow-soft"
              style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
              <div className="flex items-center justify-between px-5 pt-5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: accent }}>
                  <KindIcon className="h-3.5 w-3.5" />
                  {kind === "reschedule" ? "Reschedule" : "Spotlight"}
                </span>
                {yourStudent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                    <User className="h-3 w-3" /> Your Student
                  </span>
                )}
                {escalated && !yourStudent && (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning-foreground">Unclaimed 8h+</span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 px-5 pb-5 pt-3 text-sm">
                <div className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">{student?.name ?? "Student"}</div>
                <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(r.proposed_datetime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {r.duration_minutes} min
                </div>
                {kind === "spotlight" && r.spotlight_context && (
                  <div className="mt-1 rounded-xl border-l-2 bg-secondary/50 px-3 py-2 text-[11px] text-foreground" style={{ borderColor: accent }}>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Student&rsquo;s context</div>
                    {r.spotlight_context}
                  </div>
                )}
                {r.last_report_summary && (
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-semibold">Last covered:</span> {r.last_report_summary}
                  </div>
                )}
                <div className="mt-auto pt-4">
                  <button
                    onClick={() => onClaim(r.id)}
                    className="verbo-club-cta inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white"
                    style={{ background: accent, boxShadow: `0 12px 26px -16px ${accent}` }}
                  >
                    Claim request
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
