import type { GeometryFn } from "../types";
import { clamp } from "./bounds";

/** `head`/`stem`'s bounds, shared with their handles in registry.ts. */
export const FAT_ARROW_BOUNDS = { head: [0.05, 0.95] as const, stem: [0.05, 1] as const };

/**
 * Fat arrow, points right. `head` is the head's length as a fraction of
 * width, clamped to 0.05..0.95; `stem` is the stem's thickness as a fraction
 * of height, clamped to 0.05..1. The tip always lands exactly on `[w, h/2]`.
 * At `stem: 1` the stem spans the full height (`top` 0, `bottom` h) without
 * inverting the two — `stem` is clamped to a positive value before `top`/
 * `bottom` are derived from it, so `bottom` never lands above `top`.
 *
 * At the simultaneous extreme `head: 0.95, stem: 1`, `points[1]` and
 * `points[2]` (and, symmetrically, `points[4]` and `points[5]`) coincide —
 * a zero-length edge. Same class of condition as trapezoid's `inset: 0.5`
 * (registry.ts): harmless (in-bounds, non-self-intersecting, no area
 * collapse), just cosmetic, and left unclamped for the same reason —
 * neither bound needs a UI-only margin short of its own valid range.
 */
export const fatArrow: GeometryFn = (w, h, p) => {
  const head = clamp(p.head ?? 0.4, FAT_ARROW_BOUNDS.head) * w;
  const stem = clamp(p.stem ?? 0.4, FAT_ARROW_BOUNDS.stem) * h;
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
