import { describe, it, expect } from "vitest";
import {
  DEFAULT_TOOLBAR_STATE,
  normalizeToolbarState,
  withHiddenToggled,
  shouldRedock,
  type ToolbarState,
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

  describe("with a caller-supplied defaults object", () => {
    // Deliberately distinguishable from DEFAULT_TOOLBAR_STATE on every field,
    // so a version of `normalizeToolbarState` that silently fell back to the
    // hardcoded toolbar default (the bug this parameter exists to prevent)
    // would fail every assertion below rather than passing by coincidence —
    // unlike `getShapebarState`'s own junk-payload test, whose default
    // happens to be structurally identical to the toolbar's.
    const otherDefaults: ToolbarState = {
      visible: false,
      floating: true,
      x: 77,
      y: 88,
      hiddenTools: ["laser"],
    };

    it("returns the supplied defaults, not DEFAULT_TOOLBAR_STATE, for null/garbage", () => {
      expect(normalizeToolbarState(undefined, otherDefaults)).toEqual(otherDefaults);
      expect(normalizeToolbarState("nope", otherDefaults)).toEqual(otherDefaults);
    });

    it("fills missing fields from the supplied defaults, not the toolbar's", () => {
      expect(normalizeToolbarState({ x: 5 }, otherDefaults)).toEqual({
        ...otherDefaults,
        x: 5,
      });
    });

    it("falls back to the supplied defaults' hiddenTools when the field is invalid", () => {
      expect(normalizeToolbarState({ hiddenTools: "nope" }, otherDefaults).hiddenTools).toEqual([
        "laser",
      ]);
    });
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
