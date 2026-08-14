import type { GeometryFn } from "../types";

/**
 * Fat arrow, points right. `head` is the head's length as a fraction of
 * width, clamped to 0.05..0.95; `stem` is the stem's thickness as a fraction
 * of height, clamped to 0.05..1. The tip always lands exactly on `[w, h/2]`.
 * At `stem: 1` the stem spans the full height (`top` 0, `bottom` h) without
 * inverting the two — `stem` is clamped to a positive value before `top`/
 * `bottom` are derived from it, so `bottom` never lands above `top`.
 */
export const fatArrow: GeometryFn = (w, h, p) => {
  const head = Math.min(Math.max(p.head ?? 0.4, 0.05), 0.95) * w;
  const stem = Math.min(Math.max(p.stem ?? 0.4, 0.05), 1) * h;
  const x = w - head;
  const top = (h - stem) / 2;
  const bottom = top + stem;
  return {
    points: [
      [0, top],
      [x, top],
      [x, 0],
      [w, h / 2],
      [x, h],
      [x, bottom],
      [0, bottom],
    ],
  };
};
