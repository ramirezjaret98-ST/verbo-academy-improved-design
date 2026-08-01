// Verbo Flash catalog — complementary "surprise" challenges independent from
// the weekly Challenges bank. Same persistence pattern as challenges-store.ts:
// localStorage + a broadcast CustomEvent so any open tab refreshes in real
// time. Categories/colors are reused from challenges-store via categoryColor().

export type FlashFormat = "mystery_box" | "lightning" | "season";

export type FlashProductId = "enterprise" | "go" | "international";

export interface FlashChallenge {
  id: string; // e.g. MYSTERY-ENTERPRISE-1
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
 *  whole platform at a time. `product` scopes visibility on the student side. */
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

export const FLASH_KEY = "verbo:flash-challenges";
export const FLASH_EVENT = "verbo:flash-challenges-updated";
export const FLASH_CONFIG_KEY = "verbo:flash-config";
export const FLASH_CONFIG_EVENT = "verbo:flash-config-updated";
export const LIGHTNING_KEY = "verbo:flash-lightning";
export const LIGHTNING_EVENT = "verbo:flash-lightning-updated";
export const LIGHTNING_THEME_KEY = "verbo:flash-lightning-theme";
export const LIGHTNING_THEME_EVENT = "verbo:flash-lightning-theme-updated";

/* -------------------- Challenges -------------------- */

export function loadFlashChallenges(): FlashChallenge[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FLASH_KEY);
    if (raw) return JSON.parse(raw) as FlashChallenge[];
  } catch { /* noop */ }
  return [];
}

export function persistFlashChallenges(list: FlashChallenge[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FLASH_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(FLASH_EVENT));
  } catch { /* noop */ }
}

export function subscribeFlashChallenges(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === FLASH_KEY) cb(); };
  window.addEventListener(FLASH_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(FLASH_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
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

/* -------------------- Config (box art, etc.) -------------------- */

export function loadFlashConfig(): FlashConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FLASH_CONFIG_KEY);
    if (raw) return JSON.parse(raw) as FlashConfig;
  } catch { /* noop */ }
  return {};
}

export function persistFlashConfig(cfg: FlashConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FLASH_CONFIG_KEY, JSON.stringify(cfg));
    window.dispatchEvent(new CustomEvent(FLASH_CONFIG_EVENT));
  } catch { /* noop */ }
}

export function subscribeFlashConfig(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === FLASH_CONFIG_KEY) cb(); };
  window.addEventListener(FLASH_CONFIG_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(FLASH_CONFIG_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/* -------------------- Lightning theme (static) -------------------- */

export function loadLightningTheme(): LightningTheme {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LIGHTNING_THEME_KEY);
    if (raw) return JSON.parse(raw) as LightningTheme;
  } catch { /* noop */ }
  return {};
}

export function persistLightningTheme(theme: LightningTheme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIGHTNING_THEME_KEY, JSON.stringify(theme));
    window.dispatchEvent(new CustomEvent(LIGHTNING_THEME_EVENT));
  } catch { /* noop */ }
}

export function subscribeLightningTheme(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === LIGHTNING_THEME_KEY) cb(); };
  window.addEventListener(LIGHTNING_THEME_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LIGHTNING_THEME_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}



/* -------------------- Lightning (singleton) -------------------- */

const LIGHTNING_INACTIVE: LightningState = {
  status: "inactive",
  challenge_id: null,
  product: null,
  activated_at: null,
  expires_at: null,
  duration_hours: LIGHTNING_DEFAULT_HOURS,
  accepted_student_ids: [],
};

export function loadLightning(): LightningState {
  if (typeof window === "undefined") return { ...LIGHTNING_INACTIVE };
  try {
    const raw = localStorage.getItem(LIGHTNING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LightningState;
      // Auto-transition to expired based on wall clock; write-back if it flipped.
      if (parsed.status === "live" && parsed.expires_at && Date.now() >= +new Date(parsed.expires_at)) {
        const expired: LightningState = { ...parsed, status: "expired" };
        try { localStorage.setItem(LIGHTNING_KEY, JSON.stringify(expired)); } catch { /* noop */ }
        return expired;
      }
      return parsed;
    }
  } catch { /* noop */ }
  return { ...LIGHTNING_INACTIVE };
}

