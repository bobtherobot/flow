import { describe, it, expect } from "vitest";
import {
  paddingApplies,
  effectivePadding,
  hasBoundText,
  DEFAULT_BOUND_TEXT_PADDING,
  type PaddingElement,
} from "./padding";

const container = (over: Partial<PaddingElement> = {}): PaddingElement => ({
  id: "c",
  type: "rectangle",
  ...over,
});

const boundText = { type: "text", containerId: "c" };
const looseText = { type: "text", containerId: null };

describe("hasBoundText", () => {
  it("detects a text element bound to the container", () => {
    expect(hasBoundText(container(), [boundText])).toBe(true);
    expect(hasBoundText(container(), [looseText])).toBe(false);
    expect(hasBoundText(container(), [])).toBe(false);
  });
});

describe("paddingApplies", () => {
  it("applies to shape containers that hold bound text", () => {
    expect(paddingApplies(container({ type: "rectangle" }), [boundText])).toBe(true);
    expect(paddingApplies(container({ type: "ellipse" }), [boundText])).toBe(true);
    expect(paddingApplies(container({ type: "diamond" }), [boundText])).toBe(true);
  });

  it("does not apply without bound text, to arrows, or to no selection", () => {
    expect(paddingApplies(container(), [])).toBe(false);
    expect(paddingApplies(container({ type: "arrow" }), [boundText])).toBe(false);
    expect(paddingApplies(null, [boundText])).toBe(false);
  });
});

describe("effectivePadding", () => {
  it("returns the explicit padding or the default", () => {
    expect(effectivePadding(container({ padding: 20 }))).toBe(20);
    expect(effectivePadding(container())).toBe(DEFAULT_BOUND_TEXT_PADDING);
  });
});
