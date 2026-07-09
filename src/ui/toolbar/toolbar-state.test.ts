import { describe, it, expect } from "vitest";
import {
  DEFAULT_TOOLBAR_STATE,
  normalizeToolbarState,
  withHiddenToggled,
  shouldRedock,
} from "./toolbar-state";

describe("normalizeToolbarState", () => {
  it("returns the default for null/garbage", () => {
    expect(normalizeToolbarState(undefined)).toEqual(DEFAULT_TOOLBAR_STATE);
    expect(normalizeToolbarState("nope")).toEqual(DEFAULT_TOOLBAR_STATE);
    expect(normalizeToolbarState(42)).toEqual(DEFAULT_TOOLBAR_STATE);
  });

  it("keeps valid fields and fills missing ones from defaults", () => {
    const s = normalizeToolbarState({ visible: false, floating: true, x: 120, y: 80 });
    expect(s).toEqual({ visible: false, floating: true, x: 120, y: 80, hiddenTools: [] });
  });

  it("coerces hiddenTools to an array of strings", () => {
    expect(normalizeToolbarState({ hiddenTools: ["frame", 5, "image"] }).hiddenTools)
      .toEqual(["frame", "image"]);
    expect(normalizeToolbarState({ hiddenTools: "frame" }).hiddenTools).toEqual([]);
  });
});

describe("withHiddenToggled", () => {
  it("adds an id not present (immutably)", () => {
    const s = { ...DEFAULT_TOOLBAR_STATE, hiddenTools: [] };
    const next = withHiddenToggled(s, "frame");
    expect(next.hiddenTools).toEqual(["frame"]);
    expect(s.hiddenTools).toEqual([]); // original untouched
  });

  it("removes an id already present", () => {
    const s = { ...DEFAULT_TOOLBAR_STATE, hiddenTools: ["frame", "image"] };
    expect(withHiddenToggled(s, "frame").hiddenTools).toEqual(["image"]);
  });
});

describe("shouldRedock", () => {
  it("re-docks only when the left edge is within the tight 10px margin", () => {
    expect(shouldRedock(5)).toBe(true);
    expect(shouldRedock(20)).toBe(false);
    expect(shouldRedock(200)).toBe(false);
  });
});
