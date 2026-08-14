import type { GeometryFn, LocalPt } from "../types";
import { clamp } from "./bounds";

const POINTS = 5;

/** `ir`'s bounds, shared with its handle in registry.ts. `rot` is an
 *  unbounded full rotation (wrapped mod 1 by the handle, not clamped), so it
 *  has no entry here. */
export const STAR_BOUNDS = { ir: [0.05, 0.95] as const };

/** Five-pointed star inscribed in the box. Radii are half the box in each axis,
 *  so a non-square box yields a stretched star that still fills it exactly. */
export const star: GeometryFn = (w, h, p) => {
  const ir = clamp(p.ir ?? 0.38, STAR_BOUNDS.ir);
  const rot = (p.rot ?? 0) * Math.PI * 2;
  const cx = w / 2;
  const cy = h / 2;
  const pts: LocalPt[] = [];
  for (let i = 0; i < POINTS * 2; i++) {
    // Start at -90° so a point faces up at rot = 0.
    const angle = -Math.PI / 2 + rot + (i * Math.PI) / POINTS;
    const r = i % 2 === 0 ? 1 : ir;
    pts.push([cx + Math.cos(angle) * cx * r, cy + Math.sin(angle) * cy * r]);
  }
  return { points: pts };
};
