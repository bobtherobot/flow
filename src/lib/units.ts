/**
 * Length-unit conversion for the panels' pixel-valued controls (e.g. stroke
 * width). Excalidraw stores lengths in canvas pixels; the user may prefer to
 * read/enter them in another unit. Pixels are canonical here; conversions use
 * the CSS reference of 96px per inch. Kept free of React/Excalidraw so it
 * unit-tests in isolation.
 */

export type Unit = "px" | "pt" | "mm" | "cm" | "in";

export const UNITS: readonly Unit[] = ["px", "pt", "mm", "cm", "in"];

export const DEFAULT_UNIT: Unit = "px";

/** Pixels per one of each unit at 96 DPI (the CSS reference). */
const PX_PER_UNIT: Record<Unit, number> = {
  px: 1,
  pt: 96 / 72,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};

/** Sensible display precision (decimal places) per unit. */
const PRECISION: Record<Unit, number> = {
  px: 0,
  pt: 1,
  mm: 2,
  cm: 3,
  in: 3,
};

export function isUnit(value: unknown): value is Unit {
  return typeof value === "string" && (UNITS as readonly string[]).includes(value);
}

/** Convert a value expressed in `unit` into canvas pixels. */
export function toPx(value: number, unit: Unit): number {
  return value * PX_PER_UNIT[unit];
}

/** Convert canvas pixels into `unit` (unrounded). */
export function fromPx(px: number, unit: Unit): number {
  return px / PX_PER_UNIT[unit];
}

/** Round to the display precision appropriate for `unit`. */
export function roundForUnit(value: number, unit: Unit): number {
  const factor = 10 ** PRECISION[unit];
  return Math.round(value * factor) / factor;
}

/** Pixels → `unit`, rounded for display. */
export function displayValue(px: number, unit: Unit): number {
  return roundForUnit(fromPx(px, unit), unit);
}

/** Step size (in the given unit) for a control's increment. */
export function unitStep(unit: Unit): number {
  return unit === "px" ? 1 : 10 ** -PRECISION[unit];
}
