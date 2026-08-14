import type { GeometryFn } from "../types";
import { clamp } from "./bounds";

/** `inset`'s bounds, shared with its handle in registry.ts. At `inset: 0.5`
 *  the top edge's two corners coincide (an isoceles triangle) — same class
 *  of harmless adjacent-duplicate-point condition as fatArrow's extreme
 *  (fatArrow.ts), not a degenerate (zero-area) shape, so it is left
 *  reachable rather than clamped tighter. */
export const TRAPEZOID_BOUNDS = { inset: [0, 0.5] as const };

/** Symmetric trapezoid: both top corners inset by `inset * w`, capped at half
 *  the width so the top edge never inverts. */
export const trapezoid: GeometryFn = (w, h, p) => {
  const i = clamp(p.inset ?? 0.2, TRAPEZOID_BOUNDS.inset) * w;
  return {
    points: [
      [i, 0],
      [w - i, 0],
      [w, h],
      [0, h],
    ],
  };
};
