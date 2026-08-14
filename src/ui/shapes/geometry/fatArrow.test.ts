import { describe, it, expect } from "vitest";
import { fatArrow } from "./fatArrow";
import { expectInsideBox, expectClosed } from "./invariants";

describe("fat arrow geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = fatArrow(w, h, { head: 0.4, stem: 0.4 });
    expect(geom.points).toHaveLength(7);
    expectClosed(geom);
    expectInsideBox(geom, w, h);
  });

  it("degrades safely at zero size", () => {
    const geom = fatArrow(0, 0, { head: 0.4, stem: 0.4 });
    expectInsideBox(geom, 0, 0);
  });

  it("has exactly 7 points", () => {
    const geom = fatArrow(200, 100, { head: 0.4, stem: 0.4 });
    expect(geom.points).toHaveLength(7);
  });

  it("places the tip exactly at [w, h/2]", () => {
    const w = 200;
    const h = 100;
    const geom = fatArrow(w, h, { head: 0.4, stem: 0.4 });
    // The tip is the 4th point (index 3).
    expect(geom.points[3]).toEqual([w, h / 2]);
  });

  it("spans the full height at stem: 1 without inverting top/bottom", () => {
    const w = 200;
    const h = 100;
    const geom = fatArrow(w, h, { head: 0.4, stem: 1 });
    const top = geom.points[0][1];
    const bottom = geom.points[6][1];
    expect(top).toBeCloseTo(0, 10);
    expect(bottom).toBeCloseTo(h, 10);
    expect(bottom).toBeGreaterThan(top);
    expectInsideBox(geom, w, h);
  });

  it("moves the shoulder left monotonically as head grows", () => {
    const w = 200;
    const h = 100;
    const heads = [0.05, 0.2, 0.4, 0.6, 0.95];
    // The shoulder (where the stem meets the head) is the 2nd point (index 1),
    // at [w - head, top].
    const shoulderXs = heads.map((head) => fatArrow(w, h, { head, stem: 0.4 }).points[1][0]);
    for (let i = 1; i < shoulderXs.length; i++) {
      expect(shoulderXs[i]).toBeLessThan(shoulderXs[i - 1]);
    }
  });

  it("clamps head to 0.05..0.95 and stem to 0.05..1", () => {
    const over = fatArrow(200, 100, { head: 5, stem: 5 });
    const atBound = fatArrow(200, 100, { head: 0.95, stem: 1 });
    expect(over.points).toEqual(atBound.points);

    const under = fatArrow(200, 100, { head: -1, stem: -1 });
    const atFloor = fatArrow(200, 100, { head: 0.05, stem: 0.05 });
    expect(under.points).toEqual(atFloor.points);
  });
});
