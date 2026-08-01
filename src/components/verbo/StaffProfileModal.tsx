import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth, validatePasswordComplexity } from "@/lib/auth";
import { setAvatar, useAvatar } from "@/lib/avatar-store";
import {
  MAX_HEADLINE_CHARS,
  MAX_SPECIALIZATIONS,
  rankLabel,
  roleLabelFor,
  saveStaffProfile,
  staffStats,
  tenureLabel,
  usePresence,
  useStaffProfile,
} from "@/lib/staff-profile-store";
import {
  PERSONALITY_TAG_OPTIONS,
  MAX_PERSONALITY_TAGS,
  saveStudentProfile,
  togglePersonalityTag,
  useStudentProfile,
} from "@/lib/student-profile-store";
import {
  loadBadges as loadProfileBadges,
  subscribeBadges as subscribeProfileBadges,
  isBadgeEarned,
  buildProfileBadgeContext,
  type BadgeDef as ProfileBadgeDef,
  type BadgeContext,
} from "@/lib/profile-badges-store";
import {
  loadEquippedBadgeIds,
  setEquippedBadgeIds,
  subscribeEquippedBadges,
  EQUIPPED_MAX,
} from "@/lib/equipped-profile-badges-store";
import { isBadgeManuallyGranted } from "@/lib/badge-override-store";
import { subscribeCourses } from "@/lib/product-courses-store";
import {
  getLeaderboardIdentity,
  setLeaderboardIdentity,
  type LeaderboardIdentityMode,
} from "@/lib/leaderboard-identity-store";
import { AchievementsGallery, BadgePickerModal, BadgeVisual } from "./ProfileModal";
import { Check, KeyRound, Pencil, Plus, Star, Users, Clock, ShieldCheck, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STAT_ICON = {
  rating: Star,
  students: Users,
  sessions: Clock,
  team: ShieldCheck,
} as const;

export function StaffProfileModal({ open, onOpenChange }: Props) {
  const { user, updateProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = useAvatar(user?.id);
  const online = usePresence(user?.id, true);
  const isStudent = user?.role === "student";

  const staffStored = useStaffProfile(user?.id);
  const studentStored = useStudentProfile(user?.id);
  const stored = isStudent ? studentStored : staffStored;

  const [headline, setHeadline] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [savedTick, setSavedTick] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  // Student-only extras
  const [gallery, setGallery] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [lbMode, setLbMode] = useState<LeaderboardIdentityMode>("real");
  const [lbNickname, setLbNickname] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const un1 = subscribeProfileBadges(bump);
    const un2 = subscribeEquippedBadges(bump);
    const un3 = subscribeCourses(bump);
    return () => { un1(); un2(); un3(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setHeadline(stored.headline);
    setTagDraft("");
    setPwOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setPwError(null);
    setPwDone(false);
    setSavedTick(false);
  }, [open, stored.headline]);

  useEffect(() => {
    if (!user || !isStudent) return;
    const cur = getLeaderboardIdentity(user.id);
    setLbMode(cur.mode);
    setLbNickname(cur.nickname);
  }, [user, isStudent, open]);

  const stats = useMemo(() => (user ? staffStats(user, tick) : []), [user, tick]);

  const badgeData = useMemo(() => {
    if (!user || !isStudent) {
      return { badges: [] as ProfileBadgeDef[], ctx: null as BadgeContext | null, earned: [] as ProfileBadgeDef[], equipped: [] as string[] };
    }
    const badges = loadProfileBadges();
    const ctx = buildProfileBadgeContext(user);
    const earned = badges.filter(
      (b) => isBadgeEarned(b, ctx) || isBadgeManuallyGranted(user.id, b.id, "profile"),
    );
    return { badges, ctx, earned, equipped: loadEquippedBadgeIds(user.id) };
  }, [user, isStudent, tick]);

  if (!user) return null;

  const initial = user.name?.[0] ?? "?";

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(user.id, String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const commitHeadline = () => {
    if (isStudent) saveStudentProfile(user.id, { headline });
    else saveStaffProfile(user.id, { headline });
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1400);
  };

  const specializations = isStudent ? studentStored.personalityTags : staffStored.specializations;

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    saveStaffProfile(user.id, { specializations: [...staffStored.specializations, t] });
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    saveStaffProfile(user.id, {
      specializations: staffStored.specializations.filter((s) => s !== tag),
    });
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    if (!current) return setPwError("Enter your current password.");
    if (next !== confirm) return setPwError("New passwords do not match.");
    const complexity = validatePasswordComplexity(next);
    if (complexity) return setPwError(complexity);
    const res = updateProfile({ currentPassword: current, newPassword: next });
    if (!res.ok) return setPwError(res.error);
    setPwDone(true);
    setCurrent("");
    setNext("");
    setConfirm("");
    setTimeout(() => setPwOpen(false), 900);
  };

  const chips = [roleLabelFor(user), rankLabel(user), tenureLabel(user)];

  // Equipped badge slots (students only)
  const slots: (ProfileBadgeDef | null)[] = Array.from({ length: EQUIPPED_MAX }, (_, i) => {
    const id = badgeData.equipped[i];
    if (!id) return null;
    return badgeData.earned.find((b) => b.id === id) ?? null;
  });

  const unequip = (badgeId: string) =>
    setEquippedBadgeIds(user.id, badgeData.equipped.filter((id) => id !== badgeId));

  const equip = (slotIndex: number, badgeId: string) => {
    const nextIds = [...badgeData.equipped];
    while (nextIds.length < EQUIPPED_MAX) nextIds.push("");
    nextIds[slotIndex] = badgeId;
    setEquippedBadgeIds(user.id, nextIds.filter(Boolean));
    setPickerSlot(null);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden rounded-[32px] border border-border/40 p-0 shadow-floating">
        <DialogTitle className="sr-only">My profile</DialogTitle>

        {/* Hero banner + avatar — kept outside the scroll container so the avatar overlap isn't clipped */}
        <div className="relative">
          {/* Hero banner — taller, calmer navy gradient with a single soft orange accent */}
          <div
            className="relative h-36 w-full"
            style={{
              background:
                "radial-gradient(circle at 85% 20%, color-mix(in oklab, var(--orange-500) 55%, transparent), transparent 46%), linear-gradient(135deg, var(--navy-700) 0%, var(--navy-600) 55%, var(--navy-500) 100%)",
            }}
          />

          {/* Avatar overlaps the banner bottom edge */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <div className="relative">
              <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-background shadow-floating">
                {avatar ? (
                  <img src={avatar} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-700 to-navy-500 text-2xl font-semibold text-primary-foreground">
                    {initial}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Change profile photo"
                className="verbo-profile-press absolute -right-1 bottom-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-orange-500 text-white shadow-md hover:bg-orange-600"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <span
                title={online ? "Online" : "Offline"}
                className={`absolute bottom-1.5 left-1 h-3.5 w-3.5 rounded-full border-2 border-background ${
                  online ? "bg-emerald-500" : "bg-zinc-400"
                }`}
              />
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
            </div>
          </div>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 pb-6 pt-12 sm:px-6">

          {/* Identity */}
          <div className="verbo-profile-section text-center" style={{ "--verbo-profile-i": 0 } as React.CSSProperties}>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{user.name}</h2>
            <p className="mt-1 text-sm font-light text-muted-foreground">{rankLabel(user)}</p>
          </div>

          {/* Chips */}
          <div className="verbo-profile-section mt-3 flex flex-wrap items-center justify-center gap-2" style={{ "--verbo-profile-i": 1 } as React.CSSProperties}>
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-soft"
              >
                {c}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div
            className="verbo-profile-section mt-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
            style={{ "--verbo-profile-i": 2 } as React.CSSProperties}
          >
            <div className="grid grid-cols-3 divide-x divide-border">
              {stats.map((s) => {
                const Icon = STAT_ICON[s.key];
                return (
                  <div key={s.key} className="flex flex-col items-center gap-1.5 px-2 first:pl-0 last:pr-0">
                    <Icon className="h-4 w-4 text-orange-500" strokeWidth={1.5} />
                    <div className="text-lg font-bold tracking-tight text-navy-700">{s.value}</div>
                    <div className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div
            className="verbo-profile-section mt-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
            style={{ "--verbo-profile-i": 3 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-700">
                {isStudent ? "Personality tags" : "Specializes in"}
              </div>
              {isStudent && (
                <div className="text-[11px] font-medium text-muted-foreground">
                  {specializations.length}/{MAX_PERSONALITY_TAGS}
                </div>
              )}
            </div>
            {isStudent ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {PERSONALITY_TAG_OPTIONS.map((tag) => {
                  const active = specializations.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      onClick={() => togglePersonalityTag(user.id, tag)}
                      className={`verbo-profile-chip cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium ${
                        active
                          ? "bg-navy-700 text-primary-foreground"
                          : "border border-border bg-secondary/50 text-muted-foreground hover:border-navy-200 hover:text-foreground"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {specializations.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      onClick={() => removeTag(tag)}
                      className="verbo-profile-press cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {specializations.length < MAX_SPECIALIZATIONS && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-secondary/30 px-2 py-1">
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addTag(); }
                      }}
                      placeholder="Add a focus area"
                      maxLength={40}
                      className="verbo-profile-input w-32 bg-transparent px-1 text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      aria-label="Add specialization"
                      className="verbo-profile-press cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Student-only: equipped badges + leaderboard identity */}
          {isStudent && (
            <>
              <div
                className="verbo-profile-section mt-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                style={{ "--verbo-profile-i": 4 } as React.CSSProperties}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-700">
                    Equipped badges
                  </span>
                  <button
                    type="button"
                    onClick={() => setGallery(true)}
                    className="verbo-profile-press cursor-pointer text-xs font-medium text-navy-700 underline-offset-4 hover:underline"
                  >
                    View all →
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {slots.map((b, i) =>
                    !b ? (
                      <button
                        key={`empty-${i}`}
                        type="button"
                        onClick={() => setPickerSlot(i)}
                        className="verbo-profile-press flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-secondary/40 px-2 py-3 text-xs text-muted-foreground transition-colors hover:border-orange-300 hover:text-foreground"
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.5} />
                        <span className="font-medium">Add</span>
                      </button>
                    ) : (
                      <div
                        key={b.id}
                        className="group relative flex flex-col items-center rounded-2xl bg-secondary/40 px-2 py-3 transition-colors hover:bg-secondary/60"
                      >
                        <button
                          type="button"
                          aria-label={`Unequip ${b.name}`}
                          onClick={() => unequip(b.id)}
                          className="verbo-profile-press absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <BadgeVisual badge={b} earned size="sm" />
                        <div className="mt-1.5 line-clamp-2 text-center text-[11px] font-medium text-foreground">
                          {b.name}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div
                className="verbo-profile-section mt-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
                style={{ "--verbo-profile-i": 5 } as React.CSSProperties}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-700">
                  Show on leaderboard as
                </div>
                <div className="mt-3 space-y-2">
                  <label className="verbo-profile-press flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/60">
                    <input
                      type="radio"
                      name="lb-mode"
                      className="mt-0.5 accent-navy-700"
                      checked={lbMode === "real"}
                      onChange={() => {
                        setLbMode("real");
                        setLeaderboardIdentity(user.id, { mode: "real", nickname: lbNickname });
                      }}
                    />
                    <span className="font-medium text-foreground">My name and photo</span>
                  </label>
                  <label className="verbo-profile-press flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/60">
                    <input
                      type="radio"
                      name="lb-mode"
                      className="mt-0.5 accent-navy-700"
                      checked={lbMode === "nickname"}
                      onChange={() => {
                        setLbMode("nickname");
                        setLeaderboardIdentity(user.id, { mode: "nickname", nickname: lbNickname });
                      }}
                    />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">Custom nickname</div>
                      {lbMode === "nickname" && (
                        <input
                          type="text"
                          value={lbNickname}
                          placeholder="Nickname"
                          onChange={(e) => {
                            const v = e.target.value;
                            setLbNickname(v);
                            setLeaderboardIdentity(user.id, { mode: "nickname", nickname: v });
                          }}
                          className="verbo-profile-input mt-2 w-full rounded-xl border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Headline */}
          <div
            className="verbo-profile-section mt-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
            style={{ "--verbo-profile-i": 6 } as React.CSSProperties}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-700">
                About me
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {headline.length}/{MAX_HEADLINE_CHARS}
              </span>
            </div>
            <textarea
              value={headline}
              maxLength={MAX_HEADLINE_CHARS}
              onChange={(e) => setHeadline(e.target.value)}
              onBlur={commitHeadline}
              rows={2}
              placeholder={
                isStudent
                  ? "Write a short phrase about yourself…"
                  : "Write a short phrase your students will see…"
              }
              className="verbo-profile-input mt-3 w-full resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            {savedTick && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <Check className="h-3.5 w-3.5" /> Saved
              </div>
            )}
          </div>

          {/* Password */}
          <div
            className="verbo-profile-section mt-5 rounded-2xl border border-border/60 bg-card p-4 shadow-soft"
            style={{ "--verbo-profile-i": 7 } as React.CSSProperties}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-700">
              Security
            </div>
            {!pwOpen ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setPwOpen(true)}
                  className="verbo-profile-press inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-navy-700 px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-navy-800"
                >
                  <KeyRound className="h-4 w-4" strokeWidth={1.5} /> Change password
                </button>
                <button
                  type="button"
                  className="verbo-profile-press flex-1 cursor-pointer rounded-full border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                >
                  Forgot password
                </button>
              </div>
            ) : (
              <form className="mt-3 space-y-3" onSubmit={submitPassword}>
                <input
                  type="password"
                  placeholder="Current password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="verbo-profile-input w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className="verbo-profile-input w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="verbo-profile-input w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground">
                  Use at least 4 characters, one uppercase letter and one number.
                </p>
                {pwError && <div className="text-xs font-medium text-destructive">{pwError}</div>}
                {pwDone && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Password updated
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="verbo-profile-press flex-1 cursor-pointer rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
                  >
                    Update password
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPwOpen(false); setPwError(null); }}
                    className="verbo-profile-press cursor-pointer rounded-full border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {isStudent && badgeData.ctx && (
      <>
        <AchievementsGallery
          open={gallery}
          onOpenChange={setGallery}
          badges={badgeData.badges}
          ctx={badgeData.ctx}
        />
        <BadgePickerModal
          open={pickerSlot !== null}
          onOpenChange={(v) => { if (!v) setPickerSlot(null); }}
          available={badgeData.earned.filter((b) => !badgeData.equipped.includes(b.id))}
          earnedCount={badgeData.earned.length}
          onPick={(id) => { if (pickerSlot !== null) equip(pickerSlot, id); }}
        />
      </>
    )}
    </>
  );
}
