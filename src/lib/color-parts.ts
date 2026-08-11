// src/lib/color-parts.ts
import { resolveTextTargetIds, type SelectedElementIds } from "./selection-style";

/** The three things on a selection that can carry a color. */
export type ColorPart = "fill" | "stroke" | "text";

/** Everything a write needs to know about one part. */
export interface PartSpec {
  part: ColorPart;
  /** Element property to write. */
  prop: string;
  /** Ids the write targets. */
  ids: SelectedElementIds;
  /** Matching `currentItem*` appState default. */
  currentItemKey: string;
}

interface PartTarget {
  prop: string;
  currentItemKey: string;
  /** Which resolved id map the part writes through. */
  source: "selection" | "text";
}

const TARGETS: Record<ColorPart, PartTarget> = {
  fill: {
    prop: "backgroundColor",
    currentItemKey: "currentItemBackgroundColor",
    source: "selection",
  },
  stroke: {
    prop: "strokeColor",
    currentItemKey: "currentItemStrokeColor",
    source: "selection",
  },
  // Excalidraw text has exactly one color and it lives on `strokeColor`; the
  // glyph fill and a shape's outline share a property name and nothing else.
  text: {
    prop: "strokeColor",
    currentItemKey: "currentItemTextColor",
    source: "text",
  },
};

interface PartElement {
  id: string;
  type: string;
  boundElements?: readonly { id: string; type: string }[] | null;
}

/**
 * Which parts the current selection exposes.
 *
 * A bare text element gets `["text"]` alone — it has no fill and no outline of
 * its own, so offering those two boxes would offer two writes that do nothing.
 * A labeled container gets all three. An empty selection is editing the tool
 * defaults, which always have a fill and a stroke.
 */
export function availableParts(
  elements: readonly PartElement[],
  selectedIds: SelectedElementIds,
): ColorPart[] {
  const selected = elements.filter((el) => selectedIds[el.id] === true);
  const hasText = Object.keys(resolveTextTargetIds(elements, selectedIds)).length > 0;

  const textOnly = selected.length > 0 && selected.every((el) => el.type === "text");
  if (textOnly) return ["text"];

  return hasText ? ["fill", "stroke", "text"] : ["fill", "stroke"];
}

/** Resolve one part into its write target. */
export function partSpec(
  part: ColorPart,
  selectedIds: SelectedElementIds,
  textTargetIds: SelectedElementIds,
): PartSpec {
  const target = TARGETS[part];
  return {
    part,
    prop: target.prop,
    ids: target.source === "text" ? textTargetIds : selectedIds,
    currentItemKey: target.currentItemKey,
  };
}

/**
 * Keep the stored active part honest against what the selection actually
 * offers. Selecting text should land on the text part without the user
 * clicking anything, and a part that just became unavailable must not leave
 * the picker pointed at a write that goes nowhere.
 */
export function normalizeActivePart(available: ColorPart[], active: ColorPart): ColorPart {
  if (available.includes(active)) return active;
  return available.includes("fill") ? "fill" : available[0];
}

interface SwappableElement {
  strokeColor: string;
  backgroundColor: string;
}

/** The fill↔stroke exchange for one element, or null when it would be a no-op. */
export function swapFillStroke(el: SwappableElement): Record<string, unknown> | null {
  if (el.strokeColor === el.backgroundColor) return null;
  return { backgroundColor: el.strokeColor, strokeColor: el.backgroundColor };
}
