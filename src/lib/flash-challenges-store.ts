// Verbo Flash — complementary "surprise" challenges independent from the
// weekly Challenges bank (challenges-store.ts), plus the Lightning live-drop
// mechanic and Season theming.
//
// Backed by Supabase:
//  - FlashChallenge catalog → `public.challenges` (kind='flash' — same table
//    as the weekly catalog, see challenges-store.ts).
//  - FlashConfig            → `public.flash_config` (singleton, id=true)
//  - LightningState         → `public.lightning_state` (singleton, id=true)
//  - LightningTheme         → `public.lightning_theme` (singleton, id=true)
//  - FlashSeason[]          → `public.flash_seasons`
// RLS: SELECT open to everyone, INSERT/UPDATE/DELETE admin-only
// (private.is_admin()) on every table above — EXCEPT accepting a live
// Lightning, which students do themselves. That one narrow write goes
// through the `accept_lightning` SECURITY DEFINER RPC (see the migration)
// instead of a direct table UPDATE, since RLS can't scope "append your own
// id" at the column level.
//
// Global caches hydrated once + Postgres Realtime per sub-table, same
// pattern used across this migration (see teacher-kpi-overrides-store.ts).
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { hydrateUserIdBridge, legacyToUuid, uuidToLegacySync } from "@/lib/user-id-bridge";

export type FlashFormat = "mystery_box" | "lightning" | "season";

export type FlashProductId = "enterprise" | "go" | "international";

export interface FlashChallenge {
  id: string; // e.g. MYSTERY-ENTERPRISE-1 — maps to `challenges.code`
  format: FlashFormat;
  product: FlashProductId;
  category: string;
  title: string;
  description: string;
  video_url?: string;
  premium?: boolean;
  /** Free text where the admin explains the expected delivery format. */
  submission_instructions?: string;
  skill_tags?: string[];
  /** Only for format === "season": the FlashSeason this challenge belongs to. */
  season_id?: string;
  /** Optional circular icon image (data URL or remote URL). */
  icon_image_url?: string;
  /** Shared id linking the per-product copies of one authored challenge. */
  synced_group_id?: string;
}

/** New id for a group of per-product copies of the same challenge content. */
export function newSyncedGroupId(): string {
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface FlashConfig {
  box_art_url?: string;
  theme_image_url?: string;
  watermark_image_url?: string;
  accent_color?: string;
  accent_color_to?: string;
  fill_mode?: SeasonFillMode;
  gradient_stops?: GradientStop[];
}

/** Static visual theme for the Lightning banner — persists independently of
 *  LightningState (which is the runtime activation state). */
export interface LightningTheme {
  theme_image_url?: string;
  watermark_image_url?: string;
  accent_color?: string;
  accent_color_to?: string;
  fill_mode?: SeasonFillMode;
  gradient_stops?: GradientStop[];
}

/** Global Lightning singleton — only ONE Lightning can be live across the
 *  whole platform at a time. `product` scopes visibility on the student side.
 *  `challenge_id`/`accepted_student_ids` use the same frontend-facing ids as
 *  everywhere else (FlashChallenge.id / student legacy id) — the Supabase FK
 *  and uuid[] column underneath are translated transparently in this file. */
export interface LightningState {
  status: "inactive" | "live" | "expired";
  challenge_id: string | null;
  product: FlashProductId | null;
  activated_at: string | null;
  expires_at: string | null;
  duration_hours: number;
  accepted_student_ids: string[];
}

export const LIGHTNING_DEFAULT_HOURS = 24;
export const LIGHTNING_EXPIRED_VISIBLE_MS = 24 * 60 * 60 * 1000;

export const FLASH_PRODUCT_ORDER: FlashProductId[] = ["enterprise", "go", "international"];
export const FLASH_PRODUCT_LABEL: Record<FlashProductId, string> = {
  enterprise: "Enterprise",
  go: "GO",
  international: "International",
};

export const FLASH_EVENT = "verbo:flash-challenges-updated";
export const FLASH_CONFIG_EVENT = "verbo:flash-config-updated";
export const LIGHTNING_EVENT = "verbo:flash-lightning-updated";
export const LIGHTNING_THEME_EVENT = "verbo:flash-lightning-theme-updated";
export const SEASONS_EVENT = "verbo:flash-seasons-updated";

type ChallengeRow = Database["public"]["Tables"]["challenges"]["Row"];
type FlashConfigRow = Database["public"]["Tables"]["flash_config"]["Row"];
type LightningRow = Database["public"]["Tables"]["lightning_state"]["Row"];
type LightningThemeRow = Database["public"]["Tables"]["lightning_theme"]["Row"];
type SeasonRow = Database["public"]["Tables"]["flash_seasons"]["Row"];

/* ==========================================================================
 * FlashChallenge catalog (challenges table, kind='flash')
 * ========================================================================== */

let flashCache: FlashChallenge[] = [];
let flashHydrated = false;
let flashHydratePromise: Promise<void> | null = null;
const flashListeners = new Set<() => void>();
// code <-> Supabase bigint id, kept in sync on every hydrate — needed to
// resolve lightning_state.challenge_id (a real FK) to/from the frontend's
// code-based FlashChallenge.id.
const codeToDbId = new Map<string, number>();
const dbIdToCode = new Map<number, string>();

function notifyFlash() {
  flashListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FLASH_EVENT));
}

