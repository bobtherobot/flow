import { describe, it, expect } from "vitest";
import { clampMenuPosition } from "./menu-position";

const VP = { width: 1000, height: 800 };
const SIZE = { width: 184, height: 220 };

describe("clampMenuPosition", () => {
  it("leaves an anchor that already fits untouched", () => {
    expect(clampMenuPosition({ top: 100, left: 100 }, SIZE, VP)).toEqual({
      top: 100,
      left: 100,
    });
  });

  it("pulls a right-overflowing menu back inside the viewport", () => {
    // Anchor near the right edge (as when the panel is docked right).
    const pos = clampMenuPosition({ top: 100, left: 970 }, SIZE, VP);
    expect(pos.left).toBe(VP.width - SIZE.width - 8); // 808
    expect(pos.left + SIZE.width).toBeLessThanOrEqual(VP.width);
  });

  it("pulls a bottom-overflowing menu up", () => {
    const pos = clampMenuPosition({ top: 700, left: 100 }, SIZE, VP);
    expect(pos.top).toBe(VP.height - SIZE.height - 8); // 572
    expect(pos.top + SIZE.height).toBeLessThanOrEqual(VP.height);
  });

  it("never positions before the top-left margin", () => {
    const pos = clampMenuPosition({ top: -50, left: -50 }, SIZE, VP);
    expect(pos).toEqual({ top: 8, left: 8 });
  });

  it("favors the top-left edge when the menu is larger than the viewport", () => {
    const huge = { width: 2000, height: 2000 };
    expect(clampMenuPosition({ top: 100, left: 100 }, huge, VP)).toEqual({
      top: 8,
      left: 8,
    });
  });

  it("respects a custom margin", () => {
    const pos = clampMenuPosition({ top: 100, left: 970 }, SIZE, VP, 20);
    expect(pos.left).toBe(VP.width - SIZE.width - 20); // 796
  });
});
