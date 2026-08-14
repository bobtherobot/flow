import type { GeometryFn, LocalPt } from "../types";
import { clamp } from "./bounds";

const d = (pts: LocalPt[]) =>
  `${pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`;

/** `dx`/`dy`'s bounds, shared with their handle in registry.ts. */
export const CUBE_BOUNDS = { dx: [0.02, 0.6] as const, dy: [0.02, 0.6] as const };

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
 *
 * Fill winding — **correction, verified in a real browser**: an earlier
 * draft of this comment claimed the front face's subpath already wound the
 * same direction as the silhouette and therefore rendered correctly under a
 * solid background. That claim was wrong. Excalidraw's canvas renderer fills
 * every `generator.path(...)`-based shape (roughjs's `RoughCanvas.draw`,
 * `roughjs/bin/canvas.js`) with `ctx.fill("evenodd")` regardless of
 * `fillStyle`, and the front face's own subpath **does** render as a hole
 * under a solid background — not just under pattern fills — confirmed by
 * screenshotting a filled cube in-app.
 *
 * The cylinder's equivalent front-cap subpath (cylinder.ts) *can* be fixed
 * by reordering its points, because it touches the silhouette at only two
 * isolated points. This one cannot: it was tested with the front subpath
 * reversed, with its starting vertex rotated to the one corner that isn't
 * shared with the silhouette, and — decisively — inset by 20px so it shares
 * *no* vertex or edge with the silhouette at all (an unambiguously "floating
 * free" interior subpath). Every variant still rendered its own interior as
 * a hole, in every point-order tried. A fully isolated interior subpath
 * under even-odd fill is a hole, full stop, independent of winding — the
 * cylinder's fix works on a topology-specific coincidence (two shared
 * points, not a shared edge or a duplicated boundary segment) that this
 * shape's front face doesn't have: its own closing edge from `[0, h]` back
 * to `[0, top]` is the *same line segment* as one of the silhouette's own
 * edges, not just two touching points.
 *
 * Net effect: the front face renders unfilled under both solid and pattern
 * backgrounds. Not fixed here — same "document honestly, don't fake a fix"
 * choice the spec makes for pattern fills generally, now known to be wider
 * than originally scoped.
 */
export const cube: GeometryFn = (w, h, p) => {
  const dx = clamp(p.dx ?? 0.25, CUBE_BOUNDS.dx) * w;
  const dy = clamp(p.dy ?? 0.2, CUBE_BOUNDS.dy) * h;
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