function mapFlashRow(row: ChallengeRow): FlashChallenge {
  return {
    id: row.code ?? String(row.id),
    format: (row.format ?? "mystery_box") as FlashFormat,
    product: row.product as FlashProductId,
    category: row.category,
    title: row.title,
    description: row.description,
    video_url: row.video_url ?? undefined,
    premium: row.premium || undefined,
    submission_instructions: row.submission_instructions ?? undefined,
    skill_tags: row.skill_tags ?? undefined,
    season_id: row.season_id != null ? String(row.season_id) : undefined,
    icon_image_url: row.icon_image_url ?? undefined,
    synced_group_id: row.synced_group_id ?? undefined,
  };
}

async function hydrateFlash(): Promise<void> {
  if (flashHydrated) return;
  if (flashHydratePromise) return flashHydratePromise;
  flashHydratePromise = (async () => {
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("kind", "flash");
    if (error) {
      console.error("[flash-challenges-store] failed to load flash challenges", error);
      flashHydrated = true;
      return;
    }
    codeToDbId.clear();
    dbIdToCode.clear();
    for (const row of data ?? []) {
      if (row.code) {
        codeToDbId.set(row.code, row.id);
        dbIdToCode.set(row.id, row.code);
      }
    }
    flashCache = (data ?? []).map(mapFlashRow);
    flashHydrated = true;
  })();
  await flashHydratePromise;
  flashHydratePromise = null;
  notifyFlash();
}

if (typeof window !== "undefined") {
  void hydrateFlash();
  supabase
    .channel("challenges-flash-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "challenges", filter: "kind=eq.flash" },
      () => {
        flashHydrated = false;
        void hydrateFlash();
      },
    )
    .subscribe();
}

export function loadFlashChallenges(): FlashChallenge[] {
  if (!flashHydrated) void hydrateFlash();
  return flashCache;
}

export function subscribeFlashChallenges(cb: () => void): () => void {
  flashListeners.add(cb);
  return () => {
    flashListeners.delete(cb);
  };
}

function flashChallengeEquals(a: FlashChallenge, b: FlashChallenge): boolean {
  return (
    a.format === b.format &&
    a.product === b.product &&
    a.category === b.category &&
    a.title === b.title &&
    a.description === b.description &&
    (a.video_url ?? "") === (b.video_url ?? "") &&
    !!a.premium === !!b.premium &&
    (a.submission_instructions ?? "") === (b.submission_instructions ?? "") &&
    JSON.stringify(a.skill_tags ?? []) === JSON.stringify(b.skill_tags ?? []) &&
    (a.season_id ?? "") === (b.season_id ?? "") &&
    (a.icon_image_url ?? "") === (b.icon_image_url ?? "") &&
    (a.synced_group_id ?? "") === (b.synced_group_id ?? "")
  );
}

/** Replace the Flash catalog with `list` (optimistic; rolls back the whole
 *  write on failure). Diffs against the last-synced cache — same convention
 *  as persistChallenges() in challenges-store.ts. */
