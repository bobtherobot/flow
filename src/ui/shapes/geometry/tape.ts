import type { GeometryFn, LocalPt } from "../types";

const SAMPLES = 24;

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
  const amp = Math.min(Math.max(p.amp ?? 0.12, 0), 0.4) * h;
  const cycles = 1 / Math.min(Math.max(p.wave ?? 0.5, 0.15), 1);

  const edge = (baseY: number): LocalPt[] =>
    Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const t = i / SAMPLES;
      return [t * w, baseY + Math.sin(t * Math.PI * 2 * cycles) * amp] as LocalPt;
    });

  // Insets keep both waving edges inside the box at maximum amplitude.
  const points = [...edge(amp), ...edge(h - amp).reverse()];

  return {
    points,
    path: `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`,
  };
};
