import { describe, it, expect } from "vitest";
import { star } from "./star";
import { expectInsideBox, expectClosed } from "./invariants";

function dist(cx: number, cy: number, [x, y]: readonly [number, number]): number {
  return Math.hypot(x - cx, y - cy);
}

describe("star geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = star(w, h, {});
    expectClosed(geom);
    expectInsideBox(geom, w, h);
  });

  it("degrades safely at zero size", () => {
    const geom = star(0, 0, {});
    expectInsideBox(geom, 0, 0);
  });

  it("has exactly 10 points", () => {
    const geom = star(200, 100, {});
    expect(geom.points).toHaveLength(10);
  });

  it("alternates radii so even-indexed points are farther from centre than odd", () => {
    const w = 200;
    const h = 100;
    const geom = star(w, h, {});
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < geom.points.length; i += 2) {
      const outer = dist(cx, cy, geom.points[i]);
      const inner = dist(cx, cy, geom.points[i + 1]);
      expect(outer).toBeGreaterThan(inner);
    }
  });

  it("puts a point at the top edge's centre when rot is 0", () => {
    const geom = star(200, 100, { rot: 0 });
    expect(geom.points[0][0]).toBeCloseTo(100, 5);
    expect(geom.points[0][1]).toBeCloseTo(0, 5);
  });

  it("returns to the same outline at rot 1 as rot 0, within float tolerance", () => {
    const a = star(200, 100, { rot: 0 });
    const b = star(200, 100, { rot: 1 });
    expect(a.points).toHaveLength(b.points.length);
    for (let i = 0; i < a.points.length; i++) {
      expect(b.points[i][0]).toBeCloseTo(a.points[i][0], 5);
      expect(b.points[i][1]).toBeCloseTo(a.points[i][1], 5);
    }
  });
});
