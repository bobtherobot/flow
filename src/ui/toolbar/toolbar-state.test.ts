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
  it("redocks a drop at or left of its own slot", () => {
    expect(shouldRedock(0, 0)).toBe(true);
    expect(shouldRedock(44, 44)).toBe(true);
    expect(shouldRedock(20, 44)).toBe(true);
  });

  it("redocks a drop just short of the slot's margin", () => {
    expect(shouldRedock(9, 0)).toBe(true);
    expect(shouldRedock(54, 44)).toBe(false);
  });

  it("leaves a drop out past the margin floating", () => {
    expect(shouldRedock(300, 0)).toBe(false);
    expect(shouldRedock(300, 44)).toBe(false);
  });
});