export function persistFlashChallenges(list: FlashChallenge[]) {
  const prevCache = flashCache;
  const prevById = new Map(prevCache.map((c) => [c.id, c]));
  const nextIds = new Set(list.map((c) => c.id));

  flashCache = list;
  notifyFlash();

  const toUpsert = list.filter((c) => {
    const prev = prevById.get(c.id);
    return !prev || !flashChallengeEquals(prev, c);
  });
  const toDeleteIds = prevCache.filter((c) => !nextIds.has(c.id)).map((c) => c.id);

  if (toUpsert.length === 0 && toDeleteIds.length === 0) return;

  void (async () => {
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("challenges")
        .upsert(
          toUpsert.map((c) => ({
            code: c.id,
            kind: "flash" as const,
            format: c.format,
            product: c.product,
            category: c.category,
            title: c.title,
            description: c.description,
            video_url: c.video_url || null,
            premium: c.premium ?? false,
            skill_tags: c.skill_tags && c.skill_tags.length > 0 ? c.skill_tags : null,
            submission_instructions: c.submission_instructions ?? null,
            season_id: c.season_id ? Number(c.season_id) : null,
            icon_image_url: c.icon_image_url ?? null,
            synced_group_id: c.synced_group_id ?? null,
          })),
          { onConflict: "code" },
        );
      if (error) {
        console.error("[flash-challenges-store] failed to upsert flash challenges", error);
        flashCache = prevCache;
        notifyFlash();
        return;
      }
    }
    if (toDeleteIds.length > 0) {
      const { error } = await supabase
        .from("challenges")
        .delete()
        .eq("kind", "flash")
        .in("code", toDeleteIds);
      if (error) {
        console.error("[flash-challenges-store] failed to delete flash challenges", error);
        flashCache = prevCache;
        notifyFlash();
      }
    }
  })();
}

function flashNum(id: string): number {
  const m = id.match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

export function newFlashChallengeId(
  format: FlashFormat,
  product: FlashProductId,
  existing: FlashChallenge[],
): string {
  const prefix = `${format.toUpperCase().replace("_", "-")}-${product.toUpperCase()}`;
  const max = existing
    .filter((c) => c.format === format && c.product === product)
    .reduce((m, c) => Math.max(m, flashNum(c.id)), 0);
  return `${prefix}-${max + 1}`;
}

export function flashChallengesFor(
  list: FlashChallenge[],
  format: FlashFormat,
  product: FlashProductId,
): FlashChallenge[] {
  return list
    .filter((c) => c.format === format && c.product === product)
    .sort((a, b) => flashNum(a.id) - flashNum(b.id));
}

/** Challenges assigned to one specific Season (format "season" + season_id). */
export function seasonChallengesFor(
  list: FlashChallenge[],
  seasonId: string,
  product: FlashProductId,
): FlashChallenge[] {
  return list
    .filter((c) => c.format === "season" && c.season_id === seasonId && c.product === product)
    .sort((a, b) => flashNum(a.id) - flashNum(b.id));
}

/** Removes a challenge and, when it belonged to a synced group that is left
 *  with a single copy (or none), clears `synced_group_id` from the remaining
 *  copies so they stop showing the "Synced" mark. */
export function removeChallengeAndUnsync(list: FlashChallenge[], id: string): FlashChallenge[] {
  const target = list.find((c) => c.id === id);
  const next = list.filter((c) => c.id !== id);
  const gid = target?.synced_group_id;
  if (!gid) return next;
  const siblings = next.filter((c) => c.synced_group_id === gid);
  if (siblings.length > 1) return next;
  return next.map((c) => {
    if (c.synced_group_id !== gid) return c;
    const { synced_group_id: _drop, ...rest } = c;
    return rest as FlashChallenge;
  });
}

/* ==========================================================================
 * Config (box art, etc.) — singleton row (flash_config, id=true)
 * ========================================================================== */

let flashConfigCache: FlashConfig = {};
let flashConfigHydrated = false;
let flashConfigHydratePromise: Promise<void> | null = null;
const flashConfigListeners = new Set<() => void>();

function notifyFlashConfig() {
  flashConfigListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FLASH_CONFIG_EVENT));
}

