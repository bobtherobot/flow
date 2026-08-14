import { describe, it, expect } from "vitest";
import { cloud } from "./cloud";
import { expectInsideBox, expectClosed, expectPathSubpathsClosed } from "./invariants";
import type { LocalPt } from "../types";

const BUMPS = 9;
const SAMPLES = 6;

/** The longest straight-line gap between any two consecutive outline points
 *  (wrapping around the last-to-first edge too). */
function maxChord(points: readonly LocalPt[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    max = Math.max(max, Math.hypot(x2 - x1, y2 - y1));
  }
  return max;
}

describe("cloud geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = cloud(w, h, {});
    expectClosed(geom);
    expectInsideBox(geom, w, h);
    expectPathSubpathsClosed(geom);
  });

  it("degrades safely at zero size", () => {
    const geom = cloud(0, 0, {});
    expectInsideBox(geom, 0, 0);
    expectPathSubpathsClosed(geom);
  });

  it(`has BUMPS * (SAMPLES + 1) = ${BUMPS * (SAMPLES + 1)} points`, () => {
    const geom = cloud(200, 100, {});
    expect(geom.points).toHaveLength(BUMPS * (SAMPLES + 1));
  });

  it.each([
    ["wide box", 240, 100],
    ["tall box", 100, 240],
    ["square box", 160, 160],
  ])("keeps every point inside a %s", (_label, w, h) => {
    const geom = cloud(w, h, {});
    expectInsideBox(geom, w, h);
  });

  it("does not repeat its first point as its last", () => {
    const geom = cloud(200, 100, {});
    const first = geom.points[0];
    const last = geom.points[geom.points.length - 1];
    expect(first[0] === last[0] && first[1] === last[1]).toBe(false);
  });

  // The bug this guards: bump radius used to be a single scalar derived from
  // `min(rx, ry)`, so as a box got wide, adjacent bump centres (placed at
  // equal *parametric* angle) drifted apart along the long axis while the
  // radius bridging them stayed pinned to the short one -- the longest gap
  // between consecutive outline points grew without bound (measured 95.8px
  // at 400x100, 180.6px at 600x60 with the old formula -- a visibly spiky
  // polygon with flat notches). Raising the sample count cannot fix this: the
  // geometry has a real gap to close, not an under-sampling artifact. Bounds
  // the chord relative to the box's own perimeter (not a fixed px number) so
  // this stays meaningful at any size, not just the sizes measured here.
  describe("stays visually scalloped at any aspect ratio", () => {
    it.each([
      ["square", 160, 160],
      ["wide", 400, 100],
      ["very wide", 600, 60],
    ])(
      "keeps the longest gap between consecutive points proportional to a %s box",
      (_label, w, h) => {
        const geom = cloud(w, h, {});
        const chord = maxChord(geom.points);
        const boxPerimeter = 2 * (w + h);
        expect(chord).toBeLessThan(boxPerimeter * 0.06);
      },
    );
  });
});
