import type { GeometryFn, LocalPt } from "../types";
import { clamp } from "./bounds";

const SEGMENTS = 16;

/** `cap`'s bounds, shared with its handle in registry.ts so a narrowed
 *  geometry clamp can never drift out of sync with what the dot can reach. */
export const CYLINDER_BOUNDS = { cap: [0.02, 0.45] as const };

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
 *
 * Fill winding matters here, not just the stroke — but the mechanism is more
 * subtle than "solid = nonzero, pattern = even-odd". roughjs's own canvas
 * renderer (`roughjs/bin/canvas.js`, `RoughCanvas.draw`) fills **any**
 * `generator.path(...)`-based shape — solid fill included — with
 * `ctx.fill("evenodd")`; there is no nonzero code path for a shape whose
 * `drawable.shape === "path"`. A naive even-odd analysis (count boundary
 * crossings on a ray from a point to infinity, ignore direction) predicts
 * the front-cap subpath's traversal order can't matter at all — and empirically,
 * for a *fully separated* interior subpath (verified by insetting a second
 * shape's interior subpath so it shares no vertex with its silhouette; see
 * the equivalent investigation in cube.ts), it doesn't.
 *
 * This subpath is different: it touches the silhouette at exactly two
 * points — `(0, top)` and `(w, top)`, both literal members of the
 * silhouette's own `points` — rather than sharing a full edge or floating
 * fully clear of it. At that specific topology, empirically verified in a
 * real browser (Chromium, both default roughness and `roughness: 0` with a
 * fixed seed, ruling out sketchy-fill jitter as the cause), the traversal
 * direction of the front-cap subpath *relative to* the silhouette's own
 * direction through those same two points determines whether the cap lens
 * renders filled or as a hole. `[...arc(...)].reverse()` below flips that
 * relative direction without changing the curve drawn (same points, opposite
 * traversal) — verified to turn the hole into a correct fill at the default
 * `cap`. This project does not have a clean ray-casting proof for *why*;
 * take the empirical result, not the geometric argument, as authoritative.
 *
 * **Known remaining gap, not fixed by this change:** near the `cap` upper
 * bound (verified at `cap: 0.42`), the front-cap lens grows tall enough to
 * overlap the *bottom* cap's own boundary — a third subpath interaction this
 * fix doesn't address — and a large fill gap reappears, identically whether
 * or not this subpath is reversed (confirmed by testing both). Only the
 * common case (the lens touching just the silhouette) is fixed here.
 *
 * Pattern fills (hachure/cross-hatch/zigzag) go through a different roughjs
 * function, `patternFillPolygons`, which is unambiguously even-odd with no
 * nonzero variant to fall back on — so the front cap unavoidably renders
 * unfilled/unhatched under a pattern background regardless of point order.
 * That part *is* inherent to even-odd fill and is not attempted here.
 */
export const cylinder: GeometryFn = (w, h, p) => {
  const capH = clamp(p.cap ?? 0.18, CYLINDER_BOUNDS.cap) * h;
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
    // Outline, then the front arc of the top cap as a separate closed
    // subpath — reversed relative to the silhouette's own direction through
    // their two shared points, verified in-browser to fill correctly at the
    // default cap (see the fill-winding comment above); the curve drawn is
    // identical either way.
    path: `${d(points)} Z ${d([...arc(rx, rx, top, capH, 1)].reverse())} Z`,
  };
};
