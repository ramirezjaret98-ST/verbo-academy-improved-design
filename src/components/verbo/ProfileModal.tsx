import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { Award, Lock, Camera, Plus, X } from "lucide-react";
import { setAvatar, useAvatar } from "@/lib/avatar-store";
import {
  getLeaderboardIdentity,
  setLeaderboardIdentity,
  type LeaderboardIdentityMode,
} from "@/lib/leaderboard-identity-store";
import {
  loadBadges as loadProfileBadges,
  subscribeBadges as subscribeProfileBadges,
  isBadgeEarned,
  buildProfileBadgeContext,
  BADGE_METRIC_META,
  type BadgeDef as ProfileBadgeDef,
  type BadgeContext,
} from "@/lib/profile-badges-store";
import {
  loadEquippedBadgeIds,
  setEquippedBadgeIds,
  subscribeEquippedBadges,
  EQUIPPED_MAX,
} from "@/lib/equipped-profile-badges-store";
import { subscribeCourses, computeCurrentProgress } from "@/lib/product-courses-store";
import { isBadgeManuallyGranted } from "@/lib/badge-override-store";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function BadgeVisual({ badge, earned, size = "md" }: { badge: ProfileBadgeDef; earned: boolean; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-12 w-12" : "h-14 w-14";
  const icon = size === "lg" ? "h-8 w-8" : size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const gradient = earned
    ? "bg-gradient-to-br from-[#01304a] to-[#0a4a6e] text-white"
    : "bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-600 grayscale";
  if (badge.image) {
    return (
      <img
        src={badge.image}
        alt={badge.name}
        className={`${box} rounded-full object-cover shadow-inner ${earned ? "" : "grayscale opacity-70"}`}
      />
    );
  }
  return (
    <span className={`${box} flex items-center justify-center rounded-full shadow-inner ${gradient}`}>
      <Award className={icon} />
    </span>
  );
}

function useProfileBadges(userId: string | undefined): {
  badges: ProfileBadgeDef[];
  ctx: BadgeContext | null;
  earned: ProfileBadgeDef[];
  equipped: string[];
} {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const un1 = subscribeProfileBadges(bump);
    const un2 = subscribeEquippedBadges(bump);
    const un3 = subscribeCourses(bump);
    return () => { un1(); un2(); un3(); };
  }, []);
  return useMemo(() => {
    if (!user || !userId) return { badges: [], ctx: null, earned: [], equipped: [] };
    const badges = loadProfileBadges();
    const ctx = buildProfileBadgeContext(user);
    const earned = badges.filter((b) => isBadgeEarned(b, ctx) || isBadgeManuallyGranted(userId, b.id, "profile"));
    const equipped = loadEquippedBadgeIds(userId);
    return { badges, ctx, earned, equipped };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userId, tick]);
}

