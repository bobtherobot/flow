import { describe, it, expect } from "vitest";
import { tape } from "./tape";
import { expectInsideBox, expectClosed, expectPathSubpathsClosed } from "./invariants";

const SAMPLES = 24;

describe("tape geometry", () => {
  it.each([
    ["wide box", 200, 100],
    ["tall box", 100, 200],
  ])("stays inside and closed for a %s", (_label, w, h) => {
    const geom = tape(w, h, { amp: 0.12, wave: 0.5 });
    expectClosed(geom);
    expectInsideBox(geom, w, h);
    expectPathSubpathsClosed(geom);
  });

  it("degrades safely at zero size", () => {
    const geom = tape(0, 0, { amp: 0.12, wave: 0.5 });
    expectInsideBox(geom, 0, 0);
    expectPathSubpathsClosed(geom);
  });

  it("yields two straight parallel edges when amp is 0", () => {
    const w = 200;
    const h = 100;
    const geom = tape(w, h, { amp: 0, wave: 0.5 });
    const top = geom.points.slice(0, SAMPLES + 1);
    const bottom = geom.points.slice(SAMPLES + 1);
    for (const [, y] of top) {
      expect(y).toBeCloseTo(0, 10);
    }
    for (const [, y] of bottom) {
      expect(y).toBeCloseTo(h, 10);
    }
  });

  it.each([0, 0.12, 0.25, 0.4])(
    "keeps a constant band thickness for amp %s",
    (ampFrac) => {
      const w = 200;
      const h = 100;
      const geom = tape(w, h, { amp: ampFrac, wave: 0.5 });
      const expectedThickness = h - 2 * ampFrac * h;
      // Bottom index that shares the same `t` as top index `i` is
      // `2*SAMPLES + 1 - i` (bottom is the reversed second half).
      for (let i = 0; i <= SAMPLES; i++) {
        const topY = geom.points[i][1];
        const bottomY = geom.points[2 * SAMPLES + 1 - i][1];
        expect(bottomY - topY).toBeCloseTo(expectedThickness, 8);
      }
    },
  );

  it("produces fewer sign changes along the top edge at a larger wave", () => {
    const w = 200;
    const h = 100;
    const countSignChanges = (waveFrac: number): number => {
      const geom = tape(w, h, { amp: 0.12, wave: waveFrac });
      const top = geom.points.slice(0, SAMPLES + 1);
      const amp = 0.12 * h;
      const signs = top.map(([, y]) => Math.sign(y - amp));
      let changes = 0;
      for (let i = 1; i < signs.length; i++) {
        if (signs[i] !== 0 && signs[i - 1] !== 0 && signs[i] !== signs[i - 1]) {
          changes++;
        }
      }
      return changes;
    };
    const many = countSignChanges(0.15);
    const few = countSignChanges(1);
    expect(few).toBeLessThan(many);
  });

  it("clamps amp to 0..0.4 and wave to 0.15..1", () => {
    const over = tape(200, 100, { amp: 5, wave: 5 });
    const atBound = tape(200, 100, { amp: 0.4, wave: 1 });
    expect(over.points).toEqual(atBound.points);

    const under = tape(200, 100, { amp: -1, wave: -1 });
    const atFloor = tape(200, 100, { amp: 0, wave: 0.15 });
    expect(under.points).toEqual(atFloor.points);
  });
});
