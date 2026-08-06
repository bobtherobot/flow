import { CaptureUpdateAction, newElementWith, resizeSingleElement } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "./excalidraw-scene";
import { markDeferred, consumeDeferred } from "./deferred-commit";

type SceneElement = ReturnType<ExcalidrawAPI["getSceneElements"]>[number];

/** Smallest width/height a resize may produce (matches Excalidraw's floor). */
export const MIN_ELEMENT_SIZE = 1;

/** Mid-gesture writes defer history so a whole scrub is one undo entry. */
const captureFor = (transient: boolean) =>
  transient ? CaptureUpdateAction.EVENTUALLY : CaptureUpdateAction.IMMEDIATELY;

/**
 * Resize a single element to an exact width or height, reusing Excalidraw's own
 * resize routine (linear-point scaling, bound-text reflow/rescale, roundness) so
 * a numeric edit behaves exactly like dragging a handle. Anchors the top-left
 * corner ("e" grows east for width, "s" grows south for height). Commits through
 * the public `updateScene` as a single undo step (deferred to the next non-transient write when `transient`).
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
  transient = false,
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
  if (transient) markDeferred();
  api.updateScene({
    elements: next,
    captureUpdate: captureFor(transient),
    commitDeferredChanges: transient ? undefined : consumeDeferred(),
  });
}

/**
 * Set the text padding (gap before the bound text wraps) on one or more
 * containers. Because wrapping is precomputed and stored on the text element,
 * we set the padding on a clone then run a same-size `resizeSingleElement`,
 * whose `handleBindTextResize` step rewraps the bound text against the new
 * padding. Every container shares the one scene write, so a multi-selection edit
 * is still a single undo step (deferred to the next non-transient write when
 * `transient`).
 */
export function setContainerPadding(
  api: ExcalidrawAPI,
  ids: readonly string[],
  value: number,
  transient = false,
): void {
  const elements = api.getSceneElements();
  const map = new Map<string, SceneElement>(elements.map((el) => [el.id, { ...el }]));
  const origMap = new Map<string, SceneElement>(elements.map((el) => [el.id, { ...el }]));

  let touched = false;
  for (const id of ids) {
    const current = map.get(id);
    const orig = origMap.get(id);
    if (!current || !orig) continue;
    // Write padding through `newElementWith` so version/versionNonce bump. A raw
    // assignment leaves the container's version untouched and the history diff
    // never sees it: the rewrapped text got captured (its own version bumps),
    // the padding didn't, so undo restored the wrap but not the value.
    const padded = newElementWith(current, { padding: Math.max(0, value) } as Partial<SceneElement>);
    map.set(id, padded);
    resizeSingleElement(padded.width, padded.height, padded, orig, map, origMap, "e");
    touched = true;
  }
  if (!touched) return;

  const next = elements.map((el) => map.get(el.id) ?? el);
  if (transient) markDeferred();
  api.updateScene({
    elements: next,
    captureUpdate: captureFor(transient),
    commitDeferredChanges: transient ? undefined : consumeDeferred(),
  });
}
