import { describe, it, expect } from "vitest";
import {
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  DEFAULT_GRID_SIZE,
  clampGridSize,
  isGridSize,
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
