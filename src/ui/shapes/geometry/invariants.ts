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
export function expectPathSubpathsClosed(geom: FlowGeometry): void {
  if (!geom.path) return;
  const subpaths = geom.path.split(/(?=M)/).filter((s) => s.trim().length > 0);
  expect(subpaths.length).toBeGreaterThan(0);
  for (const sub of subpaths) {
    expect(sub.trim().toUpperCase().endsWith("Z")).toBe(true);
  }
}
