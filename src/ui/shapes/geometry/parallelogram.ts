import type { GeometryFn } from "../types";

/** Top edge shifted right by `skew * w`; bottom edge shifted left by the same,
 *  so the shape always fills the box exactly. */
export const parallelogram: GeometryFn = (w, h, p) => {
  const s = Math.min(Math.max(p.skew ?? 0.25, 0), 1) * w;
  return {
    points: [
      [s, 0],
      [w, 0],
      [w - s, h],
      [0, h],
    ],
  };
};
