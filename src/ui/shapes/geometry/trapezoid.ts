import type { GeometryFn } from "../types";

/** Symmetric trapezoid: both top corners inset by `inset * w`, capped at half
 *  the width so the top edge never inverts. */
export const trapezoid: GeometryFn = (w, h, p) => {
  const i = Math.min(Math.max(p.inset ?? 0.2, 0), 0.5) * w;
  return {
    points: [
      [i, 0],
      [w - i, 0],
      [w, h],
      [0, h],
    ],
  };
};
