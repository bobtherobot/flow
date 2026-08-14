import { useEffect, useRef } from "react";
import { CaptureUpdateAction, newElementWith, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { useDrag } from "../panels/dock/useDrag";
import { markDeferred, consumeDeferred, resetDeferred } from "../../lib/deferred-commit";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SceneElement } from "./useShapeSelection";
import type { FlowShape, HandleDef, ShapeParams } from "./types";

interface UseHandleDragArgs {
  api: ExcalidrawAPI | null;
  element: SceneElement;
  handle: HandleDef;
}

/**
 * Un-rotate a point (measured from the element's own x/y origin) by `-angle`
 * about the box centre — the inverse of `ShapeHandles`' `rotateAboutCenter`.
 * Feeding a rotated element's raw pointer-derived local coords straight into
 * `handle.from` (skipping this) works by accident on an unrotated shape and
 * is wrong on every rotated one.
 */
function unrotateAboutCenter(
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
): readonly [number, number] {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return [dx * cos - dy * sin + cx, dx * sin + dy * cos + cy];
}

/**
 * Drag handler for one orange handle dot. Returns an `onPointerDown` to wire
 * to the `<button>` (via `useDrag`, this repo's pointer-drag primitive).
 *
 * Every pointer-move: viewport -> scene (`viewportCoordsToSceneCoords`) ->
 * subtract the element's origin -> un-rotate by `-element.angle` about the
 * box centre -> feed the resulting local point to `handle.from`, merging its
 * result over the existing params (`{ ...p, ...from(...) }`) so a shape with
 * more than one handle never loses the other handle's value.
 *
 * Writes are split the same way `resizeElementDimension`/`setContainerPadding`
 * (src/lib/transform.ts) and `useSelectionStyle`'s `update` split a scrub:
 * every move is `CaptureUpdateAction.EVENTUALLY` (deferred, marked via
 * `markDeferred`), and the pointer-up write is a single
 * `CaptureUpdateAction.IMMEDIATELY` with `commitDeferredChanges` so the whole
 * drag lands in undo/redo as one entry, not one per frame. If the gesture
 * ends *without* that commit — the dot unmounts mid-drag because the
 * selection changed underneath it (e.g. Escape) — an unmount effect below
 * releases the deferred-commit bit itself, the same release
 * `SliderInput.tsx`/`NumberInput.tsx`/`useNumberField.ts` already perform for
 * their own interruptible gestures, and for the same reason: a leaked bit
 * would let the next, unrelated scene write inherit its uncommitted-element
 * bypass.
 *
 * Every write goes through `newElementWith` to mint a **new** element object,
 * never `mutateElement`/an in-place patch. Two independent reasons converge
 * here: (1) this repo's rule that flow-added properties must be written via
 * `newElementWith` so history captures them, and (2) `mutateElement` only
 * calls `ShapeCache.delete` when the update touches
 * `width`/`height`/`fileId`/`points` (vendor's `mutateElement.ts`) — a
 * `customData`-only in-place write leaves the cached rough shape stale, so
 * the outline visibly freezes mid-drag while the underlying data is already
 * correct. A fresh object identity was never cached, so it's a guaranteed
 * cache miss and sidesteps the freeze entirely.
 */
export function useHandleDrag({
  api,
  element,
  handle,
}: UseHandleDragArgs): (e: React.PointerEvent) => void {
  const elementId = element.id;

  // Whether *this* gesture has left the deferred-commit bit set (a move
  // fired, marking it, with no committing write yet to clear it). Guards the
  // unmount cleanup below so it can only ever release a flag this instance
  // itself set — never one belonging to some unrelated control's live
  // gesture.
  const pendingRef = useRef(false);

  // A drag interrupted before its commit write — e.g. Escape deselecting the
  // element mid-drag, which unmounts this dot (`useShapeSelection` drops the
  // selection the moment it stops being exactly one element) — would
  // otherwise leave the deferred-commit bit set forever. `useDrag`'s own
  // cleanup only strips its window listeners; it has no synthetic `onEnd` to
  // fire on unmount. Mirrors `SliderInput.tsx`'s unmount-only release (that
  // component's docstring explains why unmount-only, not a dependency-keyed
  // effect: there's no in-between "gesture ended" signal to key off besides
  // the commit itself and unmounting).
  useEffect(
    () => () => {
      if (pendingRef.current) resetDeferred();
    },
    [],
  );

  const applyDrag = (clientX: number, clientY: number, commit: boolean): void => {
    if (!api) return;
    const current = api.getSceneElements().find((el) => el.id === elementId);
    if (!current) return;

    const raw = current.customData as { flowShape?: FlowShape } | undefined;
    const flowShape = raw?.flowShape;
    if (!flowShape) return;

    const appState = api.getAppState();
    const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords({ clientX, clientY }, appState);
    const [lx, ly] = unrotateAboutCenter(
      sceneX - current.x,
      sceneY - current.y,
      current.width,
      current.height,
      current.angle,
    );

    const nextParams: ShapeParams = {
      ...flowShape.p,
      ...handle.from(lx, ly, current.width, current.height, flowShape.p),
    };

    const nextElements = api.getSceneElements().map((el) =>
      el.id === elementId
        ? newElementWith(el, {
            customData: {
              ...el.customData,
              flowShape: { kind: flowShape.kind, p: nextParams },
            },
          } as Partial<SceneElement>)
        : el,
    );

    if (!commit) {
      markDeferred();
      pendingRef.current = true;
    } else {
      pendingRef.current = false;
    }
    api.updateScene({
      elements: nextElements,
      captureUpdate: commit ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.EVENTUALLY,
      commitDeferredChanges: commit ? consumeDeferred() : undefined,
    });
  };

  return useDrag({
    onMove: (m) => applyDrag(m.x, m.y, false),
    onEnd: (m) => {
      // The pointer never crossed useDrag's movement threshold, so onMove
      // never fired and nothing was ever written transiently — skip the
      // commit so a plain click on the dot doesn't mint a no-op undo entry.
      if (!m.moved) return;
      applyDrag(m.x, m.y, true);
    },
  });
}
