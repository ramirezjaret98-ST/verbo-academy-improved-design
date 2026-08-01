import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, BookOpen, MessageCircle, X, Undo2, CalendarClock, User } from "lucide-react";
import { LogOut } from "lucide-react";
import { Card, GhostButton, PrimaryButton, SectionTitle, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
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

const CLUB_COVER_GRADIENT: Record<ClubType, string> = {
  insight: "linear-gradient(150deg, #dea3ee 0%, #c86fe1 55%, #a34ac0 100%)",
  book: "linear-gradient(150deg, #b2ece3 0%, #7cd7cb 55%, #3ebbad 100%)",
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
function typeBadge(t: ClubType) {
  return t === "insight"
    ? { label: "Insight", cls: "bg-accent/15 text-accent", Icon: Sparkles }
    : { label: "Book Club", cls: "bg-primary/10 text-primary", Icon: BookOpen };
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Clubs</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Claim upcoming Book Clubs and Verbo Insights, and manage the ones you’re already leading.
          </p>
        </div>
        <a
          href={PROPOSE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <MessageCircle className="h-4 w-4" /> Propose a Club Idea
        </a>
      </div>

      {banner && remaining > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">
          <div className="text-foreground">
            <strong>Club claimed!</strong> You can release it free of charge within{" "}
            <span className="font-mono font-semibold">{fmtMMSS(remaining)}</span>.
          </div>
          <PrimaryButton onClick={onFreeRelease}>
            <Undo2 className="h-3.5 w-3.5" /> Release
          </PrimaryButton>
        </div>
      )}

      {/* Sub-view switcher */}
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-secondary/40 p-1">
        {([
          { id: "available" as const, label: "Available Clubs" },
          { id: "mine" as const, label: "My Clubs" },
          { id: "reschedule_requests" as const, label: "Reschedule Requests" },
          { id: "spotlight_requests" as const, label: "Spotlight Requests" },
        ]).map((t) => {
          const badgeCount = t.id === "reschedule_requests"
            ? studentReqs.filter((r) => r.kind === "reschedule" && (r.status === "open" || r.status === "escalated")).length
            : t.id === "spotlight_requests"
              ? studentReqs.filter((r) => r.kind === "spotlight" && (r.status === "open" || r.status === "escalated")).length
              : 0;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all ${
                sub === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {badgeCount > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{badgeCount}</span>
              )}
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
        <>
          <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1 text-sm">
            {([
              { id: "all" as const, label: "All" },
              { id: "book" as const, label: "Book Clubs" },
              { id: "insight" as const, label: "Insights" },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`rounded-md px-3 py-1 font-medium transition-all ${
                  filter === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((c) => {
              const b = typeBadge(c.type);
              return (
                <Card key={c.id} className="!p-0 overflow-hidden flex flex-col">
                  <div className="relative aspect-video w-full" style={{ backgroundImage: CLUB_COVER_GRADIENT[c.type] }}>
                    {c.cover_image ? (
                      <div className="flex h-full items-center justify-center text-xs text-white/80">{c.cover_image}</div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/80">
                        <b.Icon className="h-10 w-10" />
                      </div>
                    )}
                    <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>
                      <b.Icon className="h-3 w-3" /> {b.label}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="text-sm font-semibold text-foreground">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(c.date)} · {c.duration_minutes} min</div>
                    <div className="text-xs text-muted-foreground">Enrolled: {c.spots_taken}{c.spots_total ? `/${c.spots_total}` : ""}</div>
                    <div className="mt-auto pt-3">
                      <PrimaryButton className="w-full justify-center" onClick={() => onClaim(c)}>
                        Claim
                      </PrimaryButton>
                    </div>
                  </div>
                </Card>
              );
            })}
            {available.length === 0 && (
              <Card className="sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-muted-foreground">No available clubs match this filter right now.</p>
              </Card>
            )}
          </div>
        </>
      )}

      {sub === "mine" && (
        <div className="space-y-3">
          {mine.length === 0 && (
            <Card><p className="text-sm text-muted-foreground">You haven’t claimed any clubs yet.</p></Card>
          )}
          {mine.map((c) => {
            const b = typeBadge(c.type);
            const claimedAt = c.claimed_at ? +new Date(c.claimed_at) : 0;
            const withinFree = claimedAt > 0 && Date.now() - claimedAt < FREE_RELEASE_WINDOW_MS;
            const pending = pendingByClub.has(c.id);
            return (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>
                    <b.Icon className="h-3 w-3" /> {b.label}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(c.date)} · {c.duration_minutes} min</div>
                  </div>
                </div>
                {pending ? (
                  <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-medium text-warning-foreground">Release requested</span>
                ) : withinFree ? (
                  <GhostButton disabled className="opacity-60">Within free release window</GhostButton>
                ) : (
                  <GhostButton onClick={() => setReleaseFor(c)}>Request Release</GhostButton>
                )}
              </Card>
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
  return type === "book"
    ? { background: "linear-gradient(135deg, #c2410c 0%, #000000 100%)", solid: "#c2410c", label: "Book Club" }
    : { background: "linear-gradient(135deg, #01304a 0%, #05070a 100%)", solid: "#01304a", label: "Insight" };
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
            <div>{club.type === "insight" ? "Insight" : "Book Club"} · {fmtDate(club.date)}</div>
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

  if (list.length === 0) {
    return (
      <Card><p className="text-sm text-muted-foreground">No {kind === "reschedule" ? "Reschedule" : "Spotlight"} Requests waiting to be claimed.</p></Card>
    );
  }

  const accent = kind === "reschedule" ? "#f38934" : "#0d9488";
  const KindIcon = kind === "reschedule" ? CalendarClock : Sparkles;

  return (
    <div className="space-y-3">
      <SectionTitle>{kind === "reschedule" ? "Reschedule Requests" : "Spotlight Requests"}</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => {
          const student = userById(r.student_id);
          const yourStudent = r.assigned_teacher_id === teacherId;
          const escalated = r.status === "escalated";
          return (
            <Card key={r.id} className="!p-0 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-3" style={{ background: `${accent}15` }}>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: accent }}>
                  <KindIcon className="h-3.5 w-3.5" />
                  {kind === "reschedule" ? "Reschedule" : "Spotlight"}
                </span>
                {yourStudent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                    <User className="h-3 w-3" /> Your Student
                  </span>
                )}
                {escalated && !yourStudent && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Unclaimed 8h+</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4 text-sm">
                <div className="font-semibold text-foreground">{student?.name ?? "Student"}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.proposed_datetime).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {r.duration_minutes} min
                </div>
                {kind === "spotlight" && r.spotlight_context && (
                  <div className="rounded-lg bg-secondary/50 px-3 py-2 text-[11px] text-foreground">
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Student's context</div>
                    {r.spotlight_context}
                  </div>
                )}
                {r.last_report_summary && (
                  <div className="text-[11px] text-muted-foreground">
                    <span className="font-semibold">Last covered:</span> {r.last_report_summary}
                  </div>
                )}
                <div className="mt-auto pt-3">
                  <PrimaryButton className="w-full justify-center" onClick={() => onClaim(r.id)}>
                    Claim
                  </PrimaryButton>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
