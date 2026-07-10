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

describe("seeds", () => {
  it("ships 7 builtin palettes named Default first", () => {
    const b = makeBuiltinPalettes();
    expect(b).toHaveLength(7);
    expect(b[0].name).toBe("Default");
    expect(b[0].colors).toEqual(BUILTIN_FALLBACK);
    expect(new Set(b.map((p) => p.id)).size).toBe(7); // unique ids
  });
  it("makeDefaultPalette is a fresh Default with the fallback colors", () => {
    const p = makeDefaultPalette();
    expect(p.name).toBe("Default");
    expect(p.colors).toEqual(BUILTIN_FALLBACK);
  });
});

describe("nextSetName", () => {
  it("returns the first free 'color set N'", () => {
    expect(nextSetName([])).toBe("color set 1");
    expect(nextSetName([{ id: "1", name: "color set 1", colors: [] }])).toBe("color set 2");
  });
});
