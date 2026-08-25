import type { SceneElement } from "../shapes/useShapeSelection";

/**
 * Can an arrow bind to this element?
 *
 * Mirrors vendor's `isBindableElement`
 * (`vendor/excalidraw/packages/element/src/typeChecks.ts`) with
 * `includeLocked: false`. Reimplemented rather than imported because that
 * predicate is not re-exported from the public `@excalidraw/excalidraw`
 * entry point, and exporting it would be a fork edit this feature does not
 * otherwise need.
 *
 * If a vendor upgrade adds a bindable type, this list goes stale silently —
 * the new type simply gets no quick arrows. That is the acceptable failure
 * direction (missing affordance, not a broken one).
 */
export function isBindableForQuickArrows(element: SceneElement): boolean {
  if (element.locked) return false;
  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "image":
    case "iframe":
    case "embeddable":
    case "frame":
    case "magicframe":
      return true;
    case "text":
      return !element.containerId;
    default:
      return false;
  }
}

/**
 * Is this one of the two frame-like bindable types?
 *
 * Frames are bindable, so they get quick arrows of their own — but they are
 * also the one type whose position in the element array lies about its paint
 * order (see `useHoverTarget`'s `resolve`), so hover resolution has to be able
 * to tell them apart from everything else.
 */
export function isFrameLikeForQuickArrows(element: SceneElement): boolean {
  return element.type === "frame" || element.type === "magicframe";
}
