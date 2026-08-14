import type { GeometryFn, LocalPt } from "../types";

const SEGMENTS = 16;

/** Half-ellipse sampled left-to-right, `dir` 1 = bulging down, -1 = bulging up. */
function arc(cx: number, rx: number, cy: number, ry: number, dir: 1 | -1): LocalPt[] {
  const pts: LocalPt[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = Math.PI * (i / SEGMENTS);
    pts.push([cx - Math.cos(t) * rx, cy + Math.sin(t) * ry * dir]);
  }
  return pts;
}

const d = (pts: LocalPt[]) =>
  pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

/**
 * Cylinder: a rectangle with elliptical caps. `cap` is the cap ellipse's
 * half-height as a fraction of the box height, clamped so the two caps never
 * cross (their arcs meet at `h/2` at the 0.45 bound, leaving a sliver of
 * body between them).
 *
 * `points` is the silhouette (top cap's upper arc, down the right side,
 * bottom cap's lower arc, up the left side) — this is both the hit area and
 * what the shape falls back to rendering if `path` were absent. `path` adds a
 * second, separately-closed subpath for the front arc of the top cap, so the
 * cylinder reads as a 3D shape without that inner line joining the hit area.
 */
export const cylinder: GeometryFn = (w, h, p) => {
  const capH = Math.min(Math.max(p.cap ?? 0.18, 0.02), 0.45) * h;
  const rx = w / 2;
  const top = capH;
  const bottom = h - capH;

  // Silhouette: top cap's upper arc, down the right side, bottom cap's lower arc.
  const points: LocalPt[] = [
    ...arc(rx, rx, top, capH, -1),
    ...arc(rx, rx, bottom, capH, 1).reverse(),
  ];

  return {
    points,
    // Outline, then the front arc of the top cap as a separate closed subpath.
    path: `${d(points)} Z ${d(arc(rx, rx, top, capH, 1))} Z`,
  };
};