function mapFlashConfigRow(row: FlashConfigRow): FlashConfig {
  return {
    box_art_url: row.box_art_url ?? undefined,
    theme_image_url: row.theme_image_url ?? undefined,
    watermark_image_url: row.watermark_image_url ?? undefined,
    accent_color: row.accent_color ?? undefined,
    accent_color_to: row.accent_color_to ?? undefined,
    fill_mode: row.fill_mode ?? undefined,
    gradient_stops: (row.gradient_stops as unknown as GradientStop[] | null) ?? undefined,
  };
}

async function hydrateFlashConfig(): Promise<void> {
  if (flashConfigHydrated) return;
  if (flashConfigHydratePromise) return flashConfigHydratePromise;
  flashConfigHydratePromise = (async () => {
    const { data, error } = await supabase.from("flash_config").select("*").eq("id", true).maybeSingle();
    if (error) {
      console.error("[flash-challenges-store] failed to load flash_config", error);
      flashConfigHydrated = true;
      return;
    }
    flashConfigCache = data ? mapFlashConfigRow(data) : {};
    flashConfigHydrated = true;
  })();
  await flashConfigHydratePromise;
  flashConfigHydratePromise = null;
  notifyFlashConfig();
}

if (typeof window !== "undefined") {
  void hydrateFlashConfig();
  supabase
    .channel("flash-config-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "flash_config" }, () => {
      flashConfigHydrated = false;
      void hydrateFlashConfig();
    })
    .subscribe();
}

export function loadFlashConfig(): FlashConfig {
  if (!flashConfigHydrated) void hydrateFlashConfig();
  return flashConfigCache;
}

export function persistFlashConfig(cfg: FlashConfig) {
  const prev = flashConfigCache;
  flashConfigCache = cfg;
  notifyFlashConfig();
  void (async () => {
    const { error } = await supabase
      .from("flash_config")
      .upsert(
        {
          id: true,
          box_art_url: cfg.box_art_url ?? null,
          theme_image_url: cfg.theme_image_url ?? null,
          watermark_image_url: cfg.watermark_image_url ?? null,
          accent_color: cfg.accent_color ?? null,
          accent_color_to: cfg.accent_color_to ?? null,
          fill_mode: cfg.fill_mode ?? null,
          gradient_stops: (cfg.gradient_stops as unknown as never) ?? null,
        },
        { onConflict: "id" },
      );
    if (error) {
      console.error("[flash-challenges-store] failed to save flash_config", error);
      flashConfigCache = prev;
      notifyFlashConfig();
    }
  })();
}

export function subscribeFlashConfig(cb: () => void): () => void {
  flashConfigListeners.add(cb);
  return () => {
    flashConfigListeners.delete(cb);
  };
}

/* ==========================================================================
 * Lightning theme (static) — singleton row (lightning_theme, id=true)
 * ========================================================================== */

let lightningThemeCache: LightningTheme = {};
let lightningThemeHydrated = false;
let lightningThemeHydratePromise: Promise<void> | null = null;
const lightningThemeListeners = new Set<() => void>();

function notifyLightningTheme() {
  lightningThemeListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LIGHTNING_THEME_EVENT));
}

function mapLightningThemeRow(row: LightningThemeRow): LightningTheme {
  return {
    theme_image_url: row.theme_image_url ?? undefined,
    watermark_image_url: row.watermark_image_url ?? undefined,
    accent_color: row.accent_color ?? undefined,
    accent_color_to: row.accent_color_to ?? undefined,
    fill_mode: row.fill_mode ?? undefined,
    gradient_stops: (row.gradient_stops as unknown as GradientStop[] | null) ?? undefined,
  };
}

async function hydrateLightningTheme(): Promise<void> {
  if (lightningThemeHydrated) return;
  if (lightningThemeHydratePromise) return lightningThemeHydratePromise;
  lightningThemeHydratePromise = (async () => {
    const { data, error } = await supabase.from("lightning_theme").select("*").eq("id", true).maybeSingle();
    if (error) {
      console.error("[flash-challenges-store] failed to load lightning_theme", error);
      lightningThemeHydrated = true;
      return;
    }
    lightningThemeCache = data ? mapLightningThemeRow(data) : {};
    lightningThemeHydrated = true;
  })();
  await lightningThemeHydratePromise;
  lightningThemeHydratePromise = null;
  notifyLightningTheme();
}

