import { describe, it, expect } from "vitest";
import {
  TOOL_RAIL_WIDTH,
  SHAPE_RAIL_WIDTH,
  isRailDocked,
  railGutter,
  shapebarDockLeft,
} from "./rail-layout";
import { DEFAULT_TOOLBAR_STATE } from "./toolbar-state";

const docked = DEFAULT_TOOLBAR_STATE;
const floating = { ...DEFAULT_TOOLBAR_STATE, floating: true };
const hidden = { ...DEFAULT_TOOLBAR_STATE, visible: false };

describe("rail widths", () => {
  it("is 44px for the toolbar — one 36px column plus padding", () => {
    expect(TOOL_RAIL_WIDTH).toBe(44);
  });

  it("is 80px for the shapebar — two 36px columns plus padding", () => {
    expect(SHAPE_RAIL_WIDTH).toBe(80);
  });
});

describe("isRailDocked", () => {
  it("needs both visible and not floating", () => {
    expect(isRailDocked(docked)).toBe(true);
    expect(isRailDocked(floating)).toBe(false);
    expect(isRailDocked(hidden)).toBe(false);
  });
});

describe("railGutter", () => {
  it("sums both docked rails", () => {
    expect(railGutter(docked, docked)).toBe(124);
  });

  it("counts only the docked one", () => {
    expect(railGutter(docked, floating)).toBe(44);
    expect(railGutter(hidden, docked)).toBe(80);
  });

  it("reserves nothing when neither is docked", () => {
    expect(railGutter(floating, hidden)).toBe(0);
  });
});

describe("shapebarDockLeft", () => {
  it("clears a docked toolbar", () => {
    expect(shapebarDockLeft(docked)).toBe(44);
  });

  it("slides to the screen edge when the toolbar is floating or hidden", () => {
    expect(shapebarDockLeft(floating)).toBe(0);
    expect(shapebarDockLeft(hidden)).toBe(0);
  });
});
