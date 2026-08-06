import { describe, it, expect } from "vitest";
import {
  cornerRadiusApplies,
  radiusTargetIds,
  effectiveCornerRadius,
  cornerRadiusUpdate,
  DEFAULT_ELBOW_RADIUS,
  type RadiusElement,
} from "./corner-radius";

const el = (over: Partial<RadiusElement> = {}): RadiusElement => ({
  id: "a",
  type: "rectangle",
  width: 200,
  height: 100,
  ...over,
});

describe("cornerRadiusApplies", () => {
  it("is true for rectangle, diamond and elbow arrows", () => {
    expect(cornerRadiusApplies(el({ type: "rectangle" }))).toBe(true);
    expect(cornerRadiusApplies(el({ type: "diamond" }))).toBe(true);
    expect(cornerRadiusApplies(el({ type: "arrow", elbowed: true }))).toBe(true);
  });

  it("is false for ellipse, plain arrows, text and no selection", () => {
    expect(cornerRadiusApplies(el({ type: "ellipse" }))).toBe(false);
    expect(cornerRadiusApplies(el({ type: "arrow", elbowed: false }))).toBe(false);
    expect(cornerRadiusApplies(el({ type: "text" }))).toBe(false);
    expect(cornerRadiusApplies(null)).toBe(false);
  });
});

describe("radiusTargetIds", () => {
  it("keeps only the selected elements a radius applies to", () => {
    const elements = [
      el({ id: "rect" }),
      el({ id: "ell", type: "ellipse" }),
      el({ id: "elbow", type: "arrow", elbowed: true }),
    ];
    expect(radiusTargetIds(elements, { rect: true, ell: true, elbow: true })).toEqual({
      rect: true,
      elbow: true,
    });
  });

  it("ignores unselected elements and returns empty when none apply", () => {
    const elements = [el({ id: "rect" }), el({ id: "ell", type: "ellipse" })];
    expect(radiusTargetIds(elements, { ell: true })).toEqual({});
    expect(radiusTargetIds(elements, {})).toEqual({});
  });
});

describe("effectiveCornerRadius", () => {
  it("returns the explicit radius when set", () => {
    expect(effectiveCornerRadius(el({ cornerRadius: 24 }))).toBe(24);
  });

  it("defaults an elbow arrow to the vendor constant", () => {
    expect(effectiveCornerRadius(el({ type: "arrow", elbowed: true }))).toBe(DEFAULT_ELBOW_RADIUS);
  });

  it("derives the adaptive radius for a rounded rectangle (fixed above cutoff)", () => {
    // width/height 200/100 → x=100, cutoff = 32/0.25 = 128, 100<=128 → x*0.25.
    expect(effectiveCornerRadius(el({ roundness: { type: 3 } }))).toBe(25);
    // Larger shape clamps to the fixed 32.
    expect(effectiveCornerRadius(el({ width: 400, height: 400, roundness: { type: 3 } }))).toBe(32);
  });

  it("returns 0 for a sharp shape", () => {
    expect(effectiveCornerRadius(el({ roundness: null }))).toBe(0);
  });
});

describe("cornerRadiusUpdate", () => {
  it("sets radius + roundness for a rectangle, clearing to sharp at 0", () => {
    expect(cornerRadiusUpdate(el(), 12)).toEqual({ cornerRadius: 12, roundness: { type: 2 } });
    expect(cornerRadiusUpdate(el(), 0)).toEqual({ cornerRadius: 0, roundness: null });
  });

  it("sets only cornerRadius for an elbow arrow", () => {
    expect(cornerRadiusUpdate(el({ type: "arrow", elbowed: true }), 8)).toEqual({ cornerRadius: 8 });
  });
});