if (typeof window !== "undefined") {
  void hydrateLightningTheme();
  supabase
    .channel("lightning-theme-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "lightning_theme" }, () => {
      lightningThemeHydrated = false;
      void hydrateLightningTheme();
    })
    .subscribe();
}

export function loadLightningTheme(): LightningTheme {
  if (!lightningThemeHydrated) void hydrateLightningTheme();
  return lightningThemeCache;
}

export function persistLightningTheme(theme: LightningTheme) {
  const prev = lightningThemeCache;
  lightningThemeCache = theme;
  notifyLightningTheme();
  void (async () => {
    const { error } = await supabase
      .from("lightning_theme")
      .upsert(
        {
          id: true,
          theme_image_url: theme.theme_image_url ?? null,
          watermark_image_url: theme.watermark_image_url ?? null,
          accent_color: theme.accent_color ?? null,
          accent_color_to: theme.accent_color_to ?? null,
          fill_mode: theme.fill_mode ?? null,
          gradient_stops: (theme.gradient_stops as unknown as never) ?? null,
        },
        { onConflict: "id" },
      );
    if (error) {
      console.error("[flash-challenges-store] failed to save lightning_theme", error);
      lightningThemeCache = prev;
      notifyLightningTheme();
    }
  })();
}

export function subscribeLightningTheme(cb: () => void): () => void {
  lightningThemeListeners.add(cb);
  return () => {
    lightningThemeListeners.delete(cb);
  };
}

/* ==========================================================================
 * Lightning (singleton runtime state) — lightning_state, id=true
 * ========================================================================== */

const LIGHTNING_INACTIVE: LightningState = {
  status: "inactive",
  challenge_id: null,
  product: null,
  activated_at: null,
  expires_at: null,
  duration_hours: LIGHTNING_DEFAULT_HOURS,
  accepted_student_ids: [],
};

let lightningCache: LightningState = { ...LIGHTNING_INACTIVE };
let lightningHydrated = false;
let lightningHydratePromise: Promise<void> | null = null;
const lightningListeners = new Set<() => void>();

function notifyLightning() {
  lightningListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LIGHTNING_EVENT));
}

function mapLightningRow(row: LightningRow): LightningState {
  return {
    status: (row.status as LightningState["status"]) || "inactive",
    challenge_id: row.challenge_id != null ? (dbIdToCode.get(row.challenge_id) ?? String(row.challenge_id)) : null,
    product: (row.product as FlashProductId | null) ?? null,
    activated_at: row.activated_at,
    expires_at: row.expires_at,
    duration_hours: row.duration_hours ?? LIGHTNING_DEFAULT_HOURS,
    accepted_student_ids: (row.accepted_student_ids ?? []).map((uuid) => uuidToLegacySync(uuid)),
  };
}

async function hydrateLightning(): Promise<void> {
  if (lightningHydrated) return;
  if (lightningHydratePromise) return lightningHydratePromise;
  lightningHydratePromise = (async () => {
    // Need the flash catalog's code<->id map (to resolve challenge_id) and
    // the user-id bridge (to resolve accepted_student_ids) before mapping.
    await Promise.all([hydrateUserIdBridge(), hydrateFlash()]);
    const { data, error } = await supabase.from("lightning_state").select("*").eq("id", true).maybeSingle();
    if (error) {
      console.error("[flash-challenges-store] failed to load lightning_state", error);
      lightningHydrated = true;
      return;
    }
    lightningCache = data ? mapLightningRow(data) : { ...LIGHTNING_INACTIVE };
    lightningHydrated = true;
  })();
  await lightningHydratePromise;
  lightningHydratePromise = null;
  notifyLightning();
}

if (typeof window !== "undefined") {
  void hydrateLightning();
  supabase
    .channel("lightning-state-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "lightning_state" }, () => {
      lightningHydrated = false;
      void hydrateLightning();
    })
    .subscribe();
}

