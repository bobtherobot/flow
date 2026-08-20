import { CaptureUpdateAction, newElementWith, resizeSingleElement } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "./excalidraw-scene";
import { markDeferred, consumeDeferred } from "./deferred-commit";

type SceneElement = ReturnType<ExcalidrawAPI["getSceneElements"]>[number];
type UpdateAppState = NonNullable<Parameters<ExcalidrawAPI["updateScene"]>[0]>["appState"];

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
  const padding = Math.max(0, value);
  const byId = new Map(elements.map((el) => [el.id, el]));

  const updated = new Map<string, SceneElement>();
  for (const id of ids) {
    const container = byId.get(id);
    if (!container) continue;
    // Write the padding IMMUTABLY, via `newElementWith`, and hand the resulting
    // array to `updateScene` — do not mutate in place first.
    //
    // This is the second time this write has lost its history entry, by two
    // different mechanisms, so both are recorded here:
    //  1. (2026-08-05) A raw `latest.padding = value` assignment left
    //     version/versionNonce untouched, and the store decides an element
    //     changed by comparing versionNonce, so the change was invisible.
    //  2. (2026-08-20) The fix for (1) was later replaced by
    //     `api.mutateElement`, which does bump the version — but it mutates
    //     the live scene element *in place*, so by the time `updateScene` ran
    //     there was no delta left between the scene and itself and the store
    //     captured nothing. Probed: the undo stack stayed at 5 across two
    //     padding writes, so undo popped unrelated earlier entries and padding
    //     never stepped back.
    // `newElementWith` avoids both: it bumps the version AND leaves the live
    // element untouched until `updateScene` swaps the array in, which is the
    // delta the store needs. See `.claude/memory/flow-optional-prop-undo.md`.
    updated.set(id, newElementWith(container, { padding }));
  }
  if (updated.size === 0) return;

  const next = elements.map((el) => updated.get(el.id) ?? el);

  if (transient) markDeferred();
  api.updateScene({
    elements: next,
    // flow: currentItemPadding is a resident appState key (see
    // style-memory.ts's CATEGORY_KEYS doc) — only the "shape" category ever
    // creates a container with one, so there is no per-category bucket to
    // swap and appState is its only home. Without this write, editing an
    // existing container's padding directly (rather than reselecting one)
    // would never update what the next new container inherits.
    appState: { currentItemPadding: Math.max(0, value) } as UpdateAppState,
    captureUpdate: captureFor(transient),
    commitDeferredChanges: transient ? undefined : consumeDeferred(),
  });

  // Padding is not a dimension, so nothing rewraps the bound text on its own.
  // `redrawBoundText` needs the vendor's Scene, and it has to run against the
  // element instances that are now IN the scene — hence the re-read rather
  // than reusing the clones above.
  for (const el of api.getSceneElements()) {
    if (updated.has(el.id)) api.redrawBoundText(el);
  }
}
