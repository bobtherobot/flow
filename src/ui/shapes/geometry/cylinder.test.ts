import { describe, it, expect } from "vitest";
import { cylinder } from "./cylinder";
import {
  expectInsideBox,
  expectClosed,
  expectPathSubpathsClosed,
  shoelaceSign,
  splitSubpaths,
  subpathVertices,
} from "./invariants";

/** Parses `M x y L x y ... Z` into its list of y-coordinates. */
function subpathYs(subpath: string): number[] {
  const nums = subpath
    .trim()
    .split(/\s+/)
    .filter((tok) => tok !== "M" && tok !== "L" && tok.toUpperCase() !== "Z");
  const ys: number[] = [];
  for (let i = 1; i < nums.length; i += 2) {
    ys.push(Number(nums[i]));
  }
  return ys;
}

function subpaths(path: string): string[] {
  return path.split(/(?=M)/).filter((s) => s.trim().length > 0);
}

describe("cylinder geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = cylinder(w, h, { cap: 0.18 });
    expectClosed(geom);
    expectInsideBox(geom, w, h);
    expectPathSubpathsClosed(geom);
  });

  it("degrades safely at zero size", () => {
    const geom = cylinder(0, 0, { cap: 0.18 });
    expectInsideBox(geom, 0, 0);
    expectPathSubpathsClosed(geom);
  });

  it("draws exactly two subpaths: the silhouette and the front cap arc", () => {
    const geom = cylinder(200, 100, { cap: 0.18 });
    expect(geom.path).toBeDefined();
    expect(subpaths(geom.path!)).toHaveLength(2);
  });

  it("lowers the front cap arc's crest monotonically as cap grows", () => {
    const w = 200;
    const h = 100;
    const caps = [0.02, 0.1, 0.2, 0.3, 0.45];
    const crests = caps.map((cap) => {
      const geom = cylinder(w, h, { cap });
      const [, front] = subpaths(geom.path!);
      return Math.max(...subpathYs(front));
    });
    for (let i = 1; i < crests.length; i++) {
      expect(crests[i]).toBeGreaterThan(crests[i - 1]);
    }
  });

  it("clamps cap at 0.45 so the two caps never cross", () => {
    const over = cylinder(200, 100, { cap: 0.9 });
    const atBound = cylinder(200, 100, { cap: 0.45 });
    expect(over.points).toEqual(atBound.points);
    expectInsideBox(over, 200, 100);
    expectPathSubpathsClosed(over);
  });

  it("clamps cap at its 0.02 floor", () => {
    const under = cylinder(200, 100, { cap: -1 });
    const atFloor = cylinder(200, 100, { cap: 0.02 });
    expect(under.points).toEqual(atFloor.points);
  });

  // Fill-winding regression lock: this is a *pin*, not a proof — see
  // cylinder.ts's fill-winding comment for why. Empirically (verified in a
  // real browser, not derivable from a simple ray-casting argument), the
  // front-cap subpath must traverse its two points shared with the
  // silhouette in the same relative direction the silhouette does, or the
  // cap lens renders as a hole through to the canvas the moment the shape
  // has a non-transparent fill. This test pins the shoelace-sign
  // relationship that was verified (browser, `cap: 0.18`, both default and
  // zero roughness) to render correctly, so a future edit can't silently
  // flip it back.
  it("winds the front-cap subpath the same direction as the silhouette", () => {
    const geom = cylinder(200, 100, { cap: 0.18 });
    const silhouetteSign = shoelaceSign(geom.points);
    const [, frontCapSubpath] = splitSubpaths(geom.path!);
    const frontCapSign = shoelaceSign(subpathVertices(frontCapSubpath));
    expect(silhouetteSign).not.toBe(0);
    expect(frontCapSign).not.toBe(0);
    expect(frontCapSign).toBe(silhouetteSign);
  });
});
