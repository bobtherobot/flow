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
 * Interior detail must never *bound* a region. roughjs's canvas renderer
 * (`roughjs/bin/canvas.js`, `RoughCanvas.draw`) fills any
 * `generator.path(...)` shape — solid fill included — with
 * `ctx.fill("evenodd")`, and pattern fills go through `patternFillPolygons`,
 * which is even-odd too. Under even-odd, a closed interior subpath is
 * subtracted from the fill: give the shape a background and the cap lens
 * becomes a hole.
 *
 * So the front cap is drawn out and back over itself, enclosing zero area.
 * Every interior point is then crossed an even number of times and nothing is
 * subtracted, while the arc still strokes. Verified in a real browser, solid
 * and hachure, at both the default `cap` and its 0.45 upper bound.
 *
 * Two earlier attempts are recorded in `.claude/memory/parametric-shapes.md`
 * as dead ends: closing the arc with `Z` (strokes a chord across the ellipse)
 * and reversing its point order relative to the silhouette (appeared to fix
 * the hole, but winding cannot matter under even-odd — it was masking the
 * problem, and it left a fill gap near `cap`'s upper bound).
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

  const front = arc(rx, rx, top, capH, 1);

  return {
    points,
    // Outline (closed), then the front arc of the top cap drawn out and back
    // along itself.
    //
    // Two constraints have to hold at once, and each naive option breaks the
    // other. Closing the arc with `Z` strokes a straight chord from its right
    // end `(w, top)` back to its left end — a horizontal bar across the top
    // ellipse that is not part of a cylinder. Leaving it open removes the bar
    // but makes the cap lens render as a *hole* when the shape has a solid
    // background, because Excalidraw fills every `generator.path` shape with
    // `ctx.fill("evenodd")` and any interior region bounded by a subpath is a
    // hole under even-odd.
    //
    // Retracing sidesteps both: the subpath goes left→right along the arc and
    // then right→left back over the identical points, so it encloses zero
    // area. Even-odd sees every interior point crossed an even number of
    // times, so nothing is subtracted from the fill, and the only thing
    // stroked is the arc itself. It is drawn twice, which under roughjs's
    // sketchy stroke reads as a slightly firmer line, not a double line.
    path: `${d(points)} Z ${d([...front, ...front.slice(0, -1).reverse()])}`,
  };
};
