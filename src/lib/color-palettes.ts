// src/lib/color-palettes.ts

/** A named, ordered set of opaque swatch colors. */
export interface ColorPalette {
  id: string;
  name: string;
  colors: string[]; // "#rrggbb" lowercase
}

/** The 16 colors flow shipped as hardcoded picker presets. Also the safety net. */
export const BUILTIN_FALLBACK: string[] = [
  "#1e1e1e", "#343a40", "#495057", "#868e96", "#ced4da", "#ffffff",
  "#e03131", "#e8590c", "#f08c00", "#2f9e44", "#099268", "#1971c2",
  "#4263eb", "#7048e8", "#ae3ec9", "#c2255c",
];

const SEED_COLORS: Record<string, string[]> = {
  Pastel: ["#ffd6e0", "#ffe5b4", "#fff3b0", "#d0f4de", "#b8e0d2", "#a9def9", "#cddafd", "#d3c4f5", "#e4c1f9", "#fcd5ce"],
  Vibrant: ["#ff004d", "#ff8500", "#ffd500", "#00c853", "#00b8d4", "#2962ff", "#651fff", "#aa00ff", "#ff1493"],
  Earth: ["#4b3621", "#6f4e37", "#a0785a", "#c19a6b", "#d2b48c", "#8a9a5b", "#556b2f", "#b7410e", "#8d6e63", "#5d4037"],
  Ocean: ["#03045e", "#023e8a", "#0077b6", "#0096c7", "#00b4d8", "#48cae4", "#90e0ef", "#caf0f8", "#2a9d8f"],
  Sunset: ["#03071e", "#370617", "#6a040f", "#9d0208", "#dc2f02", "#e85d04", "#f48c06", "#faa307", "#ffba08"],
  Grayscale: ["#000000", "#1e1e1e", "#343a40", "#495057", "#868e96", "#adb5bd", "#ced4da", "#dee2e6", "#f1f3f5", "#ffffff"],
};

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

/** The 7 seed palettes, with fresh ids ("Default" first). */
export function makeBuiltinPalettes(): ColorPalette[] {
  const rest = Object.entries(SEED_COLORS).map(([name, colors]) => ({
    id: generatePaletteId(),
    name,
    colors: [...colors],
  }));
  return [makeDefaultPalette(), ...rest];
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
