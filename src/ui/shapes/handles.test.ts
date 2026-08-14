import { describe, it, expect } from "vitest";
import { SHAPES_REGISTRY, SKEW_UI_MAX } from "./registry";
import { PARALLELOGRAM_BOUNDS } from "./geometry/parallelogram";
import { TRAPEZOID_BOUNDS } from "./geometry/trapezoid";
import { STAR_BOUNDS } from "./geometry/star";
import { CYLINDER_BOUNDS } from "./geometry/cylinder";
import { TAPE_BOUNDS } from "./geometry/tape";
import { CUBE_BOUNDS } from "./geometry/cube";
import { FAT_ARROW_BOUNDS } from "./geometry/fatArrow";
import type { FlowShapeKind, LocalPt, ShapeParams } from "./types";

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
 * Every parameter's bounds, by kind, exactly as each handle's own `at`/`from`
 * clamp to them — not necessarily the geometry function's own bound. This
 * matters for parallelogram: the geometry itself allows `skew` up to 1.0,
 * but the handle clamps to `SKEW_UI_MAX` (0.9) to stay short of the
 * degenerate value, so sweeping the geometry's raw 1.0 bound here would feed
 * `at()` a point it never actually produces and fail for the wrong reason.
 * `rot` (star) has no real bound — it's a full rotation, wrapped mod 1, not
 * clamped — so it's swept as three representative turns instead of a
 * min/mid/max of an actual limit.
 */
const PARAM_BOUNDS: Partial<Record<FlowShapeKind, Record<string, readonly [number, number]>>> = {
  parallelogram: { skew: [PARALLELOGRAM_BOUNDS.skew[0], SKEW_UI_MAX] },
  trapezoid: { inset: TRAPEZOID_BOUNDS.inset },
  star: { ir: STAR_BOUNDS.ir, rot: [0, 2 / 3] },
  cylinder: { cap: CYLINDER_BOUNDS.cap },
  tape: { amp: TAPE_BOUNDS.amp, wave: TAPE_BOUNDS.wave },
  cube: { dx: CUBE_BOUNDS.dx, dy: CUBE_BOUNDS.dy },
  fatArrow: { head: FAT_ARROW_BOUNDS.head, stem: FAT_ARROW_BOUNDS.stem },
};

/** [min, mid, max] sample values for a bound. */
function sweepValues([min, max]: readonly [number, number]): number[] {
  return [min, (min + max) / 2, max];
}

/** Cartesian product of each owned parameter's [min, mid, max] samples, as a
 *  list of partial-params overrides to merge over the shape's defaults. */
function paramCombos(kind: FlowShapeKind, ownedKeys: string[]): ShapeParams[] {
  const bounds = PARAM_BOUNDS[kind];
  if (!bounds) throw new Error(`no PARAM_BOUNDS entry for ${kind}`);
  let combos: ShapeParams[] = [{}];
  for (const key of ownedKeys) {
    const range = bounds[key];
    if (!range) throw new Error(`no PARAM_BOUNDS entry for ${kind}.${key}`);
    const next: ShapeParams[] = [];
    for (const combo of combos) {
      for (const value of sweepValues(range)) {
        next.push({ ...combo, [key]: value });
      }
    }
    combos = next;
  }
  return combos;
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
 *  - `at`'s point coincides with an actual vertex the geometry draws, at
 *    every combination of min/mid/max for every parameter the handle owns —
 *    not just at the shape's default parameters.
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
      //
      // Sampled at the shape's *defaults only*, this was structurally blind
      // to a whole bug class: tape's default `wave: 0.5` happens to put the
      // crest exactly on tape.ts's uniform sample grid, so deleting the
      // crest-sampling fix (tape.ts) left this test green even though most
      // *other* `wave` values then drift off the drawn outline by several
      // percent of the box height. Sweeping min/mid/max across every
      // parameter the handle owns (see PARAM_BOUNDS) closes that hole —
      // proven by reverting each of those two known-bad handles in turn and
      // confirming this test (and only this test) catches both.
      const ownedKeys = Object.keys(handle.from(...handle.at(W, H, def.defaults), W, H, def.defaults));
      for (const combo of paramCombos(def.kind, ownedKeys)) {
        const p = { ...def.defaults, ...combo };
        const label = Object.entries(combo)
          .map(([k, v]) => `${k}=${v.toFixed(3)}`)
          .join(",");
        it(`${def.kind}/${handle.id}: at() lands on an actual drawn vertex (${label})`, () => {
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
  }
});
