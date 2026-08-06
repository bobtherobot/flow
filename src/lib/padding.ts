/**
 * Text-padding logic for the Text panel — pure, so it stays out of the
 * Excalidraw package barrel and unit-tests under jsdom. Padding is the gap
 * between a container's edge and its bound text, controlling where the text
 * wraps. Applies only to shape containers (rectangle/ellipse/diamond) that
 * actually hold bound text; arrow labels use a separate padding model.
 */

import type { SelectedElementIds } from "./selection-style";

/** Vendor BOUND_TEXT_PADDING (constants.ts) — the default when unset. */
export const DEFAULT_BOUND_TEXT_PADDING = 5;

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

export interface PaddingElement {
  id: string;
  type: string;
  padding?: number;
}

export interface MaybeBoundText {
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

/**
 * The selected ids a padding edit targets. Selected elements padding means
 * nothing for (bare shapes, arrows, loose text) are left out rather than
 * blocking the control, so a mixed multi-selection still pads the labelled
 * containers among them.
 */
export function paddingTargetIds(
  elements: readonly (PaddingElement & MaybeBoundText)[],
  selectedIds: SelectedElementIds,
): SelectedElementIds {
  const targets: Record<string, true> = {};
  for (const el of elements) {
    if (selectedIds[el.id] === true && paddingApplies(el, elements)) targets[el.id] = true;
  }
  return targets;
}

/** The container's effective text padding (explicit value, else the default). */
export function effectivePadding(el: PaddingElement): number {
  return typeof el.padding === "number" ? el.padding : DEFAULT_BOUND_TEXT_PADDING;
}
