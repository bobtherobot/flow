import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUICKBAR_STATE,
  normalizeQuickbarState,
  withHiddenToggled,
  shouldRedock,
} from "./quickbar-state";
import { TOOL_ITEM_IDS } from "./actions";

describe("DEFAULT_QUICKBAR_STATE", () => {
  it("hides every tool by default (tools are opt-in)", () => {
    expect(DEFAULT_QUICKBAR_STATE.hiddenItems).toEqual([...TOOL_ITEM_IDS]);
    expect(DEFAULT_QUICKBAR_STATE.visible).toBe(true);
    expect(DEFAULT_QUICKBAR_STATE.floating).toBe(false);
  });
});

describe("normalizeQuickbarState", () => {
  it("returns the default for null/garbage", () => {
    expect(normalizeQuickbarState(undefined)).toEqual(DEFAULT_QUICKBAR_STATE);
    expect(normalizeQuickbarState("nope")).toEqual(DEFAULT_QUICKBAR_STATE);
    expect(normalizeQuickbarState(42)).toEqual(DEFAULT_QUICKBAR_STATE);
  });

  it("keeps valid fields and fills a missing hiddenItems with the default", () => {
    const s = normalizeQuickbarState({ visible: false, floating: true, x: 120, y: 8 });
    expect(s).toEqual({
      visible: false,
      floating: true,
      x: 120,
      y: 8,
      hiddenItems: [...TOOL_ITEM_IDS],
    });
  });

  it("respects an explicit empty hiddenItems (user un-hid everything)", () => {
    expect(normalizeQuickbarState({ hiddenItems: [] }).hiddenItems).toEqual([]);
  });

  it("coerces hiddenItems to an array of strings", () => {
    expect(normalizeQuickbarState({ hiddenItems: ["zenMode", 5, "gridMode"] }).hiddenItems)
      .toEqual(["zenMode", "gridMode"]);
    expect(normalizeQuickbarState({ hiddenItems: "zenMode" }).hiddenItems).toEqual([...TOOL_ITEM_IDS]);
  });
});

describe("withHiddenToggled", () => {
  it("adds an id not present (immutably)", () => {
    const s = { ...DEFAULT_QUICKBAR_STATE, hiddenItems: [] };
    const next = withHiddenToggled(s, "zenMode");
    expect(next.hiddenItems).toEqual(["zenMode"]);
    expect(s.hiddenItems).toEqual([]); // original untouched
  });

  it("removes an id already present (un-hides a tool)", () => {
    const s = { ...DEFAULT_QUICKBAR_STATE, hiddenItems: ["rectangle", "zenMode"] };
    expect(withHiddenToggled(s, "rectangle").hiddenItems).toEqual(["zenMode"]);
  });
});

describe("shouldRedock", () => {
  it("re-docks when the top edge is within the margin", () => {
    expect(shouldRedock(20)).toBe(true);
    expect(shouldRedock(200)).toBe(false);
  });
});
