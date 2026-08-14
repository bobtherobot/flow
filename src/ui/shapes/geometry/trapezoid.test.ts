import { describe, it, expect } from "vitest";
import { trapezoid } from "./trapezoid";
import { expectInsideBox, expectClosed } from "./invariants";

describe("trapezoid geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = trapezoid(w, h, { inset: 0.2 });
    expect(geom.points).toHaveLength(4);
    expectClosed(geom);
    expectInsideBox(geom, w, h);
  });

  it("degrades safely at zero size", () => {
    const geom = trapezoid(0, 0, { inset: 0.2 });
    expectInsideBox(geom, 0, 0);
  });

  it("is a rectangle when inset is 0", () => {
    const geom = trapezoid(200, 100, { inset: 0 });
    expect(geom.points).toEqual([
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ]);
  });

  it("collapses the top edge to a single x at inset 0.5, without inverting", () => {
    const geom = trapezoid(200, 100, { inset: 0.5 });
    const [topLeft, topRight] = geom.points;
    expect(topLeft[0]).toBe(topRight[0]);
    expect(topLeft[0]).toBe(100);
    expectInsideBox(geom, 200, 100);
    expectClosed(geom);
  });

  it("clamps inset 0.9 to the same outline as 0.5", () => {
    const clamped = trapezoid(200, 100, { inset: 0.9 });
    const collapsed = trapezoid(200, 100, { inset: 0.5 });
    expect(clamped.points).toEqual(collapsed.points);
  });
});
