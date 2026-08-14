import type { GeometryFn, LocalPt } from "../types";

const BUMPS = 9;
const SAMPLES = 6;

/**
 * Cloud: a scalloped closed loop of `BUMPS` overlapping arcs around an inset
 * ellipse. No parameters. The inset (`bumpR` subtracted from each radius
 * before placing a bump's centre) keeps every bump's outward crest inside the
 * box rather than the underlying ellipse itself.
 *
 * Concave by construction (the loop pinches in between bumps), so this shape
 * is excluded from the vendor's mitered arrow-binding offset — see
 * `getFlowShapeSides` in `vendor/excalidraw/packages/common/src/flowShapes.ts`.
 */
export const cloud: GeometryFn = (w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  const bumpR = Math.min(rx, ry) * 0.32;
  const cx = rx;
  const cy = ry;
  const points: LocalPt[] = [];

  for (let b = 0; b < BUMPS; b++) {
    const base = (b / BUMPS) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + Math.cos(base) * (rx - bumpR);
    const by = cy + Math.sin(base) * (ry - bumpR);
    for (let s = 0; s <= SAMPLES; s++) {
      const a = base - Math.PI / 2 + (s / SAMPLES) * Math.PI;
      points.push([bx + Math.cos(a) * bumpR, by + Math.sin(a) * bumpR]);
    }
  }

  return {
    points,
    path: `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`,
  };
};
