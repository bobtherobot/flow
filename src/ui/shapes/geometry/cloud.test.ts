import { describe, it, expect } from "vitest";
import { cloud } from "./cloud";
import { expectInsideBox, expectClosed, expectPathSubpathsClosed } from "./invariants";

const BUMPS = 9;
const SAMPLES = 6;

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
});