export function persistLightning(state: LightningState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIGHTNING_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(LIGHTNING_EVENT));
  } catch { /* noop */ }
}

export function subscribeLightning(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === LIGHTNING_KEY) cb(); };
  window.addEventListener(LIGHTNING_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LIGHTNING_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function activateLightning(
  challengeId: string,
  product: FlashProductId,
  durationHours: number,
): LightningState {
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
  persistLightning(state);
  return state;
}

export function endLightningEarly(): void {
  const cur = loadLightning();
  if (cur.status !== "live") return;
  persistLightning({ ...cur, status: "expired", expires_at: new Date().toISOString() });
}

export function acceptLightning(studentId: string): void {
  const cur = loadLightning();
  if (cur.status !== "live") return;
  if (cur.accepted_student_ids.includes(studentId)) return;
  persistLightning({ ...cur, accepted_student_ids: [...cur.accepted_student_ids, studentId] });
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

/* -------------------- Seasons -------------------- */

export type FontPreset = "Playful" | "Elegant" | "Spooky" | "Festive" | "Minimal" | "Custom";

/** One color stop of a multi-stop Season gradient. position is 0-100 (%). */
export interface GradientStop {
  color: string;
  position: number;
}

export type SeasonFillMode = "solid" | "gradient";

export interface FlashSeason {
  id: string;
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

export const SEASONS_KEY = "verbo:flash-seasons";
export const SEASONS_EVENT = "verbo:flash-seasons-updated";

const SEASON_SEEDS: string[] = [
  "Halloween",
  "New Year",
  "Christmas",
  "Black Friday",
  "Thanksgiving",
  "Independence Day",
  "Valentine's Day",
  "Day of the Dead",
  "Three Kings' Day",
  "Spring",
  "Summer",
  "Fall",
  "Winter",
];

function makeSeasonId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `season-${slug}`;
}

function seedSeasons(): FlashSeason[] {
  const now = new Date().toISOString();
  return SEASON_SEEDS.map((name) => ({
    id: makeSeasonId(name),
    display_name: name,
    font_preset: "Festive" as FontPreset,
    active: false,
    badge_name: `${name} Challenger`,
    created_at: now,
  }));
}

export function loadSeasons(): FlashSeason[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEASONS_KEY);
    if (raw) return JSON.parse(raw) as FlashSeason[];
  } catch { /* noop */ }
  const seeded = seedSeasons();
  try { localStorage.setItem(SEASONS_KEY, JSON.stringify(seeded)); } catch { /* noop */ }
  return seeded;
}

export function persistSeasons(list: FlashSeason[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEASONS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(SEASONS_EVENT));
  } catch { /* noop */ }
}

export function subscribeSeasons(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === SEASONS_KEY) cb(); };
  window.addEventListener(SEASONS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SEASONS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function upsertSeason(s: FlashSeason) {
  const list = loadSeasons();
  const idx = list.findIndex((x) => x.id === s.id);
  const next = idx >= 0 ? [...list.slice(0, idx), s, ...list.slice(idx + 1)] : [...list, s];
  persistSeasons(next);
}

/** Only one Season may be active at a time (students would otherwise see two
 *  banners). Returns the other active Season that blocks activating `id`. */
export function conflictingActiveSeason(id: string, list: FlashSeason[] = loadSeasons()): FlashSeason | null {
  return list.find((s) => s.active && s.id !== id) ?? null;
}

export function deleteSeason(id: string) {
  persistSeasons(loadSeasons().filter((s) => s.id !== id));
}

/* -------------------- Delete with sync cleanup -------------------- */

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
