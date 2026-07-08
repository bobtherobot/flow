/**
 * Split/combine a color into hue (`#rrggbb`) and a 0–100 opacity, so the panels
 * can offer an independent opacity per swatch. Excalidraw's element `opacity` is
 * a single value for the whole element, so per-color opacity is carried in the
 * color string itself as 8-digit hex (`#rrggbbaa`) — which the canvas renderer
 * honors and Excalidraw stores/round-trips untouched. Pure; unit-tested.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i;
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

function alphaByteToPercent(byte: number): number {
  return Math.round((byte / 255) * 100);
}

function percentToAlphaByte(percent: number): string {
  return clamp(Math.round((percent / 100) * 255), 0, 255)
    .toString(16)
    .padStart(2, "0");
}

export interface ColorParts {
  /** Hue as `#rrggbb` (lowercase), or "transparent". */
  hex: string;
  /** Opacity 0–100. */
  alpha: number;
}

/** Split a color string into its hue and 0–100 opacity. */
export function splitColorAlpha(color: string): ColorParts {
  if (color === "transparent") return { hex: "transparent", alpha: 0 };

  const eight = HEX8.exec(color);
  if (eight) {
    return { hex: `#${eight[1].toLowerCase()}`, alpha: alphaByteToPercent(parseInt(eight[2], 16)) };
  }
  if (HEX6.test(color)) return { hex: color.toLowerCase(), alpha: 100 };

  const three = HEX3.exec(color);
  if (three) {
    const [, r, g, b] = three;
    return { hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), alpha: 100 };
  }
  // Unknown format (named color, rgb()) — treat as fully opaque, leave as-is.
  return { hex: color, alpha: 100 };
}

/** Combine a hue (`#rrggbb` or "transparent") and 0–100 opacity into a color. */
export function combineColorAlpha(hex: string, alpha: number): string {
  if (hex === "transparent") return "transparent";
  const clamped = clamp(alpha, 0, 100);
  const base = HEX6.test(hex) ? hex.toLowerCase() : hex;
  if (clamped >= 100) return base;
  return `${base}${percentToAlphaByte(clamped)}`;
}
