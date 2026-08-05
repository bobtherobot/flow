// src/lib/color-palettes.test.ts
import { describe, it, expect } from "vitest";
import {
  scrubHex,
  isHexColor,
  normalizePalettes,
  makeBuiltinPalettes,
  makeDefaultPalette,
  nextSetName,
  BUILTIN_FALLBACK,
} from "./color-palettes";

describe("scrubHex", () => {
  it("adds a missing leading #", () => expect(scrubHex("1e1e1e")).toBe("#1e1e1e"));
  it("lowercases", () => expect(scrubHex("#1E1E1E")).toBe("#1e1e1e"));
  it("expands 3-char shorthand", () => expect(scrubHex("#abc")).toBe("#aabbcc"));
  it("strips an 8-char alpha pair", () => expect(scrubHex("ff000080")).toBe("#ff0000"));
  it("rejects non-hex text", () => expect(scrubHex("transparent")).toBeNull());
  it("rejects wrong length", () => expect(scrubHex("#12ab")).toBeNull());
  it("rejects empty", () => expect(scrubHex("   ")).toBeNull());
});

describe("isHexColor", () => {
  it("accepts canonical", () => expect(isHexColor("#aabbcc")).toBe(true));
  it("rejects uppercase / alpha / shorthand", () => {
    expect(isHexColor("#AABBCC")).toBe(false);
    expect(isHexColor("#aabbccdd")).toBe(false);
    expect(isHexColor("#abc")).toBe(false);
  });
});

describe("normalizePalettes", () => {
  it("returns [] for non-arrays", () => expect(normalizePalettes({})).toEqual([]));
  it("drops entries without string id/name and scrubs colors", () => {
    const out = normalizePalettes([
      { id: "a", name: "A", colors: ["#FFFFFF", "nope", "#abc"] },
      { id: 5, name: "bad" },
      { name: "no id" },
    ]);
    expect(out).toEqual([{ id: "a", name: "A", colors: ["#ffffff", "#aabbcc"] }]);
  });
  it("dedupes ids, keeping the first", () => {
    const out = normalizePalettes([
      { id: "x", name: "first", colors: [] },
      { id: "x", name: "second", colors: [] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("first");
  });
});

/** sRGB relative luminance (WCAG), 0 = black, 1 = white. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** HSL hue in degrees; NaN for achromatic colors. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return NaN;
  const d = max - min;
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** Shortest distance between two hues on the 360° wheel. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe("seeds", () => {
  it("ships 8 builtin palettes named Pastel first", () => {
    const b = makeBuiltinPalettes();
    expect(b).toHaveLength(8);
    expect(b[0].name).toBe("Pastel");
    expect(new Set(b.map((p) => p.id)).size).toBe(8); // unique ids
  });

  it("gives every builtin palette exactly 20 colors", () => {
    for (const p of makeBuiltinPalettes()) {
      expect(`${p.name}:${p.colors.length}`).toBe(`${p.name}:20`);
    }
  });

  it("uses canonical, non-duplicated hex throughout", () => {
    for (const p of makeBuiltinPalettes()) {
      for (const c of p.colors) expect(isHexColor(c)).toBe(true);
      expect(new Set(p.colors).size).toBe(p.colors.length);
    }
  });

  it("pairs each Pastel & Vibrant swatch with a darker same-hue partner", () => {
    const paired = makeBuiltinPalettes().find((p) => p.name === "Pastel & Vibrant");
    expect(paired).toBeDefined();
    const colors = paired!.colors;

    for (let i = 0; i < colors.length; i += 2) {
      const pastel = colors[i];
      const vibrant = colors[i + 1];
      // The pastel of each pair sits on the left and is the lighter of the two.
      expect(`${pastel}>${vibrant}`).toBe(
        luminance(pastel) > luminance(vibrant) ? `${pastel}>${vibrant}` : "lighter-first",
      );
      // "the same darker version" — same hue family, not merely a darker colour.
      expect(`${pastel}/${vibrant}:${Math.round(hueGap(hue(pastel), hue(vibrant)))}`).toBe(
        `${pastel}/${vibrant}:${Math.min(Math.round(hueGap(hue(pastel), hue(vibrant))), 20)}`,
      );
    }
  });

  it("makeDefaultPalette is a fresh Default with the fallback colors", () => {
    const p = makeDefaultPalette();
    expect(p.name).toBe("Default");
    expect(p.colors).toEqual(BUILTIN_FALLBACK);
  });

  it("keeps BUILTIN_FALLBACK in step with the palettes it backstops", () => {
    expect(BUILTIN_FALLBACK).toHaveLength(20);
    for (const c of BUILTIN_FALLBACK) expect(isHexColor(c)).toBe(true);
  });
});

describe("nextSetName", () => {
  it("returns the first free 'color set N'", () => {
    expect(nextSetName([])).toBe("color set 1");
    expect(nextSetName([{ id: "1", name: "color set 1", colors: [] }])).toBe("color set 2");
  });
});
