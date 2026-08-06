import { describe, it, expect } from "vitest";
import {
  paddingApplies,
  paddingTargetIds,
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

describe("paddingTargetIds", () => {
  const labelled = { id: "c", type: "rectangle" };
  const bare = { id: "d", type: "rectangle" };
  const label = { id: "t", type: "text", containerId: "c" };

  it("keeps only the selected containers that hold bound text", () => {
    expect(paddingTargetIds([labelled, bare, label], { c: true, d: true })).toEqual({ c: true });
  });

  it("targets every labelled container in a multi-selection", () => {
    const second = { id: "e", type: "ellipse" };
    const secondLabel = { id: "u", type: "text", containerId: "e" };
    const elements = [labelled, second, label, secondLabel];
    expect(paddingTargetIds(elements, { c: true, e: true })).toEqual({ c: true, e: true });
  });

  it("ignores unselected containers and the bound text itself", () => {
    expect(paddingTargetIds([labelled, label], { t: true })).toEqual({});
    expect(paddingTargetIds([labelled, label], {})).toEqual({});
  });
});

describe("effectivePadding", () => {
  it("returns the explicit padding or the default", () => {
    expect(effectivePadding(container({ padding: 20 }))).toBe(20);
    expect(effectivePadding(container())).toBe(DEFAULT_BOUND_TEXT_PADDING);
  });
});
