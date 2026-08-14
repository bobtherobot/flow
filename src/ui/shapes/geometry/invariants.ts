import { expect } from "vitest";
import type { FlowGeometry } from "../types";

/** The load-bearing rule: nothing pokes outside the element box. Tolerance is
 *  for float noise only, not for genuine overhang. */
export function expectInsideBox(geom: FlowGeometry, w: number, h: number): void {
  for (const [x, y] of geom.points) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(-0.001);
    expect(x).toBeLessThanOrEqual(w + 0.001);
    expect(y).toBeGreaterThanOrEqual(-0.001);
    expect(y).toBeLessThanOrEqual(h + 0.001);
  }
}

/** An outline must be a usable polygon: at least a triangle's worth of points,
 *  and not accidentally repeating its first point as its last (roughjs closes
 *  polygons itself, so a duplicated point draws a zero-length segment). */
export function expectClosed(geom: FlowGeometry): void {
  expect(geom.points.length).toBeGreaterThanOrEqual(3);
  const first = geom.points[0];
  const last = geom.points[geom.points.length - 1];
  expect(first[0] === last[0] && first[1] === last[1]).toBe(false);
}

/** Every subpath in a `path` string must be explicitly closed with Z. */
/**
 * The **outline** subpath — always the first one — must close, or the shape has
 * no watertight boundary to fill or hit-test against.
 *
 * Later subpaths are interior detail (the cylinder's front cap, the cube's
 * creases, the summing junction's cross) and are deliberately NOT required to
 * close. This used to demand `Z` on every subpath, which is what put a straight
 * chord across the cylinder's top ellipse: closing an arc strokes the line back
 * from its end to its start. An interior arc that should read as a curve must
 * be left open.
 */
export function expectPathOutlineClosed(geom: FlowGeometry): void {
  if (!geom.path) return;
  const subpaths = geom.path.split(/(?=M)/).filter((s) => s.trim().length > 0);
  expect(subpaths.length).toBeGreaterThan(0);
  expect(subpaths[0].trim().toUpperCase().endsWith("Z")).toBe(true);
}

/**
 * Signed area via the shoelace formula — sign only matters here, not
 * magnitude. Its sign is the winding direction of a closed polygon, in the
 * same y-down convention every geometry function's points are already in.
 * Two subpaths sharing a sign wind the same direction; nonzero-rule fills
 * (roughjs's `solidFillPolygon`) union same-signed overlapping subpaths and
 * cancel opposite-signed ones into a hole — see the fill-winding comment in
 * cylinder.ts.
 */
export function shoelaceSign(points: readonly (readonly [number, number])[]): 1 | -1 | 0 {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  if (sum > 0) return 1;
  if (sum < 0) return -1;
  return 0;
}

/** Split a `path` string into its `M ... Z` subpaths (each element includes
 *  its own leading `M`), the same convention every geometry test that
 *  inspects subpaths individually already uses. */
export function splitSubpaths(path: string): string[] {
  return path.split(/(?=M)/).filter((s) => s.trim().length > 0);
}

/** Every `M`/`L` coordinate pair in one subpath, in order. Coordinates can be
 *  plain decimals or JS's exponential notation. */
export function subpathVertices(subpath: string): (readonly [number, number])[] {
  const pts: (readonly [number, number])[] = [];
  const re = /[ML]\s+(-?[0-9.]+(?:e-?\d+)?)\s+(-?[0-9.]+(?:e-?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(subpath))) {
    pts.push([Number(m[1]), Number(m[2])]);
  }
  return pts;
}