export function ProfileModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [gallery, setGallery] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatar = useAvatar(user?.id);

  const [lbMode, setLbMode] = useState<LeaderboardIdentityMode>("real");
  const [lbNickname, setLbNickname] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCourses(() => setTick((t) => t + 1)), []);

  const { badges, ctx, earned, equipped } = useProfileBadges(user?.id);
  const progress = user
    ? computeCurrentProgress(user.id, user.product, user.contracted_levels ?? [], tick)
    : null;

  useEffect(() => {
    if (!user) return;
    const cur = getLeaderboardIdentity(user.id);
    setLbMode(cur.mode);
    setLbNickname(cur.nickname);
  }, [user, open]);

  if (!user || !ctx) return null;
  const initial = user.name?.[0] ?? "?";

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(user.id, String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const slots: (ProfileBadgeDef | null)[] = Array.from({ length: EQUIPPED_MAX }, (_, i) => {
    const id = equipped[i];
    if (!id) return null;
    return earned.find((b) => b.id === id) ?? null;
  });

  const unequip = (badgeId: string) => {
    const next = equipped.filter((id) => id !== badgeId);
    setEquippedBadgeIds(user.id, next);
  };
  const equip = (slotIndex: number, badgeId: string) => {
    const next = [...equipped];
    while (next.length < EQUIPPED_MAX) next.push("");
    next[slotIndex] = badgeId;
    setEquippedBadgeIds(user.id, next.filter(Boolean));
    setPickerSlot(null);
  };

  const availableForPicker = earned.filter((b) => !equipped.includes(b.id));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="grid gap-0 md:grid-cols-2">
            {/* LEFT */}
            <div className="border-r border-border bg-secondary/30 p-6">
              <DialogTitle className="text-base font-semibold text-foreground">My Profile</DialogTitle>

              <div className="mt-5 flex flex-col items-center">
                <div
                  className="group relative h-24 w-24 cursor-pointer overflow-hidden rounded-full shadow-md"
                  onClick={() => fileRef.current?.click()}
                >
                  {avatar ? (
                    <img src={avatar} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#01304a] to-[#0a4a6e] text-3xl font-semibold text-white">
                      {initial}
                    </div>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="mb-1 h-4 w-4" />
                    Change Photo
                  </div>
                  <input
                    ref={fileRef}
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPick}
                  />
                </div>
                <div className="mt-3 text-center">
                  <div className="text-base font-semibold text-foreground">{user.name}</div>
                  {user.company && (
                    <div className="text-xs text-muted-foreground">
                      {user.company} · {user.hired_plan}
                    </div>
                  )}
                </div>
              </div>

              <form
                className="mt-6 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  onOpenChange(false);
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Change Password
                </div>
                {["Current Password", "New Password", "Confirm New Password"].map((p) => (
                  <input
                    key={p}
                    type="password"
                    placeholder={p}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                ))}
                <button
                  type="submit"
                  className="w-full cursor-pointer rounded-lg bg-[#f38934] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#e07a25]"
                >
                  Update Profile
                </button>
              </form>
            </div>

            {/* RIGHT */}
            <div className="p-6">
              <div className="text-base font-semibold text-foreground">Equipped Badges</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Showcase up to three achievements on your profile.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {slots.map((b, i) => {
                  if (!b) {
                    return (
                      <button
                        key={`empty-${i}`}
                        type="button"
                        onClick={() => setPickerSlot(i)}
                        className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-secondary/20 p-3 text-xs text-muted-foreground transition-colors hover:border-[#f38934]/50 hover:text-foreground"
                      >
                        <Plus className="h-5 w-5" />
                        <span className="font-medium">Add</span>
                      </button>
                    );
                  }
                  return (
                    <div
                      key={b.id}
                      className="group relative flex flex-col items-center rounded-xl border border-border bg-card p-3"
                    >
                      <button
                        type="button"
                        aria-label={`Unequip ${b.name}`}
                        onClick={() => unequip(b.id)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-white group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <BadgeVisual badge={b} earned size="md" />
                      <div className="mt-2 text-center text-[11px] font-medium text-foreground line-clamp-2">
                        {b.name}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setGallery(true)}
                className="mt-5 cursor-pointer text-sm font-medium text-[#01304a] underline-offset-4 hover:underline"
              >
                View all achievements →
              </button>

              <div className="mt-6 rounded-xl border border-border bg-card p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Show on leaderboard as
                </div>
                <div className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-sm">
                    <input
                      type="radio"
                      name="lb-mode"
                      className="mt-0.5"
                      checked={lbMode === "real"}
                      onChange={() => {
                        setLbMode("real");
                        setLeaderboardIdentity(user.id, { mode: "real", nickname: lbNickname });
                      }}
                    />
                    <span className="font-medium text-foreground">My name and photo</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-background p-2.5 text-sm">
                    <input
                      type="radio"
                      name="lb-mode"
                      className="mt-0.5"
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
                          className="mt-2 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-8 rounded-xl border border-dashed border-border bg-secondary/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Profile Stats
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Current Level</div>
                    <div className="font-semibold text-foreground">{progress?.levelName ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Attendance</div>
                    <div className="font-semibold text-foreground">{user.attendance_percentage ?? 0}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AchievementsGallery
        open={gallery}
        onOpenChange={setGallery}
        badges={badges}
        ctx={ctx}
      />

      <BadgePickerModal
        open={pickerSlot !== null}
        onOpenChange={(v) => { if (!v) setPickerSlot(null); }}
        available={availableForPicker}
        earnedCount={earned.length}
        onPick={(id) => { if (pickerSlot !== null) equip(pickerSlot, id); }}
      />
    </>
  );
}

export function AchievementsGallery({
  open,
  onOpenChange,
  badges,
  ctx,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  badges: ProfileBadgeDef[];
  ctx: BadgeContext;
}) {
  const { user } = useAuth();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Verbo Achievements & Badges Gallery
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          Hover over any badge to see how to unlock it.
        </p>

        {badges.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center text-sm text-muted-foreground">
            No badges have been configured yet.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {badges.map((b) => {
              const earned = isBadgeEarned(b, ctx) || (user ? isBadgeManuallyGranted(user.id, b.id, "profile") : false);
              const meta = BADGE_METRIC_META[b.rule.metric];
              const progressHint =
                !earned && meta.numeric
                  ? `${Math.min(ctx[b.rule.metric] as number, b.rule.threshold ?? 1)}/${b.rule.threshold ?? 1}`
                  : null;
              return (
                <div key={b.id} className="group relative">
                  <div
                    className={`flex flex-col items-center rounded-xl border border-border p-5 transition-all ${
                      earned ? "bg-card hover:border-[#f38934]/40 hover:shadow-md" : "bg-secondary/30"
                    }`}
                  >
                    <div className="relative">
                      <BadgeVisual badge={b} earned={earned} size="lg" />
                      {!earned && (
                        <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-zinc-700 text-white">
                          <Lock className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-center text-sm font-semibold text-foreground">
                      {b.name}
                    </div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {earned ? "Earned" : progressHint ?? "Locked"}
                    </div>
                  </div>

                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-60 -translate-x-1/2 scale-95 rounded-lg bg-[#01304a] px-3 py-2 text-xs text-white opacity-0 shadow-xl transition-all group-hover:scale-100 group-hover:opacity-100">
                    <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#01304a]" />
                    {b.description || meta.hint}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BadgePickerModal({
  open,
  onOpenChange,
  available,
  earnedCount,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  available: ProfileBadgeDef[];
  earnedCount: number;
  onPick: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="text-base font-semibold text-foreground">
          Choose a badge to showcase
        </DialogTitle>
        {earnedCount === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
            Complete achievements to unlock badges to showcase here.
          </p>
        ) : available.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
            You've already equipped all of your earned badges.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {available.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onPick(b.id)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-all hover:-translate-y-0.5 hover:border-[#f38934] hover:shadow-md"
              >
                <BadgeVisual badge={b} earned size="md" />
                <div className="text-[11px] font-medium text-foreground line-clamp-2">{b.name}</div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
