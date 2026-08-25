import { describe, it, expect } from "vitest";
import {
  ARROW_DEPTH,
  ARROW_GAP,
  HALO,
  QUICK_ARROW_SIDES,
  arrowPlacement,
  edgeMidpoint,
  isInHaloRegion,
  toViewport,
  visibleSides,
  type Box,
  type Viewport,
} from "./quick-arrow-geometry";

/** Identity viewport: scene coords and viewport coords are the same numbers. */
const V: Viewport = { zoom: 1, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 };

/** 100x50 box at the origin, unrotated. Centre (50, 25). */
const box = (over: Partial<Box> = {}): Box => ({
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  ...over,
});

describe("toViewport", () => {
  it("applies scroll, then zoom, then the canvas offset", () => {
    const v: Viewport = { zoom: 2, scrollX: 10, scrollY: 5, offsetLeft: 100, offsetTop: 40 };
    expect(toViewport(0, 0, v)).toEqual({ x: 120, y: 50 });
  });
});

describe("edgeMidpoint", () => {
  it("returns the midpoint of each edge of an unrotated box", () => {
    expect(edgeMidpoint(box(), "n")).toEqual({ x: 50, y: 0 });
    expect(edgeMidpoint(box(), "e")).toEqual({ x: 100, y: 25 });
    expect(edgeMidpoint(box(), "s")).toEqual({ x: 50, y: 50 });
    expect(edgeMidpoint(box(), "w")).toEqual({ x: 0, y: 25 });
  });

  it("rotates the midpoint about the box centre", () => {
    // Quarter turn clockwise: the north edge's midpoint swings to the east.
    const m = edgeMidpoint(box({ angle: Math.PI / 2 }), "n");
    expect(m.x).toBeCloseTo(75);
    expect(m.y).toBeCloseTo(25);
  });
});

describe("arrowPlacement", () => {
  it("puts the glyph centre one gap plus half a depth outside the edge", () => {
    const p = arrowPlacement(box(), "n", V);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0 - ARROW_GAP - ARROW_DEPTH / 2);
    expect(p.rotation).toBeCloseTo(0);
  });

  it("points each side's glyph outward", () => {
    expect(arrowPlacement(box(), "e", V).rotation).toBeCloseTo(90);
    expect(arrowPlacement(box(), "s", V).rotation).toBeCloseTo(180);
    expect(arrowPlacement(box(), "w", V).rotation).toBeCloseTo(270);
  });

  it("offsets in VIEWPORT pixels, so zoom does not scale the gap", () => {
    const zoomed: Viewport = { ...V, zoom: 4 };
    const p = arrowPlacement(box(), "n", zoomed);
    // The edge midpoint is at viewport y = 0; the glyph is the same physical
    // distance out as at zoom 1. If the offset were applied in scene space it
    // would be 4x further away here.
    expect(p.y).toBeCloseTo(0 - ARROW_GAP - ARROW_DEPTH / 2);
  });

  it("rotates the glyph with the element", () => {
    const p = arrowPlacement(box({ angle: Math.PI / 2 }), "n", V);
    expect(p.rotation).toBeCloseTo(90);
  });
});

describe("visibleSides", () => {
  it("shows all four sides on a comfortably sized box", () => {
    expect(visibleSides(box(), V)).toEqual([...QUICK_ARROW_SIDES]);
  });

  it("hides the n/s glyphs on a box too narrow to hold them", () => {
    expect(visibleSides(box({ width: 10 }), V)).toEqual(["e", "w"]);
  });

  it("hides the e/w glyphs on a box too short to hold them", () => {
    expect(visibleSides(box({ height: 10 }), V)).toEqual(["n", "s"]);
  });

  it("measures the box in VIEWPORT pixels, so zooming in re-reveals them", () => {
    const zoomed: Viewport = { ...V, zoom: 10 };
    expect(visibleSides(box({ width: 10 }), zoomed)).toEqual([...QUICK_ARROW_SIDES]);
  });
});

describe("isInHaloRegion", () => {
  it("accepts a point inside the box", () => {
    expect(isInHaloRegion(box(), V, 50, 25)).toBe(true);
  });

  it("accepts a point out in the halo, where the glyphs live", () => {
    expect(isInHaloRegion(box(), V, 50, -(ARROW_GAP + ARROW_DEPTH / 2))).toBe(true);
  });

  it("rejects a point past the halo", () => {
    expect(isInHaloRegion(box(), V, 50, -(HALO + 1))).toBe(false);
  });

  it("follows the element's rotation", () => {
    const rotated = box({ angle: Math.PI / 2 });
    // Centre is (50, 25); after a quarter turn the box is 50 wide and 100 tall,
    // so a point 40px above the centre is inside, and one 40px to the left is not.
    expect(isInHaloRegion(rotated, V, 50, -15)).toBe(true);
    expect(isInHaloRegion(rotated, V, -20, 25)).toBe(false);
  });
});
