import { describe, it, expect } from "vitest";
import { triangle } from "./triangle";
import { expectInsideBox, expectClosed } from "./invariants";

describe("triangle geometry", () => {
  it("is a three-point outline inside the box", () => {
    const geom = triangle(200, 100, {});
    expect(geom.points).toHaveLength(3);
    expectClosed(geom);
    expectInsideBox(geom, 200, 100);
  });

  it("puts the apex on the top edge's centre and the base on the bottom edge", () => {
    const geom = triangle(200, 100, {});
    expect(geom.points).toEqual([
      [100, 0],
      [200, 100],
      [0, 100],
    ]);
  });

  it("scales with the box rather than assuming a square", () => {
    const geom = triangle(40, 400, {});
    expectInsideBox(geom, 40, 400);
    expect(geom.points[0]).toEqual([20, 0]);
  });

  it("degrades safely at zero size", () => {
    const geom = triangle(0, 0, {});
    expectInsideBox(geom, 0, 0);
  });
});
