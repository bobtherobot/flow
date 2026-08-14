import { describe, it, expect } from "vitest";
import { SHAPES_REGISTRY } from "./registry";
import type { LocalPt } from "./types";

/**
 * Every `M`/`L` coordinate pair in an SVG path string built the way this
 * repo's geometry functions build theirs (`M x y L x y L x y ... Z`, possibly
 * several subpaths). Coordinates can be plain decimals or JS's exponential
 * notation, hence the `e-?\d+` tail.
 */
function pathVertices(path: string | undefined): LocalPt[] {
  if (!path) return [];
  const pts: LocalPt[] = [];
  const re = /[ML]\s+(-?[0-9.]+(?:e-?\d+)?)\s+(-?[0-9.]+(?:e-?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) {
    pts.push([Number(m[1]), Number(m[2])]);
  }
  return pts;
}

/**
 * Data-driven contract test that walks the whole registry, not a fixed list
 * of shapes — any future shape's `HandleDef`s are automatically held to the
 * same rules the moment they're added to `SHAPES_REGISTRY`, with no test
 * file to remember to update.
 *
 * The contract (from `HandleDef`'s own doc comment in types.ts):
 *  - `at`/`from` are inverses at a shape's default parameters.
 *  - The dot `at` produces sits inside the element box.
 *  - `from` clamps a wildly out-of-range drag back into a finite 0..1 value.
 *  - `at`'s point coincides with an actual vertex the geometry draws.
 */
describe("handle round-tripping", () => {
  const W = 200;
  const H = 120;

  for (const def of Object.values(SHAPES_REGISTRY)) {
    for (const handle of def.handles) {
      it(`${def.kind}/${handle.id}: at() and from() are inverses`, () => {
        const p = { ...def.defaults };
        const [x, y] = handle.at(W, H, p);
        const back = handle.from(x, y, W, H, p);
        for (const [key, value] of Object.entries(back)) {
          expect(value).toBeCloseTo(p[key], 5);
        }
      });

      it(`${def.kind}/${handle.id}: sits inside the box`, () => {
        const [x, y] = handle.at(W, H, { ...def.defaults });
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(H);
      });

      it(`${def.kind}/${handle.id}: clamps a wildly out-of-range drag`, () => {
        const p = { ...def.defaults };
        for (const [, value] of Object.entries(handle.from(-9999, -9999, W, H, p))) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        for (const [, value] of Object.entries(handle.from(9999, 9999, W, H, p))) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      });

      // The structural fix for the class of bug the cylinder handle's first
      // draft had: `at`/`from` can be perfectly mutually consistent while
      // both agreeing on a point that floats in empty space, off the actual
      // drawn shape (the round-trip test above cannot catch that — it never
      // looks at the geometry at all). This test does: it collects every
      // vertex the shape's geometry actually draws — the hit-test `points`
      // plus every `M`/`L` coordinate in `path` (so a handle that targets a
      // path-only subpath, like the cube's interior crease or the cylinder's
      // front arc, is covered exactly as well as one that targets a `points`
      // member) — and requires `at`'s point to coincide with one of them.
      it(`${def.kind}/${handle.id}: at() lands on an actual drawn vertex`, () => {
        const p = { ...def.defaults };
        const [x, y] = handle.at(W, H, p);
        const geom = def.geometry(W, H, p);
        const vertices = [...geom.points, ...pathVertices(geom.path)];
        const EPS = 1e-6;
        const onOutline = vertices.some(
          ([vx, vy]) => Math.abs(vx - x) < EPS && Math.abs(vy - y) < EPS,
        );
        expect(onOutline).toBe(true);
      });
    }
  }
});
