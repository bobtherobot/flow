import { describe, it, expect } from "vitest";
import {
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  DEFAULT_GRID_SIZE,
  clampGridSize,
  isGridSize,
  DEFAULT_GRID_COLOR,
  isGridColor,
  boldGridColor,
} from "./grid";

describe("clampGridSize", () => {
  it("returns the default for NaN / non-finite input", () => {
    expect(clampGridSize(Number.NaN)).toBe(DEFAULT_GRID_SIZE);
    expect(clampGridSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_GRID_SIZE);
  });

  it("clamps below the minimum up to MIN_GRID_SIZE", () => {
    expect(clampGridSize(2)).toBe(MIN_GRID_SIZE);
    expect(clampGridSize(-40)).toBe(MIN_GRID_SIZE);
  });

  it("clamps above the maximum down to MAX_GRID_SIZE", () => {
    expect(clampGridSize(500)).toBe(MAX_GRID_SIZE);
  });

  it("rounds to the nearest step", () => {
    expect(clampGridSize(22)).toBe(20);
    expect(clampGridSize(23)).toBe(25);
    expect(clampGridSize(47)).toBe(45);
  });

  it("passes a valid in-range multiple through unchanged", () => {
    expect(clampGridSize(20)).toBe(20);
    expect(clampGridSize(50)).toBe(50);
  });
});

describe("isGridSize", () => {
  it("accepts finite numbers within range", () => {
    expect(isGridSize(5)).toBe(true);
    expect(isGridSize(20)).toBe(true);
    expect(isGridSize(100)).toBe(true);
  });

  it("rejects out-of-range, non-finite, and non-number values", () => {
    expect(isGridSize(4)).toBe(false);
    expect(isGridSize(101)).toBe(false);
    expect(isGridSize(Number.NaN)).toBe(false);
    expect(isGridSize("20")).toBe(false);
    expect(isGridSize(null)).toBe(false);
  });
});

describe("boldGridColor", () => {
  it("lightens each channel by 8 from the default", () => {
    // #dd = 221, +8 = 229 = #e5 — flow's bold lines are LIGHTER than the thin
    // ones, deliberately inverting upstream Excalidraw.
    expect(boldGridColor(DEFAULT_GRID_COLOR)).toBe("#e5e5e5");
  });

  it("lightens each channel independently", () => {
    expect(boldGridColor("#001020")).toBe("#081828");
  });

  it("clamps at ff instead of wrapping around", () => {
    expect(boldGridColor("#fefefe")).toBe("#ffffff");
    expect(boldGridColor("#ffffff")).toBe("#ffffff");
  });

  it("accepts #rgb shorthand", () => {
    // #abc expands to #aabbcc; aa+8=b2, bb+8=c3, cc+8=d4
    expect(boldGridColor("#abc")).toBe("#b2c3d4");
  });

  it("strips an alpha channel", () => {
    expect(boldGridColor("#dddddd80")).toBe("#e5e5e5");
  });

  it("uppercase input returns lowercase output", () => {
    expect(boldGridColor("#DDDDDD")).toBe("#e5e5e5");
  });

  it("returns the derived default for unparseable input", () => {
    expect(boldGridColor("banana")).toBe("#e5e5e5");
    expect(boldGridColor("")).toBe("#e5e5e5");
  });
});

describe("isGridColor", () => {
  it("accepts 3-, 6-, and 8-digit hex", () => {
    expect(isGridColor("#abc")).toBe(true);
    expect(isGridColor("#dddddd")).toBe(true);
    expect(isGridColor("#ddddddff")).toBe(true);
  });

  it("rejects non-hex and non-strings", () => {
    expect(isGridColor("dddddd")).toBe(false);
    expect(isGridColor("#gggggg")).toBe(false);
    expect(isGridColor("banana")).toBe(false);
    expect(isGridColor(null)).toBe(false);
    expect(isGridColor(20)).toBe(false);
  });
});
