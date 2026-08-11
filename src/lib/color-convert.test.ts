import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb,
  hexToHsv, hsvToHex, hexToHsl, hslToHex, hsvToHsl, hslToHsv,
} from "./color-convert";

describe("hexToRgb", () => {
  it("parses a 6-digit hex", () => {
    expect(hexToRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("accepts uppercase and a 3-digit shorthand", () => {
    expect(hexToRgb("#F00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("rejects junk", () => {
    expect(hexToRgb("transparent")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("formats lowercase and zero-padded", () => {
    expect(rgbToHex({ r: 0, g: 8, b: 255 })).toBe("#0008ff");
  });

  it("clamps and rounds out-of-range channels", () => {
    expect(rgbToHex({ r: -5, g: 127.6, b: 300 })).toBe("#0080ff");
  });
});

describe("rgb <-> hsv", () => {
  it("reads pure red", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
  });

  it("reads black with no hue or saturation", () => {
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("round-trips a mid tone", () => {
    const rgb = { r: 32, g: 145, b: 194 };
    expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
  });

  it("builds green from hsv", () => {
    expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("wraps a hue of 360 back to 0", () => {
    expect(hsvToRgb({ h: 360, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 });
  });
});

describe("rgb <-> hsl", () => {
  it("reads a 50% lightness pure hue", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("reads white as fully light and unsaturated", () => {
    expect(rgbToHsl({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, l: 100 });
  });

  it("round-trips a mid tone", () => {
    const rgb = { r: 32, g: 145, b: 194 };
    expect(hslToRgb(rgbToHsl(rgb))).toEqual(rgb);
  });
});

describe("hex convenience wrappers", () => {
  it("round-trips hex through hsv", () => {
    expect(hsvToHex(hexToHsv("#2091c2")!)).toBe("#2091c2");
  });

  it("round-trips hex through hsl", () => {
    expect(hslToHex(hexToHsl("#2091c2")!)).toBe("#2091c2");
  });

  it("returns null from the hex readers on junk", () => {
    expect(hexToHsv("nope")).toBeNull();
    expect(hexToHsl("nope")).toBeNull();
  });
});

describe("float fidelity", () => {
  it("does not round inside conversions", () => {
    // #2091c2 has a fractional hue; rounding here would break the draft round-trip.
    const hsv = hexToHsv("#2091c2")!;
    expect(Number.isInteger(hsv.h)).toBe(false);
  });
});

describe("hsv <-> hsl", () => {
  it("round-trips a mid tone", () => {
    const hsv = hexToHsv("#2091c2")!;
    const back = hslToHsv(hsvToHsl(hsv));
    expect(hsvToHex(back)).toBe("#2091c2");
  });

  it("reads a pure hue as 50% lightness", () => {
    expect(hsvToHsl({ h: 0, s: 100, v: 100 })).toEqual({ h: 0, s: 100, l: 50 });
  });
});
