import { describe, it, expect } from "vitest";
import { normalizeRoughness } from "./roughness";

describe("normalizeRoughness", () => {
  it("forces Artist/Cartoonist roughness down to Architect (0)", () => {
    const input = [
      { id: "a", roughness: 1 },
      { id: "b", roughness: 2 },
    ];

    const result = normalizeRoughness(input);

    expect(result.map((el) => el.roughness)).toEqual([0, 0]);
  });

  it("returns already-Architect elements untouched by identity", () => {
    const clean = { id: "a", roughness: 0 };

    const result = normalizeRoughness([clean]);

    // No needless object churn when nothing changes.
    expect(result[0]).toBe(clean);
  });

  it("does not mutate the input elements", () => {
    const input = [{ id: "a", roughness: 2 }];

    normalizeRoughness(input);

    expect(input[0].roughness).toBe(2);
  });

  it("preserves other element properties", () => {
    const input = [{ id: "a", roughness: 1, type: "rectangle", x: 10 }];

    const [result] = normalizeRoughness(input);

    expect(result).toEqual({ id: "a", roughness: 0, type: "rectangle", x: 10 });
  });

  it("handles an empty array", () => {
    expect(normalizeRoughness([])).toEqual([]);
  });
});
