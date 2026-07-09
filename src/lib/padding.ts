/**
 * Text-padding logic for the Transform panel — pure, so it stays out of the
 * Excalidraw package barrel and unit-tests under jsdom. Padding is the gap
 * between a container's edge and its bound text, controlling where the text
 * wraps. Applies only to shape containers (rectangle/ellipse/diamond) that
 * actually hold bound text; arrow labels use a separate padding model.
 */

/** Vendor BOUND_TEXT_PADDING (constants.ts) — the default when unset. */
export const DEFAULT_BOUND_TEXT_PADDING = 5;

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

export interface PaddingElement {
  id: string;
  type: string;
  padding?: number;
}

interface MaybeBoundText {
  type: string;
  containerId?: string | null;
}

/** Whether `el` has a bound text element among `elements`. */
export function hasBoundText(el: PaddingElement, elements: readonly MaybeBoundText[]): boolean {
  return elements.some((e) => e.type === "text" && e.containerId === el.id);
}

/** Whether the padding control applies: a shape container holding bound text. */
export function paddingApplies(
  el: PaddingElement | null,
  elements: readonly MaybeBoundText[],
): boolean {
  return el !== null && CONTAINER_TYPES.has(el.type) && hasBoundText(el, elements);
}

/** The container's effective text padding (explicit value, else the default). */
export function effectivePadding(el: PaddingElement): number {
  return typeof el.padding === "number" ? el.padding : DEFAULT_BOUND_TEXT_PADDING;
}