/** Returns the current Lightning state, auto-transitioning to "expired"
 *  based on wall clock (mirrors the old localStorage behavior — the DB row
 *  isn't guaranteed to have flipped yet, so this checks client-side on every
 *  read and fires a best-effort write-back). */
export function loadLightning(): LightningState {
  if (!lightningHydrated) void hydrateLightning();
  if (
    lightningCache.status === "live" &&
    lightningCache.expires_at &&
    Date.now() >= +new Date(lightningCache.expires_at)
  ) {
    const expired: LightningState = { ...lightningCache, status: "expired" };
    lightningCache = expired;
    void supabase.from("lightning_state").update({ status: "expired" }).eq("id", true).eq("status", "live");
    return expired;
  }
  return lightningCache;
}

export function subscribeLightning(cb: () => void): () => void {
  lightningListeners.add(cb);
  return () => {
    lightningListeners.delete(cb);
  };
}

export function activateLightning(
  challengeId: string,
  product: FlashProductId,
  durationHours: number,
): LightningState {
  const prev = lightningCache;
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(1, durationHours) * 60 * 60 * 1000);
  const state: LightningState = {
    status: "live",
    challenge_id: challengeId,
    product,
    activated_at: now.toISOString(),
    expires_at: expires.toISOString(),
    duration_hours: durationHours,
    accepted_student_ids: [],
  };
  lightningCache = state;
  notifyLightning();

  void (async () => {
    const dbId = codeToDbId.get(challengeId);
    if (dbId == null) {
      console.error("[flash-challenges-store] unknown flash challenge code, cannot activate lightning", challengeId);
      lightningCache = prev;
      notifyLightning();
      return;
    }
    const { error } = await supabase
      .from("lightning_state")
      .upsert(
        {
          id: true,
          status: "live",
          challenge_id: dbId,
          product,
          activated_at: state.activated_at,
          expires_at: state.expires_at,
          duration_hours: durationHours,
          accepted_student_ids: [],
        },
        { onConflict: "id" },
      );
    if (error) {
      console.error("[flash-challenges-store] failed to activate lightning", error);
      lightningCache = prev;
      notifyLightning();
    }
  })();

  return state;
}

export function endLightningEarly(): void {
  const cur = lightningCache;
  if (cur.status !== "live") return;
  const prev = cur;
  const nowIso = new Date().toISOString();
  lightningCache = { ...cur, status: "expired", expires_at: nowIso };
  notifyLightning();
  void (async () => {
    const { error } = await supabase
      .from("lightning_state")
      .update({ status: "expired", expires_at: nowIso })
      .eq("id", true);
    if (error) {
      console.error("[flash-challenges-store] failed to end lightning early", error);
      lightningCache = prev;
      notifyLightning();
    }
  })();
}

/** Records that `studentId` (legacy id) accepted the current live Lightning.
 *  Goes through the `accept_lightning` RPC (SECURITY DEFINER) rather than a
 *  direct table update — see file header for why. */
export function acceptLightning(studentId: string): void {
  const cur = lightningCache;
  if (cur.status !== "live") return;
  if (cur.accepted_student_ids.includes(studentId)) return;
  const prev = cur;
  lightningCache = { ...cur, accepted_student_ids: [...cur.accepted_student_ids, studentId] };
  notifyLightning();

  void (async () => {
    const uuid = await legacyToUuid(studentId);
    if (!uuid) {
      console.error("[flash-challenges-store] unknown student id, dropping optimistic accept", studentId);
      lightningCache = prev;
      notifyLightning();
      return;
    }
    const { error } = await supabase.rpc("accept_lightning", { p_student_id: uuid });
    if (error) {
      console.error("[flash-challenges-store] failed to accept lightning", error);
      lightningCache = prev;
      notifyLightning();
    }
  })();
}

/** Returns true while the current Lightning state should still render for
 *  students — either it's live, or it expired within the visible-after
 *  window. Beyond that, the student card is hidden. */
export function isLightningVisibleForStudents(state: LightningState): boolean {
  if (state.status === "live") return true;
  if (state.status === "expired" && state.expires_at) {
    return Date.now() - +new Date(state.expires_at) < LIGHTNING_EXPIRED_VISIBLE_MS;
  }
  return false;
}

/* ==========================================================================
 * Seasons — flash_seasons table
 * ========================================================================== */

