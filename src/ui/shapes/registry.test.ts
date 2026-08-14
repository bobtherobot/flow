import { describe, it, expect } from "vitest";
import type { FlowShapeKind } from "./types";
import { SHAPES_REGISTRY, defaultsFor } from "./registry";

describe("the shape registry", () => {
  it("has an entry for every kind, and every kind is a real entry", () => {
    const kinds: FlowShapeKind[] = [
      "triangle", "star", "cylinder", "cube", "parallelogram",
      "fatArrow", "cloud", "trapezoid", "tape", "sumJunction",
    ];
    expect(Object.keys(SHAPES_REGISTRY).sort()).toEqual([...kinds].sort());
  });

  it("gives each entry a kind matching its key", () => {
    for (const [key, def] of Object.entries(SHAPES_REGISTRY)) {
      expect(def.kind).toBe(key);
    }
  });

  it("gives each entry a non-empty label", () => {
    for (const [key, def] of Object.entries(SHAPES_REGISTRY)) {
      expect(def.label.length, `${key} has an empty label`).toBeGreaterThan(0);
    }
  });

  it("hands out a fresh defaults copy each time", () => {
    const a = defaultsFor("triangle");
    a.injected = 1;
    expect(defaultsFor("triangle").injected).toBeUndefined();
  });

  describe("parallelogram's skew handle", () => {
    const handle = SHAPES_REGISTRY.parallelogram.handles[0];

    it("at/from round-trip for an in-range value", () => {
      const [x, y] = handle.at(200, 100, { skew: 0.4 });
      expect(handle.from(x, y, 200, 100, { skew: 0.4 })).toEqual({ skew: 0.4 });
    });

    it("clamps from() to a max of 0.9, short of the geometry's own 1.0 limit", () => {
      expect(handle.from(1000, 0, 200, 100, {})).toEqual({ skew: 0.9 });
    });

    it("clamps from() to a min of 0", () => {
      expect(handle.from(-1000, 0, 200, 100, {})).toEqual({ skew: 0 });
    });
  });

  describe("trapezoid's inset handle", () => {
    const handle = SHAPES_REGISTRY.trapezoid.handles[0];

    it("at/from round-trip for an in-range value", () => {
      const [x, y] = handle.at(200, 100, { inset: 0.3 });
      expect(handle.from(x, y, 200, 100, { inset: 0.3 })).toEqual({ inset: 0.3 });
    });

    it("clamps from() to a max of 0.5, matching the geometry function's own limit", () => {
      expect(handle.from(1000, 0, 200, 100, {})).toEqual({ inset: 0.5 });
    });

    it("clamps from() to a min of 0", () => {
      expect(handle.from(-1000, 0, 200, 100, {})).toEqual({ inset: 0 });
    });
  });
});
