import type { GeometryFn, LocalPt } from "../types";

const BUMPS = 9;
const SAMPLES = 6;
/** Bump radius as a fraction of *each axis's own* half-extent. Must stay
 *  per-axis — see the aspect-ratio comment below. */
const BUMP_FRACTION = 0.32;

/**
 * Cloud: a scalloped closed loop of `BUMPS` overlapping arcs around an inset
 * ellipse. No parameters. The inset (`bumpRx`/`bumpRy` subtracted from each
 * radius before placing a bump's centre) keeps every bump's outward crest
 * inside the box rather than the underlying ellipse itself.
 *
 * The bump radius is **per-axis** (`bumpRx = rx * BUMP_FRACTION`, `bumpRy =
 * ry * BUMP_FRACTION`), not a single scalar derived from `min(rx, ry)`. A
 * single shared scalar was tied to the box's *short* axis, while the `BUMPS`
 * centres are placed at equal *parametric* angle around the box's own aspect
 * ratio — so on a wide box, consecutive centres near the long axis drift
 * apart (their spacing scales with the long axis) while a short-axis-derived
 * radius stays too small to bridge the growing gap between them: the longest
 * chord between consecutive outline points measured 95.8px at 400x100 and
 * 180.6px at 600x60 with the old single-scalar radius, growing without bound
 * as the box got wider — a visibly spiky polygon with flat notches, not a
 * cloud. A more samples cannot fix this (it isn't an under-sampling
 * artifact; the underlying geometry has a real gap to close). Scaling the
 * radius per-axis keeps the *ratio* of local bump size to local centre
 * spacing constant at any aspect ratio; verified numerically (see
 * cloud.test.ts) to keep the longest chord proportional to the box's own
 * perimeter — bounded — for square, wide and very wide boxes alike, rather
 * than growing unboundedly. At `w === h` this reduces to exactly the old
 * `min(rx, ry)` formula, so square clouds are pixel-identical to before.
 *
 * Concave by construction (the loop pinches in between bumps), so this shape
 * is excluded from the vendor's mitered arrow-binding offset — see
 * `getFlowShapeSides` in `vendor/excalidraw/packages/common/src/flowShapes.ts`.
 */
export const cloud: GeometryFn = (w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  const bumpRx = rx * BUMP_FRACTION;
  const bumpRy = ry * BUMP_FRACTION;
  const cx = rx;
  const cy = ry;
  const points: LocalPt[] = [];

  for (let b = 0; b < BUMPS; b++) {
    const base = (b / BUMPS) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + Math.cos(base) * (rx - bumpRx);
    const by = cy + Math.sin(base) * (ry - bumpRy);
    for (let s = 0; s <= SAMPLES; s++) {
      const a = base - Math.PI / 2 + (s / SAMPLES) * Math.PI;
      points.push([bx + Math.cos(a) * bumpRx, by + Math.sin(a) * bumpRy]);
    }
  }

  return {
    points,
    path: `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`,
  };
};
