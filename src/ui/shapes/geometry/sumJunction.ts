import type { GeometryFn, LocalPt } from "../types";

const SEGMENTS = 32;

/**
 * Summing junction: a circle with a full cross through it. No parameters.
 *
 * `points` is the inscribed ellipse, sampled at `SEGMENTS` points — this is
 * the hit area (the ring). `path` adds the cross as two degenerate closed
 * subpaths (`M a L b Z`, a straight line closed back on itself) so the
 * renderer strokes them as the interior "+" without either one contributing
 * area to the fill.
 */
export const sumJunction: GeometryFn = (w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  const points: LocalPt[] = Array.from({ length: SEGMENTS }, (_, i) => {
    const a = (i / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
    return [rx + Math.cos(a) * rx, ry + Math.sin(a) * ry] as LocalPt;
  });

  const ring = `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`;
  // Cross drawn as two degenerate closed subpaths so the renderer strokes
  // them without them contributing to the fill.
  const cross = `M ${rx} 0 L ${rx} ${h} Z M 0 ${ry} L ${w} ${ry} Z`;

  return { points, path: `${ring} ${cross}` };
};
