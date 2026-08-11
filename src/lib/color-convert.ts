/**
 * Pure color-space conversion. Alpha is deliberately absent — `color-alpha.ts`
 * owns the alpha byte and the 8-digit-hex storage convention, and these
 * functions only ever see the opaque hue.
 *
 * Conversions return **unrounded floats**. The picker keeps an HSV draft across
 * a drag, and rounding at each hop would drift the color a little on every
 * frame; only the numeric fields round, at display time.
 */

export interface Rgb {
  /** 0–255 */
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  v: number;
}

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Normalize any hue into [0, 360). */
const wrapHue = (h: number) => ((h % 360) + 360) % 360;

/** Shared hue/chroma decomposition for the two "…ToRgb" directions. */
function fromHueChroma(h: number, c: number, m: number): Rgb {
  const hp = wrapHue(h) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Hue in degrees from normalized channels, or 0 for an achromatic color. */
function hueOf(rn: number, gn: number, bn: number, max: number, d: number): number {
  if (d === 0) return 0;
  const h =
    max === rn ? 60 * (((gn - bn) / d) % 6)
    : max === gn ? 60 * ((bn - rn) / d + 2)
    : 60 * ((rn - gn) / d + 4);
  return h < 0 ? h + 360 : h;
}

/** Parse `#rgb` / `#rrggbb` (with or without the "#", any case). Null on junk. */
export function hexToRgb(hex: string): Rgb | null {
  let s = hex.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (!/^[0-9a-f]+$/.test(s)) return null;
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** Format as lowercase `#rrggbb`, clamping and rounding each channel. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const byte = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  return {
    h: hueOf(rn, gn, bn, max, d),
    s: max === 0 ? 0 : (d / max) * 100,
    v: max * 100,
  };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const c = vn * sn;
  return fromHueChroma(h, c, vn - c);
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  // The 1 - |2l - 1| denominator collapses to 0 at pure black and pure white.
  const denom = 1 - Math.abs(2 * l - 1);
  return {
    h: hueOf(rn, gn, bn, max, d),
    s: d === 0 || denom === 0 ? 0 : (d / denom) * 100,
    l: l * 100,
  };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  return fromHueChroma(h, c, ln - c / 2);
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  return rgb && rgbToHsv(rgb);
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexToRgb(hex);
  return rgb && rgbToHsl(rgb);
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}
