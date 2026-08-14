import { describe, it, expect } from "vitest";
import type { FlowShapeKind } from "./types";
import { SHAPES_REGISTRY, defaultsFor, geometryFor } from "./registry";

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

  it("returns geometry for a known kind", () => {
    expect(geometryFor("triangle", 10, 10, {})?.points).toHaveLength(3);
  });

  it("returns null for an unknown kind rather than throwing", () => {
    expect(geometryFor("nope" as never, 10, 10, {})).toBeNull();
  });
});
