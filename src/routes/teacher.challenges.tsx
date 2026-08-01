import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, X, Play, Upload, ExternalLink, Check, RotateCcw, Ban } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  hydrateStudents,
  subscribeStudents,
  pendingSubmissionsForTeacher,
  approveSubmission,
  requestResubmission,
  rejectSubmission,
  type PendingSubmissionRow,
} from "@/lib/students-store";
import { Eye } from "lucide-react";
import { Card, Pill, GhostButton, AccentModal, AccentModalFooter } from "@/components/verbo/ui";
import { categoryTheme, categoryBackground } from "@/lib/challenge-theme";
import {
  type Challenge,
  type ChallengeProductId,
  type DifficultyId,
  PRODUCT_META,
  PRODUCT_ORDER,
  DIFFICULTY_META,
  DIFFICULTY_ORDER,
  loadChallenges,
  subscribeChallenges,
  challengesFor,
  categoryColor,
} from "@/lib/challenges-store";
import { loadFlashChallenges } from "@/lib/flash-challenges-store";

export const Route = createFileRoute("/teacher/challenges")({
  head: () => ({
    meta: [
      { title: "Challenges — Verbo Academy" },
      { name: "description", content: "Preview the full challenge bank across all products." },
    ],
  }),
  component: Page,
});

const GRADIENTS: Record<DifficultyId, string> = {
  esencial: "from-emerald-500 to-emerald-700",
  intermedio: "from-sky-500 to-sky-700",
  avanzado: "from-violet-500 to-violet-700",
  experto: "from-rose-500 to-rose-700",
};

function DifficultyDots({ difficulty }: { difficulty: DifficultyId }) {
  const { dots } = DIFFICULTY_META[difficulty];
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < dots ? "bg-white/90" : "border border-white/40 bg-transparent"}`}
        />
      ))}
    </span>
  );
}

function CategoryBadge({ name }: { name: string }) {
  if (!name) return <Pill tone="muted">No category</Pill>;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${categoryColor(name)}`}>
      {name}
    </span>
  );
}

function SkillChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function Page() {
  const [challenges, setChallenges] = useState<Challenge[]>(loadChallenges);
  const [productId, setProductId] = useState<ChallengeProductId>("go");
  const [difficulty, setDifficulty] = useState<DifficultyId | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [open, setOpen] = useState<Challenge | null>(null);
  const [view, setView] = useState<"catalog" | "reviews">("catalog");
  const { user } = useAuth();
  const teacherId = user?.id ?? "";
  const [pending, setPending] = useState<PendingSubmissionRow[]>([]);

  useEffect(() => {
    setChallenges(loadChallenges());
    return subscribeChallenges(() => setChallenges(loadChallenges()));
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    hydrateStudents();
    const refresh = () => setPending(pendingSubmissionsForTeacher(teacherId));
    refresh();
    return subscribeStudents(refresh);
  }, [teacherId]);

  const productChallenges = useMemo(
    () => challenges.filter((c) => c.product === productId),
    [challenges, productId],
  );

  const header = (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Challenges</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Browse the full challenge bank across all products — try any challenge without affecting any student's streak or badges.
      </p>
    </div>
  );

  const viewPicker = (
    <div className="flex flex-wrap items-center gap-2">
      {([["catalog", "Catalog"], ["reviews", "Pending Reviews"]] as const).map(([id, label]) => {
        const active = view === id;
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            {label}
            {id === "reviews" && pending.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
                {pending.length}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  if (view === "reviews") {
    return (
      <div className="space-y-6">
        {viewPicker}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Pending Reviews</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Review the challenge deliveries from your students. Approving a delivery is what awards the completion, streak and badges.
          </p>
        </div>
        {pending.length === 0 ? (
          <Card>
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nothing to review right now.
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {pending.map((row) => (
              <ReviewRow
                key={`${row.studentId}:${row.submission.challenge_id}`}
                row={row}
                challenges={challenges}
                teacherId={teacherId}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const productPicker = (
    <div className="flex flex-wrap items-center gap-2">
      {PRODUCT_ORDER.map((pid) => {
        const active = pid === productId;
        return (
          <button
            key={pid}
            onClick={() => { setProductId(pid); setDifficulty(null); setCategory("all"); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            {PRODUCT_META[pid].label}
          </button>
        );
      })}
    </div>
  );

  if (difficulty) {
    const list = challengesFor(challenges, productId, difficulty);
    const availableCategories = Array.from(
      new Set(list.map((c) => c.category).filter((c): c is string => !!c)),
    );
    const filtered = category === "all" ? list : list.filter((c) => c.category === category);
    const gradient = GRADIENTS[difficulty];

    return (
      <div className="space-y-6">
        {viewPicker}
        <div className="space-y-3">
          <GhostButton onClick={() => { setDifficulty(null); setCategory("all"); }}>
            <ArrowLeft className="h-3.5 w-3.5" /> All difficulties
          </GhostButton>
          <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-6 text-white shadow-soft`}>
            <div className="flex items-center gap-3">
              <DifficultyDots difficulty={difficulty} />
              <span className="text-xs uppercase tracking-[0.18em] text-white/70">
                {PRODUCT_META[productId].label} · {DIFFICULTY_META[difficulty].label}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {DIFFICULTY_META[difficulty].label} Challenges
            </h1>
            <p className="mt-1 text-sm text-white/80">
              {list.length} challenge{list.length === 1 ? "" : "s"} in this bank.
            </p>
          </div>
        </div>

        {availableCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCategory("all")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${category === "all" ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
            >
              All categories
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity ${categoryColor(cat)} ${category === cat ? "ring-2 ring-offset-1 ring-current" : "opacity-70 hover:opacity-100"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <Card>
            <div className="py-10 text-center text-sm text-muted-foreground">
              No challenges yet in this difficulty.
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpen(c)}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-soft verbo-lift hover:border-accent hover:shadow-elevated"
              >
                <div className="flex items-start justify-between gap-2">
                  <CategoryBadge name={c.category} />
                  <Pill tone="muted">Preview</Pill>
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{c.title}</div>
                  <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{c.description || "Tap to see the details."}</p>
                </div>
                {c.skill_tags && c.skill_tags.length > 0 && (
                  <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                    {c.skill_tags.map((s) => <SkillChip key={s} label={s} />)}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {open && <PreviewModal challenge={open} onClose={() => setOpen(null)} />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {viewPicker}
      {header}
      {productPicker}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Pick a difficulty to explore</h2>
        <p className="mt-1 text-sm text-muted-foreground">Showing challenges for {PRODUCT_META[productId].label}.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {DIFFICULTY_ORDER.map((d) => {
          const count = productChallenges.filter((c) => c.difficulty === d).length;
          const gradient = GRADIENTS[d];
          return (
            <button
              key={d}
              onClick={() => { setDifficulty(d); setCategory("all"); }}
              className={`group flex flex-col items-start gap-3 rounded-2xl bg-gradient-to-br ${gradient} p-6 text-left text-white shadow-soft verbo-lift hover:shadow-elevated`}
            >
              <DifficultyDots difficulty={d} />
              <div>
                <div className="text-lg font-semibold tracking-tight">{DIFFICULTY_META[d].label}</div>
                <div className="mt-1 text-xs text-white/80">{count} challenge{count === 1 ? "" : "s"}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewRow({
  row, challenges, teacherId,
}: { row: PendingSubmissionRow; challenges: Challenge[]; teacherId: string }) {
  const [mode, setMode] = useState<"none" | "again" | "reject">("none");
  const [feedback, setFeedback] = useState("");
  const { submission: s } = row;
  const ch = challenges.find((c) => c.id === s.challenge_id);
  const title =
    ch?.title ??
    loadFlashChallenges().find((c) => c.id === s.challenge_id)?.title ??
    s.challenge_id;

  const confirm = () => {
    const text = feedback.trim();
    if (!text) return;
    if (mode === "again") requestResubmission(row.studentId, s.challenge_id, teacherId, text);
    else rejectSubmission(row.studentId, s.challenge_id, teacherId, text);
    setMode("none");
    setFeedback("");
  };

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground">{row.studentName}</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground">{title}</span>
              {ch?.category && <CategoryBadge name={ch.category} />}
              {s.status === "needs_resubmission" && <Pill tone="muted">Awaiting new attempt</Pill>}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Submitted {new Date(s.submitted_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        <div className="space-y-2">
          <a
            href={s.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent underline underline-offset-2 hover:opacity-80"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open delivery
          </a>
          {s.note && (
            <p className="rounded-xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
              {s.note}
            </p>
          )}
        </div>

        {mode === "none" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => approveSubmission(row.studentId, s.challenge_id, teacherId)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              onClick={() => { setMode("again"); setFeedback(""); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try Again
            </button>
            <button
              onClick={() => { setMode("reject"); setFeedback(""); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/20"
            >
              <Ban className="h-3.5 w-3.5" /> Don't Approve
            </button>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
            <label className="block text-xs font-semibold text-foreground">
              {mode === "again" ? "What should the student fix?" : "Why is this not approved?"} (required)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
              placeholder="Write your feedback for the student…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={confirm}
                disabled={!feedback.trim()}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity ${
                  mode === "again" ? "bg-accent" : "bg-rose-600"
                } ${!feedback.trim() ? "cursor-not-allowed opacity-50" : "hover:opacity-90"}`}
              >
                {mode === "again" ? "Send back" : "Confirm not approved"}
              </button>
              <GhostButton onClick={() => { setMode("none"); setFeedback(""); }}>Cancel</GhostButton>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function PreviewModal({ challenge, onClose }: { challenge: Challenge; onClose: () => void }) {
  const theme = categoryTheme(challenge.category);
  return (
    <AccentModal
      maxWidth="max-w-xl"
      background={categoryBackground(challenge.category)}
      iconTint="rgba(255,255,255,0.18)"
      icon={Eye}
      eyebrow={`Preview · ${PRODUCT_META[challenge.product].label} · ${DIFFICULTY_META[challenge.difficulty].label}`}
      title={challenge.title}
      watermark={{ type: "icon", icon: Eye }}
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <CategoryBadge name={challenge.category} />
        <Pill tone="muted">Preview</Pill>
        {challenge.skill_tags?.map((s) => <SkillChip key={s} label={s} />)}
      </div>
      <div className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-foreground">
            {challenge.description || "No description available."}
          </p>
          {challenge.submission_instructions?.trim() && (
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Upload className="h-3 w-3" /> How to submit
              </div>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{challenge.submission_instructions}</p>
            </div>
          )}
          {challenge.video_url && (
            <a
              href={challenge.video_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary"
            >
              <Play className="h-3.5 w-3.5" /> Watch reference video
            </a>
          )}
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground">
            Preview mode — completing this challenge won't affect any student's streak, badges, or history.
          </div>
        </div>

      <AccentModalFooter accent={theme.solid}>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </AccentModalFooter>
    </AccentModal>
  );
}
