import { describe, it, expect } from "vitest";
import { cube } from "./cube";
import type { LocalPt } from "../types";
import {
  expectInsideBox,
  expectClosed,
  expectPathOutlineClosed,
  shoelaceSign,
  subpathVertices,
} from "./invariants";

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
    expectPathOutlineClosed(geom);
  });

  it("degrades safely at zero size", () => {
    const geom = cube(0, 0, { dx: 0.25, dy: 0.2 });
    expectInsideBox(geom, 0, 0);
    expectPathOutlineClosed(geom);
  });

  it("has a 6-point hexagon silhouette", () => {
    const geom = cube(200, 100, { dx: 0.25, dy: 0.2 });
    expect(geom.points).toHaveLength(6);
  });

  it("draws two subpaths: the silhouette and one interior retrace", () => {
    const geom = cube(200, 100, { dx: 0.25, dy: 0.2 });
    expect(geom.path).toBeDefined();
    expect(subpaths(geom.path!)).toHaveLength(2);
  });

  it("joins the front face's top-right corner to the extrusion tip", () => {
    // The silhouette supplies two of the three front-to-back connectors
    // implicitly ([0,top]→[dx,0] and [fw,h]→[w,fh]); this third one is interior,
    // so without it the top and right faces share no drawn boundary and the cube
    // reads as a flat hexagon with a rectangle inside.
    const w = 200;
    const h = 100;
    const geom = cube(w, h, { dx: 0.25, dy: 0.2 });
    const fw = w - 0.25 * w;
    const top = 0.2 * h;

    const interior = subpathVertices(subpaths(geom.path!)[1]);
    const drawsSegment = (a: LocalPt, b: LocalPt) =>
      interior.some(
        ([x, y], i) =>
          i < interior.length - 1 &&
          x === a[0] &&
          y === a[1] &&
          interior[i + 1][0] === b[0] &&
          interior[i + 1][1] === b[1],
      );

    expect(drawsSegment([fw, top], [w, 0])).toBe(true); // the connector
    expect(drawsSegment([0, top], [fw, top])).toBe(true); // front/top crease
    expect(drawsSegment([fw, top], [fw, h])).toBe(true); // front/right crease
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
    expectPathOutlineClosed(geom);
  });

  it("clamps dx/dy to their 0.02..0.6 bounds", () => {
    const over = cube(200, 100, { dx: 5, dy: 5 });
    const atBound = cube(200, 100, { dx: 0.6, dy: 0.6 });
    expect(over.points).toEqual(atBound.points);

    const under = cube(200, 100, { dx: -1, dy: -1 });
    const atFloor = cube(200, 100, { dx: 0.02, dy: 0.02 });
    expect(under.points).toEqual(atFloor.points);
  });

  // This is the property that keeps a filled cube from rendering with a hole
  // in its front face, so it is a real correctness claim, not a pinned detail.
  // Excalidraw fills every `generator.path`-based shape with
  // `ctx.fill("evenodd")`, under which any interior region *bounded* by a
  // subpath is subtracted from the fill — which is exactly what the old closed
  // front-face rectangle did. Retracing each interior line encloses zero area,
  // so even-odd crosses every interior point an even number of times and
  // subtracts nothing. Verified in a real browser: the front face fills.
  it("encloses zero area with its interior subpath, so the fill has no hole", () => {
    const geom = cube(200, 100, { dx: 0.25, dy: 0.2 });
    const interior = subpathVertices(subpaths(geom.path!)[1]);

    let twiceArea = 0;
    for (let i = 0; i < interior.length; i++) {
      const [x1, y1] = interior[i];
      const [x2, y2] = interior[(i + 1) % interior.length];
      twiceArea += x1 * y2 - x2 * y1;
    }

    expect(Math.abs(twiceArea)).toBeLessThan(1e-9);
    // The silhouette, by contrast, must enclose real area — it is the fill.
    expect(shoelaceSign(geom.points)).not.toBe(0);
  });
});
