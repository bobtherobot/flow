import type { GeometryFn } from "../types";

/** Isosceles triangle inscribed in the box: apex centred on the top edge,
 *  base spanning the bottom edge. No parameters. */
export const triangle: GeometryFn = (w, h) => ({
  points: [
    [w / 2, 0],
    [w, h],
    [0, h],
  ],
});
