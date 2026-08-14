import { describe, it, expect } from "vitest";
import { sumJunction } from "./sumJunction";
import { expectInsideBox, expectClosed, expectPathOutlineClosed } from "./invariants";

const SEGMENTS = 32;

function subpaths(path: string): string[] {
  return path.split(/(?=M)/).filter((s) => s.trim().length > 0);
}

describe("summing junction geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = sumJunction(w, h, {});
    expectClosed(geom);
    expectInsideBox(geom, w, h);
    expectPathOutlineClosed(geom);
  });

  it("degrades safely at zero size", () => {
    const geom = sumJunction(0, 0, {});
    expectInsideBox(geom, 0, 0);
    expectPathOutlineClosed(geom);
  });

  it(`has exactly SEGMENTS (${SEGMENTS}) points`, () => {
    const geom = sumJunction(200, 100, {});
    expect(geom.points).toHaveLength(SEGMENTS);
  });

  it("places every point on the inscribed ellipse", () => {
    const w = 200;
    const h = 100;
    const geom = sumJunction(w, h, {});
    const rx = w / 2;
    const ry = h / 2;
    const cx = rx;
    const cy = ry;
    for (const [x, y] of geom.points) {
      const normalized = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      expect(normalized).toBeCloseTo(1, 6);
    }
  });

  it("draws exactly three subpaths: the ring and the cross's two arms", () => {
    const geom = sumJunction(200, 100, {});
    expect(geom.path).toBeDefined();
    expect(subpaths(geom.path!)).toHaveLength(3);
  });

  it("touches the box edges exactly with the cross's endpoints", () => {
    const w = 200;
    const h = 100;
    const geom = sumJunction(w, h, {});
    expect(geom.path).toContain(`M ${w / 2} 0 L ${w / 2} ${h} Z`);
    expect(geom.path).toContain(`M 0 ${h / 2} L ${w} ${h / 2} Z`);
  });
});
