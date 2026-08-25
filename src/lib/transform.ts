import { CaptureUpdateAction, newElementWith, resizeSingleElement } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "./excalidraw-scene";
import { markDeferred, consumeDeferred } from "./deferred-commit";
import { clampLineHeight, textHeightAt } from "./line-height";

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

/**
 * Set one line height across a selection of text elements — the Text panel's
 * presets and manual field. See `writeLineHeights` for what the write entails.
 */
export function setTextLineHeight(
  api: ExcalidrawAPI,
  ids: readonly string[],
  value: number,
  transient = false,
): void {
  const lineHeight = clampLineHeight(value);
  writeLineHeights(
    api,
    new Map(ids.map((id) => [id, lineHeight])),
    transient,
  );
}

/**
 * Re-apply per-element line heights captured before a font-family change.
 *
 * Vendor's `changeFontFamily` overwrites `lineHeight` with the incoming font's
 * own metric, which discards a line height the user chose deliberately. flow
 * captures those first (`customLineHeights`) and puts them back here, straight
 * after the action — which is also correct for the *asynchronous* half of that
 * action: when the font faces aren't loaded yet the redraw is deferred to a
 * `document.fonts.load().then()`, and that callback deliberately re-reads each
 * element from the scene by id rather than closing over the instance it built,
 * so it measures against the line height restored here rather than the one it
 * replaced.
 */
export function restoreTextLineHeights(
  api: ExcalidrawAPI,
  values: ReadonlyMap<string, number>,
): void {
  writeLineHeights(api, values, false);
}

/**
 * Write one line height per id. Two shapes of text need two different
 * follow-ups:
 *
 *  • **Bound text** — the container decides the wrap width and the label's
 *    position, and it may have to grow to fit the taller text. `redrawBoundText`
 *    is vendor's own routine for exactly that (the same one padding leans on),
 *    so the write here is just the property and the container does the rest.
 *  • **Free text** — nothing recomputes its bounding box on its own, so the new
 *    height goes in the same immutable write. It is computed rather than
 *    measured because line height cannot change where the text wraps: the line
 *    count is already fixed, and `textHeightAt` is vendor's own formula.
 *
 * Every element shares the one scene write, so a multi-element edit stays a
 * single undo step (deferred to the next non-transient write when `transient`).
 * As everywhere else on these panels, the write is `newElementWith` — a raw
 * mutation records no history entry (see `.claude/memory/flow-optional-prop-undo.md`).
 */
function writeLineHeights(
  api: ExcalidrawAPI,
  values: ReadonlyMap<string, number>,
  transient: boolean,
): void {
  const elements = api.getSceneElements();
  const byId = new Map(elements.map((el) => [el.id, el]));

  const updated = new Map<string, SceneElement>();
  const containerIds = new Set<string>();
  for (const [id, raw] of values) {
    const lineHeight = clampLineHeight(raw);
    const el = byId.get(id);
    if (!el || el.type !== "text") continue;
    if (el.containerId) {
      containerIds.add(el.containerId);
      updated.set(id, newElementWith(el, { lineHeight } as Partial<SceneElement>));
    } else {
      updated.set(
        id,
        newElementWith(el, {
          lineHeight,
          height: textHeightAt(el, lineHeight),
        } as Partial<SceneElement>),
      );
    }
  }
  if (updated.size === 0) return;

  const next = elements.map((el) => updated.get(el.id) ?? el);

  if (transient) markDeferred();
  api.updateScene({
    elements: next,
    captureUpdate: captureFor(transient),
    commitDeferredChanges: transient ? undefined : consumeDeferred(),
  });

  // Re-read: `redrawBoundText` needs the element instances that are now IN the
  // scene, not the clones above — same as `setContainerPadding`.
  for (const el of api.getSceneElements()) {
    if (containerIds.has(el.id)) api.redrawBoundText(el);
  }
}
