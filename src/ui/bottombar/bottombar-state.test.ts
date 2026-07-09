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
  it("redocks when dropped near the bottom edge", () => {
    // viewport 800 tall, bar 40 tall dropped with top at 780 → bottom-gap 0-ish
    expect(shouldRedock(770, 40, 800)).toBe(true);
  });

  it("stays floating when dropped in the middle", () => {
    expect(shouldRedock(300, 40, 800)).toBe(false);
  });
});
