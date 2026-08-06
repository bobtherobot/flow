/**
 * Per-category style memory — the pure layer. Owns the four categories, the
 * element-props → `currentItem*` snapshot mapping, and the filter that decides
 * which remembered keys may be applied to a given creation target.
 *
 * Kept free of Excalidraw imports (mirroring selection-style.ts, corner-radius.ts
 * and padding.ts) so it unit-tests under jsdom; the package barrel pulls runtime
 * that throws there. The stateful store lives in style-memory-store.ts and the
 * React bridge in ui/useStyleMemory.ts; this module stays pure.
 */

import { cornerRadiusApplies, effectiveCornerRadius, type RadiusElement } from "./corner-radius";
import { effectivePadding, type PaddingElement } from "./padding";

/** The four style memories. Anything not covered here has none. */
export type StyleCategory = "shape" | "linear" | "text" | "freedraw";

/** A partial set of Excalidraw `currentItem*` defaults. */
export type StyleBucket = Record<string, unknown>;

/** The minimum a scene element must expose to be snapshotted. */
export interface StyleElement {
  id: string;
  type: string;
  [key: string]: unknown;
}

/** What a load is about to create, enough to filter the bucket down. */
export interface LoadTarget {
  category: StyleCategory;
  /** Excalidraw `activeTool.type`. */
  toolType: string;
  /** Live `currentItemArrowType`; only consulted when `toolType` is "arrow". */
  arrowType: string;
}

const ELEMENT_CATEGORY: Record<string, StyleCategory> = {
  rectangle: "shape",
  diamond: "shape",
  ellipse: "shape",
  arrow: "linear",
  line: "linear",
  text: "text",
  freedraw: "freedraw",
};

/** The category an element's style is remembered under, or null for types with
 *  no meaningful style (image, frame, iframe, embeddable). */
export function categoryOfElement(type: string): StyleCategory | null {
  return ELEMENT_CATEGORY[type] ?? null;
}

/** The category a tool draws into, or null for tools that create nothing we
 *  style (selection, hand, eraser, laser, image, frame). */
export function categoryOfTool(toolType: string): StyleCategory | null {
  return ELEMENT_CATEGORY[toolType] ?? null;
}

const STROKE_KEYS = [
  "currentItemStrokeColor",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemOpacity",
] as const;

const SURFACE_KEYS = [
  ...STROKE_KEYS,
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemRoundness",
  "currentItemCornerRadius",
] as const;

/**
 * The `currentItem*` keys each category buckets. Only **contended** keys appear
 * — ones two or more categories can actually render. A key just one category
 * uses (font size, arrowheads, padding, arrow type) is already correct in
 * Excalidraw's single flat slot because nothing else overwrites it, so bucketing
 * it would be motion without effect. Those stay resident.
 *
 * `shape` and `linear` are both surfaces: a closed line renders its fill, and
 * `newLinearElement` reads `currentItemRoundness` just as rectangles do.
 */
export const CATEGORY_KEYS: Record<StyleCategory, readonly string[]> = {
  shape: SURFACE_KEYS,
  linear: SURFACE_KEYS,
  text: ["currentItemOpacity"],
  freedraw: STROKE_KEYS,
};

/** Every contended key, deduplicated — what the drift watcher folds. */
export const CONTENDED_KEYS: readonly string[] = [
  ...new Set(Object.values(CATEGORY_KEYS).flat()),
];

/** `patch` reduced to the keys a bucket is allowed to hold. Resident keys are
 *  dropped: they live authoritatively in appState, with nothing to swap. */
export function contendedOnly(patch: StyleBucket): StyleBucket {
  const out: StyleBucket = {};
  for (const key of CONTENDED_KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  return out;
}

/** Whether a numeric corner radius means anything for this element. */
const hasRadius = (el: StyleElement) =>
  cornerRadiusApplies(el as unknown as RadiusElement);

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

/**
 * The `currentItem*` values an element's style implies. Includes resident keys
 * as well as contended ones: adoption writes the whole snapshot through, so
 * arrowheads and font size must be present even though they are never bucketed.
 *
 * `currentItemRoughness` is deliberately absent — sloppiness is an app-wide flow
 * preference re-asserted at the call site, and shadowing it here would fight App.
 */
export function snapshotElement(el: StyleElement): StyleBucket {
  const category = categoryOfElement(el.type);
  if (!category) return {};

  const snap: StyleBucket = { currentItemOpacity: el.opacity };

  if (category === "text") {
    // Text colour is independent of stroke in the fork; new text reads
    // currentItemTextColor (vendor App.tsx:5314).
    snap.currentItemTextColor = el.strokeColor;
    snap.currentItemFontFamily = el.fontFamily;
    snap.currentItemFontSize = el.fontSize;
    snap.currentItemTextAlign = el.textAlign;
    return snap;
  }

  snap.currentItemStrokeColor = el.strokeColor;
  snap.currentItemStrokeWidth = el.strokeWidth;
  snap.currentItemStrokeStyle = el.strokeStyle;

  if (category === "freedraw") return snap;

  snap.currentItemBackgroundColor = el.backgroundColor;
  snap.currentItemFillStyle = el.fillStyle;

  if (el.type === "arrow") {
    // Arrows derive their curve from arrowType, never from currentItemRoundness
    // (vendor App.tsx:7752), so recording a roundness for them would be a lie.
    snap.currentItemArrowType = el.elbowed ? "elbow" : el.roundness ? "round" : "sharp";
    snap.currentItemStartArrowhead = el.startArrowhead;
    snap.currentItemEndArrowhead = el.endArrowhead;
    snap.currentItemStartArrowheadSize = el.startArrowheadSize;
    snap.currentItemEndArrowheadSize = el.endArrowheadSize;
  } else {
    snap.currentItemRoundness = el.roundness ? "round" : "sharp";
  }

  if (hasRadius(el)) {
    // effectiveCornerRadius resolves an unset field to what is actually drawn.
    snap.currentItemCornerRadius = effectiveCornerRadius(el as unknown as RadiusElement);
  }

  return snap;
}

/**
 * A container's text padding, recorded separately because the field lives on the
 * shape while the setting belongs to text. The bridge folds this into the text
 * adoption when a captioned container is selected.
 */
export function snapshotContainerPadding(el: StyleElement): StyleBucket {
  if (!CONTAINER_TYPES.has(el.type)) return {};
  return { currentItemPadding: effectivePadding(el as unknown as PaddingElement) };
}

/**
 * The bucket keys that may be applied to a creation target. Anything that would
 * be inert or wrong on that target is dropped rather than stamped — an ellipse
 * has no corner radius, a plain arrow has no bends to soften, and an arrow's
 * curve comes from arrowType rather than roundness.
 */
export function applicableKeys(target: LoadTarget): readonly string[] {
  const owned = CATEGORY_KEYS[target.category];
  const drop = new Set<string>();

  if (target.toolType === "arrow") {
    drop.add("currentItemRoundness");
    if (target.arrowType !== "elbow") drop.add("currentItemCornerRadius");
  } else if (target.toolType === "line" || target.toolType === "ellipse") {
    drop.add("currentItemCornerRadius");
  }

  return owned.filter((key) => !drop.has(key));
}