export type FontPreset = "Playful" | "Elegant" | "Spooky" | "Festive" | "Minimal" | "Custom";

/** One color stop of a multi-stop Season gradient. position is 0-100 (%). */
export interface GradientStop {
  color: string;
  position: number;
}

export type SeasonFillMode = "solid" | "gradient";

export interface FlashSeason {
  id: string; // Supabase bigint id, stringified
  display_name: string; // shown to student, always English
  theme_image_url?: string;
  /** Optional decorative image (e.g. transparent PNG) that replaces the giant
   *  text watermark on the student Season banner when defined. */
  watermark_image_url?: string;
  accent_color?: string;
  /** Optional second color; when set the Season gradient goes accent_color -> accent_color_to. */
  accent_color_to?: string;
  /** "solid" uses accent_color only; "gradient" uses gradient_stops. */
  fill_mode?: SeasonFillMode;
  /** Multi-stop gradient (2+ stops). Falls back to accent_color/_to when absent. */
  gradient_stops?: GradientStop[];
  font_preset: FontPreset;
  custom_font_name?: string;
  active: boolean;
  badge_name: string; // auto: `${display_name} Challenger`
  created_at: string;
}

/** Single source of truth for a Season's gradient background. */
export function seasonGradientCss(
  season: Pick<FlashSeason, "accent_color" | "accent_color_to" | "fill_mode" | "gradient_stops">,
  angle = 135,
): string {
  const stops = season.gradient_stops;
  if (season.fill_mode === "gradient" && stops && stops.length >= 2) {
    const parts = [...stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => `${s.color} ${Math.max(0, Math.min(100, s.position))}%`)
      .join(", ");
    return `linear-gradient(${angle}deg, ${parts})`;
  }
  const from = season.accent_color || "#7e22ce";
  if (season.accent_color_to) {
    return `linear-gradient(${angle}deg, ${from}, ${season.accent_color_to})`;
  }
  return `linear-gradient(${angle}deg, ${from}, #111827)`;
}

export const FONT_PRESET_ORDER: FontPreset[] = [
  "Playful", "Elegant", "Spooky", "Festive", "Minimal", "Custom",
];

/** Maps a font preset to the Google Font family it loads. Custom uses
 *  the user-supplied `custom_font_name`. */
export const FONT_PRESET_FAMILY: Record<Exclude<FontPreset, "Custom">, string> = {
  Playful: "Fredoka",
  Elegant: "Playfair Display",
  Spooky: "Creepster",
  Festive: "Pacifico",
  Minimal: "Inter",
};

export function fontFamilyFor(season: Pick<FlashSeason, "font_preset" | "custom_font_name">): string {
  if (season.font_preset === "Custom") return (season.custom_font_name || "Inter").trim();
  return FONT_PRESET_FAMILY[season.font_preset];
}

const _loadedFonts = new Set<string>();
export function ensureGoogleFont(family: string) {
  if (typeof document === "undefined") return;
  const key = family.trim();
  if (!key || _loadedFonts.has(key)) return;
  _loadedFonts.add(key);
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(key).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.verboFont = key;
  document.head.appendChild(link);
}

let seasonsCache: FlashSeason[] = [];
let seasonsHydrated = false;
let seasonsHydratePromise: Promise<void> | null = null;
const seasonsListeners = new Set<() => void>();

function notifySeasons() {
  seasonsListeners.forEach((cb) => cb());
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SEASONS_EVENT));
}

function mapSeasonRow(row: SeasonRow): FlashSeason {
  return {
    id: String(row.id),
    display_name: row.display_name,
    theme_image_url: row.theme_image_url ?? undefined,
    watermark_image_url: row.watermark_image_url ?? undefined,
    accent_color: row.accent_color ?? undefined,
    accent_color_to: row.accent_color_to ?? undefined,
    fill_mode: row.fill_mode ?? undefined,
    gradient_stops: (row.gradient_stops as unknown as GradientStop[] | null) ?? undefined,
    font_preset: (row.font_preset as FontPreset) || "Festive",
    custom_font_name: row.custom_font_name ?? undefined,
    active: row.active,
    badge_name: row.badge_name || `${row.display_name} Challenger`,
    created_at: row.created_at,
  };
}

