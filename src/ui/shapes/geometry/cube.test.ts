import { describe, it, expect } from "vitest";
import { cube } from "./cube";
import { expectInsideBox, expectClosed, expectPathSubpathsClosed } from "./invariants";

function subpaths(path: string): string[] {
  return path.split(/(?=M)/).filter((s) => s.trim().length > 0);
}

describe("cube geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = cube(w, h, { dx: 0.25, dy: 0.2 });
    expectClosed(geom);
    expectInsideBox(geom, w, h);
    expectPathSubpathsClosed(geom);
  });

  it("degrades safely at zero size", () => {
    const geom = cube(0, 0, { dx: 0.25, dy: 0.2 });
    expectInsideBox(geom, 0, 0);
    expectPathSubpathsClosed(geom);
  });

  it("has a 6-point hexagon silhouette", () => {
    const geom = cube(200, 100, { dx: 0.25, dy: 0.2 });
    expect(geom.points).toHaveLength(6);
  });

  it("draws exactly two subpaths: the silhouette and the front face's interior edges", () => {
    const geom = cube(200, 100, { dx: 0.25, dy: 0.2 });
    expect(geom.path).toBeDefined();
    expect(subpaths(geom.path!)).toHaveLength(2);
  });

  it("shrinks the front face's width monotonically as dx grows", () => {
    const w = 200;
    const h = 100;
    const dxs = [0.02, 0.1, 0.25, 0.4, 0.6];
    // The front face's bottom-right corner is the silhouette's 5th point
    // (index 4), at [fw, h] — its x-coordinate is exactly the front width.
    const frontWidths = dxs.map((dx) => cube(w, h, { dx, dy: 0.2 }).points[4][0]);
    for (let i = 1; i < frontWidths.length; i++) {
      expect(frontWidths[i]).toBeLessThan(frontWidths[i - 1]);
    }
  });

  it("keeps every point inside the box at the maximum dx/dy", () => {
    const geom = cube(200, 100, { dx: 0.6, dy: 0.6 });
    expectInsideBox(geom, 200, 100);
    expectPathSubpathsClosed(geom);
  });

  it("clamps dx/dy to their 0.02..0.6 bounds", () => {
    const over = cube(200, 100, { dx: 5, dy: 5 });
    const atBound = cube(200, 100, { dx: 0.6, dy: 0.6 });
    expect(over.points).toEqual(atBound.points);

    const under = cube(200, 100, { dx: -1, dy: -1 });
    const atFloor = cube(200, 100, { dx: 0.02, dy: 0.02 });
    expect(under.points).toEqual(atFloor.points);
  });
});
