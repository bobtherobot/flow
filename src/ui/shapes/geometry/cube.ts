import type { GeometryFn, LocalPt } from "../types";

const d = (pts: LocalPt[]) =>
  `${pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`;

/**
 * Inscribed 3D box: a front face plus a top and right face drawn toward the
 * extrusion tip. `dx`/`dy` are the extrusion vector as fractions of the box,
 * clamped to 0.02..0.6 so the front face never collapses. The front face
 * shrinks by exactly that extrusion, so the silhouette's top-right corner —
 * the extrusion's tip — always lands on `[w, 0]`, never past it, which is
 * what keeps the whole drawing inscribed.
 *
 * `points` is the silhouette: a 6-point hexagon (front face plus the two
 * visible side faces). `path` adds the front face's own two interior edges
 * as a second, separately-closed subpath, so the front/top and front/right
 * creases read as depth without joining the hit area.
 */
export const cube: GeometryFn = (w, h, p) => {
  const dx = Math.min(Math.max(p.dx ?? 0.25, 0.02), 0.6) * w;
  const dy = Math.min(Math.max(p.dy ?? 0.2, 0.02), 0.6) * h;
  const fw = w - dx; // front face width
  const fh = h - dy; // front face height
  const top = dy;

  const front: LocalPt[] = [
    [0, top],
    [fw, top],
    [fw, h],
    [0, h],
  ];

  // Silhouette for hit-testing: front face plus the two visible side faces.
  const points: LocalPt[] = [
    [0, top],
    [dx, 0],
    [w, 0],
    [w, fh],
    [fw, h],
    [0, h],
  ];

  return {
    points,
    // Silhouette, then the front face's two interior edges as their own subpath.
    path: `${d(points)} ${d(front)}`,
  };
};
