/**
 * Shared clamp helper for geometry functions and their matching handles.
 *
 * Every geometry function clamps its own parameters, and every handle that
 * drives one of those parameters (`registry.ts`) must clamp to the *exact
 * same* bounds — otherwise a dragged dot and the drawn edge silently
 * disagree (narrow the geometry's clamp and the handle still drags past it).
 * Each geometry module exports its own bounds as a named constant; this
 * function is the one place the `Math.min(Math.max(...))` pattern itself
 * lives, so both sides read the same numbers instead of re-typing them.
 */
export function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(Math.max(value, min), max);
}
