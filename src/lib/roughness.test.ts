import { describe, it, expect } from "vitest";
import { normalizeRoughness, isSloppiness } from "./roughness";

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

  it("normalizes up to Artist (1) when target is 1", () => {
    const input = [
      { id: "a", roughness: 0 },
      { id: "b", roughness: 2 },
    ];
    const result = normalizeRoughness(input, 1);
    expect(result.map((el) => el.roughness)).toEqual([1, 1]);
  });

  it("returns elements already at the target untouched by identity", () => {
    const clean = { id: "a", roughness: 2 };
    const result = normalizeRoughness([clean], 2);
    expect(result[0]).toBe(clean);
  });

  it("defaults the target to Architect (0) when omitted", () => {
    const input = [{ id: "a", roughness: 2 }];
    expect(normalizeRoughness(input)[0].roughness).toBe(0);
  });
});

describe("isSloppiness", () => {
  it("accepts 0, 1, 2", () => {
    expect(isSloppiness(0)).toBe(true);
    expect(isSloppiness(1)).toBe(true);
    expect(isSloppiness(2)).toBe(true);
  });
  it("rejects other numbers and non-numbers", () => {
    expect(isSloppiness(3)).toBe(false);
    expect(isSloppiness(-1)).toBe(false);
    expect(isSloppiness("1")).toBe(false);
    expect(isSloppiness(null)).toBe(false);
    expect(isSloppiness(NaN)).toBe(false);
  });
});
