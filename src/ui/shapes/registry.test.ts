import { describe, it, expect } from "vitest";
import { SHAPES_REGISTRY, defaultsFor, geometryFor } from "./registry";

describe("the shape registry", () => {
  it("gives each entry a kind matching its key", () => {
    for (const [key, def] of Object.entries(SHAPES_REGISTRY)) {
      if (!def) continue;
      expect(def.kind).toBe(key);
    }
  });

  it("gives each entry a non-empty label", () => {
    for (const def of Object.values(SHAPES_REGISTRY)) {
      if (!def) continue;
      expect(def.label.length).toBeGreaterThan(0);
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
