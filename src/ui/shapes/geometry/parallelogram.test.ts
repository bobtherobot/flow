import { describe, it, expect } from "vitest";
import { parallelogram } from "./parallelogram";
import { expectInsideBox, expectClosed } from "./invariants";

describe("parallelogram geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = parallelogram(w, h, { skew: 0.25 });
    expect(geom.points).toHaveLength(4);
    expectClosed(geom);
    expectInsideBox(geom, w, h);
  });

  it("degrades safely at zero size", () => {
    const geom = parallelogram(0, 0, { skew: 0.25 });
    expectInsideBox(geom, 0, 0);
  });

  it("degenerates to the box corners when skew is 0", () => {
    const geom = parallelogram(200, 100, { skew: 0 });
    expect(geom.points).toEqual([
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ]);
  });

  it("moves the first point right monotonically as skew increases", () => {
    const w = 200;
    const xs = [0, 0.1, 0.25, 0.5, 0.75, 1].map((skew) => parallelogram(w, 100, { skew }).points[0][0]);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });

  it("stays inside the box even at the maximum skew", () => {
    const geom = parallelogram(200, 100, { skew: 1 });
    expectInsideBox(geom, 200, 100);
    expectClosed(geom);
  });

  it("clamps skew outside 0..1", () => {
    const over = parallelogram(200, 100, { skew: 5 });
    const under = parallelogram(200, 100, { skew: -5 });
    expectInsideBox(over, 200, 100);
    expectInsideBox(under, 200, 100);
    expect(over.points).toEqual(parallelogram(200, 100, { skew: 1 }).points);
    expect(under.points).toEqual(parallelogram(200, 100, { skew: 0 }).points);
  });
});
