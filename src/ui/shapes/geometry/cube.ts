import type { GeometryFn, LocalPt } from "../types";
import { clamp } from "./bounds";

const dOpen = (pts: LocalPt[]) =>
  pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

/** Closed subpath — for the outline, which must bound a fillable region. */
const d = (pts: LocalPt[]) => `${dOpen(pts)} Z`;

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
 * visible side faces). `path` adds the interior lines that give it depth.
 *
 * Interior detail must never *bound* a region. Excalidraw fills every
 * `generator.path(...)` shape with `ctx.fill("evenodd")` regardless of
 * `fillStyle` (roughjs's `RoughCanvas.draw`), and pattern fills are even-odd
 * as well — so a closed interior subpath is subtracted from the fill. This
 * used to draw the front face as a closed rectangle, which is exactly that:
 * give the cube a background and its front face rendered as a hole. Every
 * attempt to fix it by winding — reversing the subpath, reversing the
 * silhouette, rotating the start vertex, insetting it so it shared no edge —
 * failed, because winding is the wrong lever.
 *
 * Retracing is the right one: the interior polyline walks each line out and
 * back, enclosing zero area, so even-odd subtracts nothing and the lines
 * still stroke. Verified in a real browser under both solid and hachure
 * fills. See `.claude/memory/parametric-shapes.md`.
 */
export const cube: GeometryFn = (w, h, p) => {
  const dx = clamp(p.dx ?? 0.25, CUBE_BOUNDS.dx) * w;
  const dy = clamp(p.dy ?? 0.2, CUBE_BOUNDS.dy) * h;
  const fw = w - dx; // front face width
  const fh = h - dy; // front face height
  const top = dy;

  // Silhouette for hit-testing: front face plus the two visible side faces.
  const points: LocalPt[] = [
    [0, top],
    [dx, 0],
    [w, 0],
    [w, fh],
    [fw, h],
    [0, h],
  ];

  // Every interior line, walked out and back so the subpath encloses no area:
  // along the top crease, down the right crease, back up it, out to the
  // extrusion tip, back from it, then back along the top crease to the start.
  const interior: LocalPt[] = [
    [0, top],
    [fw, top],
    [fw, h],
    [fw, top],
    [w, 0],
    [fw, top],
    [0, top],
  ];

  return {
    points,
    // Silhouette, then all the interior detail as one zero-area retrace.
    //
    // Three lines are interior, so nothing draws them unless we do: the
    // front/top crease, the front/right crease, and the edge joining the front
    // face's top-right corner to the extrusion tip `[w, 0]`. That third one was
    // missing entirely — without it the top and right faces share no drawn
    // boundary and the shape reads as a flat hexagon with a rectangle inside
    // it. (The silhouette supplies the other two front-to-back connectors
    // implicitly: `[0, top]→[dx, 0]` and `[fw, h]→[w, fh]`.)
    //
    // Drawing them as a *closed* front-face rectangle — what this used to do —
    // renders the front face as a hole whenever the shape has a background,
    // because Excalidraw fills every `generator.path` shape with
    // `ctx.fill("evenodd")` and any interior region bounded by a subpath is
    // subtracted. Retracing instead encloses zero area, so even-odd crosses
    // every interior point an even number of times and subtracts nothing. Each
    // line is stroked twice, which under roughjs's sketchy stroke reads as a
    // slightly firmer line rather than a doubled one.
    path: `${d(points)} ${dOpen(interior)}`,
  };
};
