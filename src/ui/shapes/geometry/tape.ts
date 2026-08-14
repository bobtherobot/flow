import type { GeometryFn, LocalPt } from "../types";
import { clamp } from "./bounds";

const SAMPLES = 24;

/** `amp`/`wave`'s bounds, shared with their handle in registry.ts. */
export const TAPE_BOUNDS = { amp: [0, 0.4] as const, wave: [0.15, 1] as const };

/**
 * Every `t` where `sin(t*2*PI*cycles)` peaks at +1 within `[0, 1]` —
 * `t = (0.25 + k) / cycles` for each integer `k >= 0` while `t <= 1`. Merged
 * into the uniform sample grid below so the drawn polyline passes exactly
 * through every crest for any `wave`, not just the ones that happen to land
 * near a `SAMPLES`-spaced grid point.
 *
 * At low `wave` (many cycles packed into the same `SAMPLES` grid), a crest
 * can fall *between* two uniform samples — at `wave: 0.15, amp: 0.4` the true
 * curve at the first crest is `y = 2*amp*h`, but the nearest grid-only
 * segment interpolates through roughly `0.94 * 2*amp*h`, materially short of
 * the actual amplitude (this is the aliasing `tape.ts`'s own comment already
 * admitted). Sampling the crests explicitly fixes that under-drawing and, as
 * a direct consequence, is what makes the `wave` handle's analytic peak
 * formula land exactly on the rendered outline for every parameter value,
 * not just the ones that coincide with a uniform sample.
 */
function crestTs(cycles: number): number[] {
  const ts: number[] = [];
  for (let k = 0; ; k++) {
    const t = (0.25 + k) / cycles;
    if (t > 1) break;
    ts.push(t);
  }
  return ts;
}

/**
 * Tape: a band across the box whose top and bottom edges wave in parallel
 * (same amplitude, same phase), so the band keeps a constant thickness
 * regardless of amplitude. `amp` is the wave amplitude as a fraction of
 * height, clamped to 0..0.4 so the waving edges stay inset from the box's top
 * and bottom — that inset (`edge(amp)` / `edge(h - amp)` rather than `edge(0)`
 * / `edge(h)`) is what keeps every sampled point inside `[0, 0, w, h]` at
 * maximum amplitude. `wave` is the wavelength as a fraction of width, clamped
 * to 0.15..1 (below 0.15 the sampling would start aliasing the wave).
 */
export const tape: GeometryFn = (w, h, p) => {
  const amp = clamp(p.amp ?? 0.12, TAPE_BOUNDS.amp) * h;
  const cycles = 1 / clamp(p.wave ?? 0.5, TAPE_BOUNDS.wave);

  // Union of the uniform grid and every crest `t`, sorted and de-duplicated
  // (a crest can land exactly on a grid point, e.g. wave: 1 puts the first
  // crest exactly at sample index 6 of 24).
  const uniformTs = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
  const ts = Array.from(new Set([...uniformTs, ...crestTs(cycles)])).sort((a, b) => a - b);

  const edge = (baseY: number): LocalPt[] =>
    ts.map((t) => [t * w, baseY + Math.sin(t * Math.PI * 2 * cycles) * amp] as LocalPt);

  // Insets keep both waving edges inside the box at maximum amplitude.
  const points = [...edge(amp), ...edge(h - amp).reverse()];

  return {
    points,
    path: `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`,
  };
};
