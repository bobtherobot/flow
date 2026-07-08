import { describe, it, expect } from "vitest";
import {
  UNITS,
  isUnit,
  toPx,
  fromPx,
  roundForUnit,
  displayValue,
  unitStep,
} from "./units";

describe("isUnit", () => {
  it("accepts every known unit", () => {
    for (const u of UNITS) expect(isUnit(u)).toBe(true);
  });
  it("rejects unknown values", () => {
    expect(isUnit("furlong")).toBe(false);
    expect(isUnit(5)).toBe(false);
    expect(isUnit(null)).toBe(false);
  });
});

describe("toPx / fromPx at 96 DPI", () => {
  it("treats px as identity", () => {
    expect(toPx(12, "px")).toBe(12);
    expect(fromPx(12, "px")).toBe(12);
  });
  it("converts inches (96px)", () => {
    expect(toPx(1, "in")).toBe(96);
    expect(fromPx(96, "in")).toBe(1);
  });
  it("converts points (72pt per inch)", () => {
    expect(toPx(72, "pt")).toBeCloseTo(96, 6);
  });
  it("converts millimetres (25.4mm per inch)", () => {
    expect(toPx(25.4, "mm")).toBeCloseTo(96, 6);
  });
  it("round-trips px → unit → px", () => {
    for (const u of UNITS) expect(toPx(fromPx(40, u), u)).toBeCloseTo(40, 6);
  });
});

describe("roundForUnit", () => {
  it("rounds px to whole numbers", () => {
    expect(roundForUnit(3.7, "px")).toBe(4);
  });
  it("keeps mm to two decimals", () => {
    expect(roundForUnit(1.23456, "mm")).toBe(1.23);
  });
});

describe("displayValue", () => {
  it("shows a 96px stroke as 1in", () => {
    expect(displayValue(96, "in")).toBe(1);
  });
  it("rounds a px stroke to an integer", () => {
    expect(displayValue(2.4, "px")).toBe(2);
  });
});

describe("unitStep", () => {
  it("is 1 for px and sub-unit for finer units", () => {
    expect(unitStep("px")).toBe(1);
    expect(unitStep("mm")).toBe(0.01);
    expect(unitStep("in")).toBe(0.001);
  });
});
