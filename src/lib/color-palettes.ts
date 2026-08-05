// src/lib/color-palettes.ts

/** A named, ordered set of opaque swatch colors. */
export interface ColorPalette {
  id: string;
  name: string;
  colors: string[]; // "#rrggbb" lowercase
}

/** The neutral-plus-hue set flow shipped as hardcoded picker presets. Also the
 *  safety net when a palette is empty, so it is kept at the standard 20. */
export const BUILTIN_FALLBACK: string[] = [
  // 6 neutrals, then the hue wheel red → magenta.
  "#1e1e1e", "#343a40", "#495057", "#868e96", "#ced4da", "#ffffff",
  "#e03131", "#e8590c", "#f08c00", "#fab005", "#82c91e", "#2f9e44",
  "#12b886", "#099268", "#15aabf", "#1971c2", "#4263eb", "#7048e8",
  "#ae3ec9", "#c2255c",
];

/** The palette every flow install starts on. Must match a key in `SEED_COLORS`. */
export const DEFAULT_SEED_PALETTE_NAME = "Pastel";

/** Bump when `SEED_COLORS` / `BUILTIN_FALLBACK` change in a way existing installs
 *  should pick up. `palette-store.load()` re-seeds the builtins (by name) on a
 *  version change and leaves user-created palettes alone. */
export const SEED_VERSION = 2;

/** Every builtin palette: 20 colors each, ordered so the grid reads as a
 *  deliberate ramp (hue wheel, or dark → light where the theme is tonal).
 *  Insertion order is the order they appear in the panel — Pastel first, since
 *  it is the default. */
const SEED_COLORS: Record<string, string[]> = {
  // Soft wash across the wheel at roughly even lightness, two neutrals last.
  Pastel: [
    "#fcd5ce", "#ffe5b4", "#fff3b0", "#edf6b0", "#dcf2b0", "#c8f0bb",
    "#b7efc5", "#d0f4de", "#b8e0d2", "#b3ebe8", "#a9def9", "#b6d4fb",
    "#cddafd", "#d3c4f5", "#e4c1f9", "#f5c6f5", "#fac6e0", "#ffd6e0",
    "#eddfd0", "#dde5ee",
  ],
  // Same wheel at full saturation.
  Vibrant: [
    "#ff3d00", "#ff8500", "#ffab00", "#ffd500", "#c6ff00", "#76ff03",
    "#00c853", "#00e676", "#1de9b6", "#00e5ff", "#00b8d4", "#0091ea",
    "#2962ff", "#304ffe", "#651fff", "#aa00ff", "#d500f9", "#ff1493",
    "#f50057", "#ff004d",
  ],
  // Each pastel immediately followed by its saturated, darker counterpart.
  "Pastel & Vibrant": [
    "#ffc9c9", "#e03131", "#ffd8a8", "#e8590c", "#ffec99", "#f08c00",
    "#b2f2bb", "#2f9e44", "#96f2d7", "#099268", "#99e9f2", "#0c8599",
    "#a5d8ff", "#1971c2", "#d0bfff", "#7048e8", "#eebefa", "#ae3ec9",
    "#fcc2d7", "#c2255c",
  ],
  // Soil and bark dark → light, then clay, then the greens that grow in it.
  Earth: [
    "#2f2418", "#4b3621", "#5d4037", "#6f4e37", "#7f5539", "#8d6e63",
    "#9c6644", "#a0785a", "#b08968", "#c19a6b", "#d2b48c", "#e6ccb2",
    "#f5ebe0", "#b7410e", "#a45a2a", "#556b2f", "#606c38", "#8a9a5b",
    "#a3b18a", "#3a5a40",
  ],
  // Abyss → surf, with the two teals sitting at their matching depth.
  Ocean: [
    "#011627", "#012a4a", "#03045e", "#013a63", "#023e8a", "#01497c",
    "#14746f", "#0077b6", "#0096c7", "#2c7da0", "#2a9d8f", "#00b4d8",
    "#468faf", "#48cae4", "#61a5c2", "#89c2d9", "#90e0ef", "#a9d6e5",
    "#caf0f8", "#e0fbfc",
  ],
  // Night → purple dusk → fire → the last glow on the horizon.
  Sunset: [
    "#03071e", "#240046", "#370617", "#3c096c", "#5a189a", "#7b2cbf",
    "#9d4edd", "#c77dff", "#e0aaff", "#6a040f", "#9d0208", "#dc2f02",
    "#e85d04", "#f48c06", "#faa307", "#ffba08", "#ffd60a", "#ffe66d",
    "#ff8fa3", "#ffb4a2",
  ],
  Grayscale: [
    "#000000", "#0a0a0a", "#141414", "#1e1e1e", "#262626", "#2b3035",
    "#343a40", "#3d4348", "#495057", "#5c6369", "#6c757d", "#868e96",
    "#979ea6", "#adb5bd", "#bcc3ca", "#ced4da", "#dee2e6", "#f1f3f5",
    "#f8f9fa", "#ffffff",
  ],
};

/** The builtin palette names, in panel order. */
export const BUILTIN_PALETTE_NAMES: string[] = [
  ...Object.keys(SEED_COLORS),
  "Default",
];

/** The seed colors for a builtin palette name, or null if it isn't one. */
export function builtinColors(name: string): string[] | null {
  if (name === "Default") return [...BUILTIN_FALLBACK];
  const colors = SEED_COLORS[name];
  return colors ? [...colors] : null;
}

/** Forgiving hex scrubber: kind to a missing "#", lowercases, expands 3-char
 *  shorthand, strips an 8-char alpha pair. Rejects anything else (never salvages
 *  junk like "transparent"). Always yields opaque 6-digit hex or null. */
export function scrubHex(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (!/^[0-9a-f]+$/.test(s)) return null;
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  else if (s.length === 8) s = s.slice(0, 6);
  if (s.length !== 6) return null;
  return `#${s}`;
}

/** True only for canonical `#rrggbb` lowercase. */
export function isHexColor(s: string): boolean {
  return /^#[0-9a-f]{6}$/.test(s);
}

/** A unique id for a palette. */
export function generatePaletteId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** A fresh "Default" palette seeded with the fallback colors. */
export function makeDefaultPalette(): ColorPalette {
  return { id: generatePaletteId(), name: "Default", colors: [...BUILTIN_FALLBACK] };
}

/** The 8 seed palettes, with fresh ids (`Pastel` first — it is the default;
 *  the legacy `Default` set is kept, last). */
export function makeBuiltinPalettes(): ColorPalette[] {
  const seeded = Object.entries(SEED_COLORS).map(([name, colors]) => ({
    id: generatePaletteId(),
    name,
    colors: [...colors],
  }));
  return [...seeded, makeDefaultPalette()];
}

/** Coerce an unknown blob into a clean palette list (drops malformed entries). */
export function normalizePalettes(raw: unknown): ColorPalette[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ColorPalette[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.name !== "string") continue;
    if (seen.has(r.id)) continue;
    const colors = Array.isArray(r.colors)
      ? r.colors
          .map((c) => (typeof c === "string" ? scrubHex(c) : null))
          .filter((c): c is string => c !== null)
      : [];
    seen.add(r.id);
    out.push({ id: r.id, name: r.name, colors });
  }
  return out;
}

/** The first free "color set N" name for a new palette. */
export function nextSetName(palettes: ColorPalette[]): string {
  const taken = new Set(palettes.map((p) => p.name));
  let n = 1;
  while (taken.has(`color set ${n}`)) n++;
  return `color set ${n}`;
}
