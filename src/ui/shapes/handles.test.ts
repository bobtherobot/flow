import { describe, it, expect } from "vitest";
import { SHAPES_REGISTRY } from "./registry";

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
 *
 * This test cannot catch a consistently-wrong `at`/`from` pair (both sides
 * agreeing on the same incorrect point, as the cylinder handle's first draft
 * did) — only that the two are mutually consistent. Landing on the actual
 * drawn outline is verified separately, by hand, in the dev server.
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
    }
  }
});
