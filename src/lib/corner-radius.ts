/**
 * Corner-radius logic for the Transform panel, kept free of the Excalidraw
 * package barrel (which pulls runtime that can't load under jsdom) so it stays
 * pure and unit-testable. The ROUNDNESS type ids and radius constants are inlined
 * from the vendor `constants.ts` — keep them in sync with the fork.
 */

const ROUNDNESS_PROPORTIONAL = 2; // ROUNDNESS.PROPORTIONAL_RADIUS
const ROUNDNESS_ADAPTIVE = 3; // ROUNDNESS.ADAPTIVE_RADIUS
const DEFAULT_PROPORTIONAL_RADIUS = 0.25;
const DEFAULT_ADAPTIVE_RADIUS = 32;
/** Corner radius an elbow arrow renders with when none is set (vendor Shape.ts). */
export const DEFAULT_ELBOW_RADIUS = 16;

/** The element fields corner-radius logic reads (structural subset of the scene
 *  element union). */
export interface RadiusElement {
  id: string;
  type: string;
  width: number;
  height: number;
  cornerRadius?: number;
  elbowed?: boolean;
  roundness?: { type: number; value?: number } | null;
}

const isRoundable = (el: RadiusElement) => el.type === "rectangle" || el.type === "diamond";
const isElbowArrow = (el: RadiusElement) => el.type === "arrow" && el.elbowed === true;

/** Whether the corner-radius control applies to this element (rectangle,
 *  diamond, or elbow arrow). */
export function cornerRadiusApplies(el: RadiusElement | null): boolean {
  return el !== null && (isRoundable(el) || isElbowArrow(el));
}

/**
 * The element's effective corner radius for display: the explicit value when
 * set, otherwise the radius the vendor would derive (mirrors `getCornerRadius`
 * plus the elbow default) so the field reflects what's actually drawn.
 */
export function effectiveCornerRadius(el: RadiusElement): number {
  if (typeof el.cornerRadius === "number") return el.cornerRadius;
  if (isElbowArrow(el)) return DEFAULT_ELBOW_RADIUS;
  if (isRoundable(el) && el.roundness) {
    const x = Math.min(el.width, el.height);
    if (el.roundness.type === ROUNDNESS_ADAPTIVE) {
      const fixed = el.roundness.value ?? DEFAULT_ADAPTIVE_RADIUS;
      return x <= fixed / DEFAULT_PROPORTIONAL_RADIUS ? x * DEFAULT_PROPORTIONAL_RADIUS : fixed;
    }
    return x * DEFAULT_PROPORTIONAL_RADIUS; // proportional / legacy
  }
  return 0;
}

/**
 * The element update that applies a corner radius. Rectangles/diamonds need a
 * truthy `roundness` for the rounded render path (and null clears it back to
 * sharp at 0); elbow arrows read `cornerRadius` directly.
 */
export function cornerRadiusUpdate(el: RadiusElement, value: number): Record<string, unknown> {
  if (isRoundable(el)) {
    return value > 0
      ? { cornerRadius: value, roundness: { type: ROUNDNESS_PROPORTIONAL } }
      : { cornerRadius: 0, roundness: null };
  }
  return { cornerRadius: value };
}