async function hydrateSeasons(): Promise<void> {
  if (seasonsHydrated) return;
  if (seasonsHydratePromise) return seasonsHydratePromise;
  seasonsHydratePromise = (async () => {
    const { data, error } = await supabase.from("flash_seasons").select("*").order("created_at", { ascending: true });
    if (error) {
      console.error("[flash-challenges-store] failed to load flash_seasons", error);
      seasonsHydrated = true;
      return;
    }
    seasonsCache = (data ?? []).map(mapSeasonRow);
    seasonsHydrated = true;
  })();
  await seasonsHydratePromise;
  seasonsHydratePromise = null;
  notifySeasons();
}

if (typeof window !== "undefined") {
  void hydrateSeasons();
  supabase
    .channel("flash-seasons-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "flash_seasons" }, () => {
      seasonsHydrated = false;
      void hydrateSeasons();
    })
    .subscribe();
}

export function loadSeasons(): FlashSeason[] {
  if (!seasonsHydrated) void hydrateSeasons();
  return seasonsCache;
}

export function subscribeSeasons(cb: () => void): () => void {
  seasonsListeners.add(cb);
  return () => {
    seasonsListeners.delete(cb);
  };
}

/** Create or update a Season. `s.id` is treated as a temp/optimistic id when
 *  it doesn't match an existing cached row (i.e. when creating) — Postgres
 *  assigns the real bigint id, and the cache is reconciled with it once the
 *  insert returns, same optimistic-temp-id convention used everywhere else
 *  in this migration. */
export function upsertSeason(s: FlashSeason) {
  const prevCache = seasonsCache;
  const idx = prevCache.findIndex((x) => x.id === s.id);
  const isExisting = idx >= 0;
  const nextCache = isExisting
    ? [...prevCache.slice(0, idx), s, ...prevCache.slice(idx + 1)]
    : [...prevCache, s];
  seasonsCache = nextCache;
  notifySeasons();

  const payload = {
    display_name: s.display_name,
    theme_image_url: s.theme_image_url ?? null,
    watermark_image_url: s.watermark_image_url ?? null,
    accent_color: s.accent_color ?? null,
    accent_color_to: s.accent_color_to ?? null,
    fill_mode: s.fill_mode ?? null,
    gradient_stops: (s.gradient_stops as unknown as never) ?? null,
    font_preset: s.font_preset,
    custom_font_name: s.custom_font_name ?? null,
    active: s.active,
    badge_name: s.badge_name,
  };

  void (async () => {
    if (isExisting) {
      const dbId = Number(s.id);
      const { error } = await supabase.from("flash_seasons").update(payload).eq("id", dbId);
      if (error) {
        console.error("[flash-challenges-store] failed to update flash_seasons", error);
        seasonsCache = prevCache;
        notifySeasons();
      }
      return;
    }
    const { data, error } = await supabase.from("flash_seasons").insert(payload).select("*").single();
    if (error || !data) {
      console.error("[flash-challenges-store] failed to insert flash_seasons", error);
      seasonsCache = prevCache;
      notifySeasons();
      return;
    }
    const saved = mapSeasonRow(data);
    seasonsCache = seasonsCache.map((x) => (x.id === s.id ? saved : x));
    notifySeasons();
  })();
}

/** Only one Season may be active at a time (students would otherwise see two
 *  banners). Returns the other active Season that blocks activating `id`. */
export function conflictingActiveSeason(id: string, list: FlashSeason[] = loadSeasons()): FlashSeason | null {
  return list.find((s) => s.active && s.id !== id) ?? null;
}

export function deleteSeason(id: string) {
  const prevCache = seasonsCache;
  seasonsCache = prevCache.filter((s) => s.id !== id);
  notifySeasons();
  const dbId = Number(id);
  if (!Number.isFinite(dbId)) return; // optimistic temp id that never round-tripped — nothing to delete server-side
  void (async () => {
    const { error } = await supabase.from("flash_seasons").delete().eq("id", dbId);
    if (error) {
      console.error("[flash-challenges-store] failed to delete flash_seasons", error);
      seasonsCache = prevCache;
      notifySeasons();
    }
  })();
}
