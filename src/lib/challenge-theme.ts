// Single source of truth for challenge category colors.
// Consumed by the Student challenges surfaces and by the teacher-side
// preview modals so a challenge always looks the same everywhere.

// Color theme per challenge category (common, non-premium challenges).
const CHALLENGE_CATEGORY_THEME: Record<string, { gradient: string; solid: string }> = {
  video: { gradient: "from-[#f07ad3] via-[#e256bb] to-[#d13da4]", solid: "#d13da4" },
  audio: { gradient: "from-[#63a4f8] to-[#2f6fe4]", solid: "#2f6fe4" },
  listening: { gradient: "from-[#f8ab31] via-[#ef8f14] to-[#dd7208]", solid: "#dd7208" },
  email: { gradient: "from-[#a5d938] via-[#54b42d] to-[#157f36]", solid: "#157f36" },
  reading: { gradient: "from-[#ffd731] via-[#fdaa1d] to-[#f97316]", solid: "#f97316" },
  written: { gradient: "from-[#ef4b4b] via-[#d92c3f] to-[#a41630]", solid: "#a41630" },
  pitch: { gradient: "from-[#7c2d12] via-[#c2410c] to-[#f97316]", solid: "#c2410c" },
  negotiation: { gradient: "from-[#4a044e] via-[#7e22ce] to-[#a855f7]", solid: "#7e22ce" },
  networking: { gradient: "from-[#69d11d] via-[#14b8a6] to-[#0f766e]", solid: "#0f766e" },
  roleplay: { gradient: "from-[#134e4a] via-[#0f766e] to-[#14b8a6]", solid: "#134e4a" },
  "business case": { gradient: "from-[#01304a] via-[#024366] to-[#0a5e88]", solid: "#024366" },
  leadership: { gradient: "from-[#a78bfa] via-[#8b5cf6] to-[#6d28d9]", solid: "#6d28d9" },
  debate: { gradient: "from-[#92dfd4] via-[#14b8a6] to-[#024366]", solid: "#024366" },
  persuasion: { gradient: "from-[#cb6ce6] via-[#a855f7] to-[#7e22ce]", solid: "#a855f7" },
};

// Deterministic palette for admin-created categories not present above.
const CHALLENGE_CATEGORY_FALLBACK: { gradient: string; solid: string }[] = [
  { gradient: "from-[#818cf8] via-[#4f46e5] to-[#3730a3]", solid: "#4f46e5" },
  { gradient: "from-[#fda4af] via-[#fb7185] to-[#e11d48]", solid: "#e11d48" },
  { gradient: "from-[#67e8f9] via-[#06b6d4] to-[#0e7490]", solid: "#06b6d4" },
  { gradient: "from-[#fcd34d] via-[#f59e0b] to-[#b45309]", solid: "#b45309" },
];

export function categoryTheme(name: string): { gradient: string; solid: string } {
  const key = name.trim().toLowerCase();
  const known = CHALLENGE_CATEGORY_THEME[key];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CHALLENGE_CATEGORY_FALLBACK[hash % CHALLENGE_CATEGORY_FALLBACK.length];
}

/** CSS `background` version of a category theme, for AccentModal headers. */
export function categoryBackground(name: string): string {
  const t = categoryTheme(name);
  const hexes = t.gradient.match(/#[0-9a-fA-F]{6}/g) ?? [];
  if (hexes.length >= 3) return `linear-gradient(135deg, ${hexes[0]} 0%, ${hexes[1]} 55%, ${hexes[2]} 100%)`;
  if (hexes.length === 2) return `linear-gradient(135deg, ${hexes[0]} 0%, ${hexes[1]} 100%)`;
  return `linear-gradient(135deg, ${t.solid} 0%, #01304a 100%)`;
}
