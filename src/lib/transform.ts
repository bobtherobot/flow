import { CaptureUpdateAction, resizeSingleElement } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "./excalidraw-scene";

type SceneElement = ReturnType<ExcalidrawAPI["getSceneElements"]>[number];

/** Smallest width/height a resize may produce (matches Excalidraw's floor). */
export const MIN_ELEMENT_SIZE = 1;

/**
 * Resize a single element to an exact width or height, reusing Excalidraw's own
 * resize routine (linear-point scaling, bound-text reflow/rescale, roundness) so
 * a numeric edit behaves exactly like dragging a handle. Anchors the top-left
 * corner ("e" grows east for width, "s" grows south for height). Commits through
 * the public `updateScene` as a single undo step.
 *
 * The scene elements are frozen, so we resize on shallow clones: `map` is
 * mutated in place by `resizeSingleElement`, `origMap` stays the pre-resize
 * snapshot it reads (e.g. the bound-text font size).
 */
export function resizeElementDimension(
  api: ExcalidrawAPI,
  id: string,
  dimension: "width" | "height",
  value: number,
): void {
  const elements = api.getSceneElements();
  const map = new Map<string, SceneElement>(elements.map((el) => [el.id, { ...el }]));
  const origMap = new Map<string, SceneElement>(elements.map((el) => [el.id, { ...el }]));
  const latest = map.get(id);
  const orig = origMap.get(id);
  if (!latest || !orig) return;

  const nextWidth = Math.max(dimension === "width" ? value : latest.width, MIN_ELEMENT_SIZE);
  const nextHeight = Math.max(dimension === "height" ? value : latest.height, MIN_ELEMENT_SIZE);

  resizeSingleElement(
    nextWidth,
    nextHeight,
    latest,
    orig,
    map,
    origMap,
    dimension === "width" ? "e" : "s",
  );

  const next = elements.map((el) => map.get(el.id) ?? el);
  api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

/**
 * Set a container's text padding (gap before the bound text wraps). Because
 * wrapping is precomputed and stored on the text element, we set the padding on
 * a clone then run a same-size `resizeSingleElement`, whose `handleBindTextResize`
 * step rewraps the bound text against the new padding. One undo step.
 */
export function setContainerPadding(api: ExcalidrawAPI, id: string, value: number): void {
  const elements = api.getSceneElements();
  const map = new Map<string, SceneElement>(elements.map((el) => [el.id, { ...el }]));
  const origMap = new Map<string, SceneElement>(elements.map((el) => [el.id, { ...el }]));
  const latest = map.get(id);
  const orig = origMap.get(id);
  if (!latest || !orig) return;

  (latest as { padding?: number }).padding = Math.max(0, value);
  resizeSingleElement(latest.width, latest.height, latest, orig, map, origMap, "e");

  const next = elements.map((el) => map.get(el.id) ?? el);
  api.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}
