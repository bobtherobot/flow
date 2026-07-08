import { describe, it, expect } from "vitest";
import { splitColorAlpha, combineColorAlpha } from "./color-alpha";

describe("splitColorAlpha", () => {
  it("treats a 6-digit hex as fully opaque", () => {
    expect(splitColorAlpha("#e03131")).toEqual({ hex: "#e03131", alpha: 100 });
  });

  it("parses an 8-digit hex into hue + opacity", () => {
    expect(splitColorAlpha("#e0313180")).toEqual({ hex: "#e03131", alpha: 50 });
    expect(splitColorAlpha("#e0313100")).toEqual({ hex: "#e03131", alpha: 0 });
  });

  it("expands a 3-digit hex", () => {
    expect(splitColorAlpha("#f00")).toEqual({ hex: "#ff0000", alpha: 100 });
  });

  it("maps transparent to zero opacity", () => {
    expect(splitColorAlpha("transparent")).toEqual({ hex: "transparent", alpha: 0 });
  });

  it("leaves an unknown format opaque and unchanged", () => {
    expect(splitColorAlpha("red")).toEqual({ hex: "red", alpha: 100 });
  });
});

describe("combineColorAlpha", () => {
  it("returns a 6-digit hex at full opacity", () => {
    expect(combineColorAlpha("#e03131", 100)).toBe("#e03131");
  });

  it("appends an alpha byte below full opacity", () => {
    expect(combineColorAlpha("#e03131", 50)).toBe("#e03131" + "80");
    expect(combineColorAlpha("#e03131", 0)).toBe("#e03131" + "00");
  });

  it("keeps transparent transparent", () => {
    expect(combineColorAlpha("transparent", 50)).toBe("transparent");
  });

  it("clamps out-of-range opacity", () => {
    expect(combineColorAlpha("#e03131", 150)).toBe("#e03131");
  });

  it("round-trips split → combine", () => {
    for (const c of ["#1971c2", "#e0313180", "#00000000"]) {
      const { hex, alpha } = splitColorAlpha(c);
      expect(splitColorAlpha(combineColorAlpha(hex, alpha))).toEqual({ hex, alpha });
    }
  });
});
