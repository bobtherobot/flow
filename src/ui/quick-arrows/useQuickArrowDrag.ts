import { useCallback, useEffect, useRef } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SceneElement } from "../shapes/useShapeSelection";
import type { StyleMemoryHandle } from "../useStyleMemory";
import {
  beginToolGesture,
  endToolGesture,
  getSuspendedTool,
  restoreTool,
} from "../toolbar/tool-restore";
import { edgeMidpoint, toViewport, type QuickArrowSide, type Viewport } from "./quick-arrow-geometry";

interface UseQuickArrowDragArgs {
  api: ExcalidrawAPI | null;
  element: SceneElement;
  side: QuickArrowSide;
  styleMemory?: StyleMemoryHandle | null;
}

interface DragAppState {
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
  activeTool: { type: string };
  currentItemArrowType: string;
}

/** `setActiveTool` takes a discriminated union keyed on `type`. */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

/**
 * Events that can end a quick-arrow gesture. Neither `pointerup` nor
 * `pointercancel` is guaranteed to arrive: a right-click opening the context
 * menu mid-drag, or releasing over another application (alt-tab), can end the
 * gesture without either ever firing, so a window `blur` ends it too. Same
 * reasoning, same fix, as `useScrubDrag.ts`'s identical gap.
 *
 * Vendor has its own recovery for a missing pointerup
 * (`maybeCleanupAfterMissingPointerUp`), but it invokes its stored handler
 * directly as a function call rather than dispatching a `"pointerup"` DOM
 * event (vendor App.tsx), so it never reaches a `window.addEventListener`
 * here — this gesture has to detect the loss itself.
 */
const GESTURE_END_EVENTS = ["pointerup", "pointercancel", "blur"] as const;

function addGestureEndListeners(handler: () => void): void {
  for (const type of GESTURE_END_EVENTS) window.addEventListener(type, handler);
}

function removeGestureEndListeners(handler: () => void): void {
  for (const type of GESTURE_END_EVENTS) window.removeEventListener(type, handler);
}

/**
 * Turn a press on one quick-arrow triangle into a real Excalidraw
 * arrow-draw gesture.
 *
 * flow does **not** draw the arrow. It arms the elbow arrow tool and hands
 * vendor a single synthesized `pointerdown` on `canvas.interactive`; from
 * there vendor owns the gesture, because `handleCanvasPointerDown` registers
 * its move/up listeners on `window` rather than on the pointerdown target
 * (vendor App.tsx). Binding, elbow routing, the binding highlight, snapping,
 * escape-to-cancel and single-entry undo therefore all come for free, and
 * none of them is reimplemented here.
 *
 * Two details are load-bearing and neither is obvious:
 *
 * **The origin is the grabbed edge's midpoint, not the pointer.**
 * `maxBindingDistance_simple` is only ~15px at zoom 1, so a gesture
 * originating out on the triangle would silently fail to bind to the source
 * shape — the most important half of the feature, lost with no error. It also
 * gives the elbow route its outgoing heading, so the top arrow produces an
 * arrow that leaves upward.
 *
 * **The dispatch waits one animation frame.** React has not committed the
 * tool change by the time this handler returns, so a same-tick dispatch
 * reaches vendor with `activeTool` still `"selection"` and draws a selection
 * marquee instead of an arrow (measured, not assumed). The pointer-up handler
 * cancels a still-pending frame, which is both what keeps a very fast click
 * from leaving vendor stuck mid-drag and what makes "a click does nothing"
 * true.
 */
export function useQuickArrowDrag({
  api,
  element,
  side,
  styleMemory,
}: UseQuickArrowDragArgs): (e: React.PointerEvent) => void {
  const frame = useRef<number | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  // A gesture still in flight when this triangle unmounts would leave the
  // gesture flag set forever, permanently disabling the Cmd/Ctrl override's
  // restore. Mirrors ShapeHandles' unmount-only release of the
  // deferred-commit bit, and for the same reason: there is no synthetic
  // "gesture ended" signal to key an effect off.
  useEffect(() => () => cleanup.current?.(), []);

  return useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!api) return;

      const canvas = document.querySelector("canvas.interactive");
      if (!canvas) return;

      // The `preventDefault()` above suppresses the focus transfer a genuine
      // canvas pointerdown would perform, so without this the Excalidraw
      // container never takes focus and the user's next keystroke -- undo,
      // Escape, Delete -- is silently dead on arrival, even though the arrow
      // this gesture draws really does land in the undo stack. Measured: the
      // arrow was present in `history.undoStack` while Ctrl+Z did nothing,
      // with `document.activeElement` still on the glyph's own rail button.
      (document.querySelector(".excalidraw-container") as HTMLElement | null)?.focus({
        preventScroll: true,
      });

      const state = api.getAppState() as unknown as DragAppState;
      const v: Viewport = {
        zoom: state.zoom.value,
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        offsetLeft: state.offsetLeft,
        offsetTop: state.offsetTop,
      };
      const mid = edgeMidpoint(element, side);
      const origin = toViewport(mid.x, mid.y, v);

      // What to hand back afterwards. While the Cmd/Ctrl override is engaged
      // the active tool reads "selection", but the tool the user actually
      // wants back is the one the override suspended.
      const previousTool = getSuspendedTool() ?? state.activeTool.type;

      const { pointerId, pointerType } = e;
      const previousArrowType = state.currentItemArrowType;

      const setAppState = (appState: Record<string, unknown>) =>
        api.updateScene({ appState } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);

      /** Hand the tool, and the arrow-type preference, back. */
      const restore = () => {
        endToolGesture();
        // Before restoreTool, not after: its style-memory reload reads
        // `currentItemArrowType` and would otherwise fold this gesture's
        // temporary "elbow" into the linear bucket as if the user had chosen
        // it. The already-drawn arrow keeps its own elbowed geometry — this
        // only puts the *next* arrow's default back.
        setAppState({ currentItemArrowType: previousArrowType });
        restoreTool(api, previousTool, styleMemory);
      };

      // Released before the dispatch: a click, not a drag. Cancelling matters
      // — vendor would otherwise receive a pointerdown with no matching
      // pointerup and hang in drag state — and it is also what makes "a click
      // does nothing" true.
      const onEarlyUp = () => {
        removeGestureEndListeners(onEarlyUp);
        cleanup.current = null;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        restore();
      };

      const onGestureUp = () => {
        removeGestureEndListeners(onGestureUp);
        cleanup.current = null;
        restore();
      };

      beginToolGesture();
      cleanup.current = () => {
        removeGestureEndListeners(onEarlyUp);
        removeGestureEndListeners(onGestureUp);
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        endToolGesture();
      };
      addGestureEndListeners(onEarlyUp);

      setAppState({ currentItemArrowType: "elbow" });
      api.setActiveTool({ type: "arrow", locked: true } as SetToolArg);

      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        removeGestureEndListeners(onEarlyUp);
        canvas.dispatchEvent(
          new PointerEvent("pointerdown", {
            // React delegates at the root container, so the event has to
            // bubble for vendor's onPointerDown to see it at all.
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId,
            pointerType,
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX: origin.x,
            clientY: origin.y,
          }),
        );
        // Registered AFTER the dispatch, and this ordering is load-bearing.
        // Window pointerup listeners fire in registration order, and vendor
        // registers its own inside the dispatch above. Registering ours at
        // pointerdown — one frame earlier — would put it FIRST, so the tool
        // would be switched back out from under vendor before it finalized
        // the arrow.
        addGestureEndListeners(onGestureUp);
      });
    },
    [api, element, side, styleMemory],
  );
}
