import type { GeometryFn } from "../types";
import { clamp } from "./bounds";

/** `skew`'s own geometry bound. registry.ts's handle uses a *tighter*
 *  UI-only max (0.9) short of this 1.0 — see its own comment for why: at
 *  `skew: 1` the shape collapses to a zero-area line, which this bound alone
 *  does not prevent. */
export const PARALLELOGRAM_BOUNDS = { skew: [0, 1] as const };

/** Top edge shifted right by `skew * w`; bottom edge shifted left by the same,
 *  so the shape always fills the box exactly. */
export const parallelogram: GeometryFn = (w, h, p) => {
  const s = clamp(p.skew ?? 0.25, PARALLELOGRAM_BOUNDS.skew) * w;
  return {
    points: [
      [s, 0],
      [w, 0],
      [w - s, h],
      [0, h],
    ],
  };
};
