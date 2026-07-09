import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOTTOMBAR_STATE,
  normalizeBottombarState,
  shouldRedock,
  withHiddenToggled,
  type BottombarState,
} from "./bottombar-state";

describe("normalizeBottombarState", () => {
  it("returns the default for non-object input", () => {
    expect(normalizeBottombarState(null)).toEqual(DEFAULT_BOTTOMBAR_STATE);
    expect(normalizeBottombarState(42)).toEqual(DEFAULT_BOTTOMBAR_STATE);
    expect(normalizeBottombarState(undefined)).toEqual(DEFAULT_BOTTOMBAR_STATE);
  });

  it("fills missing fields from the default", () => {
    expect(normalizeBottombarState({ visible: false })).toEqual({
      ...DEFAULT_BOTTOMBAR_STATE,
      visible: false,
    });
  });

  it("keeps valid fields and drops non-string hidden ids", () => {
    const raw = { visible: true, floating: true, x: 12, y: 34, hiddenItems: ["search", 7, null] };
    expect(normalizeBottombarState(raw)).toEqual({
      visible: true,
      floating: true,
      x: 12,
      y: 34,
      hiddenItems: ["search"],
    });
  });

  it("defaults hiddenItems to empty when absent (nothing hidden by default)", () => {
    expect(normalizeBottombarState({}).hiddenItems).toEqual([]);
  });

  it("honors an explicit empty hiddenItems array", () => {
    expect(normalizeBottombarState({ hiddenItems: [] }).hiddenItems).toEqual([]);
  });
});

describe("withHiddenToggled", () => {
  const base: BottombarState = { ...DEFAULT_BOTTOMBAR_STATE };

  it("hides a visible item", () => {
    expect(withHiddenToggled(base, "search").hiddenItems).toContain("search");
  });

  it("re-shows a hidden item", () => {
    const hidden: BottombarState = { ...base, hiddenItems: ["search"] };
    expect(withHiddenToggled(hidden, "search").hiddenItems).not.toContain("search");
  });

  it("does not mutate the input", () => {
    const before = [...base.hiddenItems];
    withHiddenToggled(base, "zenMode");
    expect(base.hiddenItems).toEqual(before);
  });
});

describe("shouldRedock", () => {
  it("redocks only within the tight 10px margin of the bottom edge", () => {
    // viewport 800, bar 40 tall. bottom-gap = 800 - (top + 40).
    expect(shouldRedock(770, 40, 800)).toBe(true); // gap -10 (past the edge)
    expect(shouldRedock(755, 40, 800)).toBe(true); // gap 5 → within 10px
    expect(shouldRedock(745, 40, 800)).toBe(false); // gap 15 → just outside
  });

  it("stays floating when dropped in the middle", () => {
    expect(shouldRedock(300, 40, 800)).toBe(false);
  });
});
