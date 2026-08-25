import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SceneElement } from "../shapes/useShapeSelection";
import type { StyleMemoryHandle } from "../useStyleMemory";
import {
  beginToolGesture,
  endToolGesture,
  markToolGestureArmed,
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
 * Squared-distance gate before a press becomes a drag — same idiom and
 * default as `src/ui/panels/dock/useDrag.ts`'s `threshold` option, matched
 * for consistency rather than re-derived.
 */
const MOVE_THRESHOLD_SQ = 4;

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
 * flow does **not** draw the arrow. Once a press turns into a drag, it arms
 * the elbow arrow tool and hands vendor a single synthesized `pointerdown` on
 * `canvas.interactive`; from there vendor owns the gesture, because
 * `handleCanvasPointerDown` registers its move/up listeners on `window`
 * rather than on the pointerdown target (vendor App.tsx). Binding, elbow
 * routing, the binding highlight, snapping, escape-to-cancel and
 * single-entry undo therefore all come for free, and none of them is
 * reimplemented here.
 *
 * Four details are load-bearing and none of them is obvious:
 *
 * **Nothing is armed until the pointer actually moves.** A plain click has
 * to do nothing at all — no tool change, no undo entry. An earlier version
 * tried to detect a click by racing the `pointerup` against the
 * animation-frame wait below ("if it fires first, cancel"), on the premise
 * that a real click is fast enough to win that race. Measured: it is not —
 * a frame is ~16.7ms and a real human click is 40-100ms, so the cancel path
 * almost never fired and every plain click quietly minted a degenerate,
 * start-only-bound arrow. Movement is the only reliable signal: focusing the
 * container, arming the tool, the rAF and the dispatch all wait for the
 * first `pointermove` to clear `MOVE_THRESHOLD_SQ`, exactly the gate
 * `useDrag.ts` uses for the same click-vs-drag question.
 *
 * **The tool claim is made at pointerdown, before movement is even
 * confirmed — everything else waits, this doesn't.** `useHoverTarget`
 * treats any held button as "some other gesture owns the canvas" and arms a
 * 120ms grace timer to clear the hovered target; that timer, once armed,
 * fires unconditionally and does not re-check the flag. Waiting for `arm()`
 * to claim it (matching every other movement-gated step) leaves a window,
 * right after pointerdown and before the first qualifying move, where a
 * button is already held but the flag isn't set yet — long enough for that
 * timer to arm, and it then fires moments later and unmounts the very
 * triangle mid-gesture (measured: the unmount landed ~120ms after
 * pointerdown, tearing down `onGestureUp` before vendor's real pointerup
 * ever arrived, stranding the arrow tool armed). Claiming the flag here,
 * before `useHoverTarget`'s own first `pointermove` handler can ever see
 * this press, keeps that timer from arming in the first place.
 * `onUnarmedEnd` releases the claim again if the press never becomes a drag,
 * so a plain click still leaves `isToolGestureActive()` false once it's
 * done. The claim also records **which tool to hand back**, for a second and
 * independent reason: the Cmd/Ctrl override can release its own claim at any
 * moment, including between this pointerdown and the first qualifying move.
 * Reading the suspended tool later — at `arm()` — meant a keyup landing in
 * that gap had already cleared it, and the gesture handed back the override's
 * own `"selection"` instead of the user's tool. `tool-restore.ts` documents
 * the full `(suspendedTool, gesture)` quadrant, all four states of it.
 *
 * **The origin is the grabbed edge's midpoint, not the pointer.**
 * `maxBindingDistance_simple` is only ~15px at zoom 1, so a gesture
 * originating out on the triangle would silently fail to bind to the source
 * shape — the most important half of the feature, lost with no error. It also
 * gives the elbow route its outgoing heading, so the top arrow produces an
 * arrow that leaves upward. The pointer having wandered away from the glyph
 * before the movement threshold trips is fine and expected; the origin never
 * tracks the pointer.
 *
 * **The dispatch waits one animation frame after arming, and arming itself
 * must flush synchronously.** React only flushes a state update
 * synchronously when it originates from React's own event dispatch; `arm()`
 * runs from a plain native `window.addEventListener("pointermove", ...)`
 * callback, not from vendor's React-owned pointerdown handler, so a bare
 * `setActiveTool` call schedules its flush asynchronously instead. Measured:
 * without wrapping it in `flushSync`, the `requestAnimationFrame` below can
 * fire before that flush lands — sometimes within under a millisecond, since
 * a callback requested while already inside a frame's event-handling phase
 * can run later in that same frame — so the dispatch still saw
 * `activeTool: "selection"` and drew a marquee instead of an arrow.
 * `flushSync` forces the commit (and vendor's own `componentDidUpdate`) to
 * finish before arming returns, so the rAF wait is timing vendor's own
 * settling, not racing React. A release landing inside that one frame (rare,
 * but still possible) cancels the pending dispatch instead of leaving vendor
 * mid-drag with no matching pointerup.
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

      // Only what the movement gate itself needs. Everything else (viewport,
      // previousTool, previousArrowType) is read fresh at arm time, once a
      // drag is actually confirmed, rather than snapshotted here.
      const startX = e.clientX;
      const startY = e.clientY;
      const { pointerId, pointerType } = e;

      // Claimed immediately — see the hook docstring's second point. Every
      // OTHER consequence of a press (focus, tool change, the dispatch)
      // still waits for confirmed movement; only this claim can't, because
      // `useHoverTarget`'s grace timer doesn't re-check it once armed and
      // because the tool it captures stops being readable the moment the
      // Cmd/Ctrl modifier comes up.
      beginToolGesture((api.getAppState() as unknown as DragAppState).activeTool.type);

      /**
       * Hand the tool back, if anything is owed. `endToolGesture` answers
       * *what* is owed and returns null when the answer is "nothing" — the
       * normal case for a plain click, which must stay a total no-op. Both
       * ends of the gesture go through here: `onUnarmedEnd` below, and the
       * armed `restore()` inside `arm()`.
       */
      const releaseClaim = () => {
        const tool = endToolGesture();
        if (tool && api) restoreTool(api, tool, styleMemory);
      };

      // Nothing else has been armed yet: no focus change, no tool change. A
      // release before movement is a genuine no-op click — but it is NOT
      // automatically a no-op *restore*. If the Cmd/Ctrl modifier came up
      // while this press was held, the override deliberately did not restore
      // and left the obligation here; dropping it on the floor (which this
      // used to do) permanently lost the user's armed tool.
      const onUnarmedEnd = () => {
        removeGestureEndListeners(onUnarmedEnd);
        window.removeEventListener("pointermove", onMove);
        cleanup.current = null;
        releaseClaim();
      };

      const onMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (dx * dx + dy * dy < MOVE_THRESHOLD_SQ) return;
        window.removeEventListener("pointermove", onMove);
        removeGestureEndListeners(onUnarmedEnd);
        arm();
      };

      window.addEventListener("pointermove", onMove);
      addGestureEndListeners(onUnarmedEnd);
      // A press can sit unarmed indefinitely waiting for movement, or never
      // move at all. If the triangle unmounts before that happens, these
      // listeners — and the gesture flag claimed above — must not outlive
      // the component either.
      cleanup.current = () => {
        window.removeEventListener("pointermove", onMove);
        removeGestureEndListeners(onUnarmedEnd);
        releaseClaim();
      };

      /** Movement confirmed a drag: arm the tool and start the real gesture. */
      function arm() {
        // `api` and `canvas` are narrowed non-null above, but TypeScript
        // doesn't carry that narrowing into this nested function declaration.
        if (!api || !canvas) return;

        // The `preventDefault()` above suppresses the focus transfer a
        // genuine canvas pointerdown would perform, so without this the
        // Excalidraw container never takes focus and the user's next
        // keystroke -- undo, Escape, Delete -- is silently dead on arrival,
        // even though the arrow this gesture draws really does land in the
        // undo stack. Measured: the arrow was present in
        // `history.undoStack` while Ctrl+Z did nothing, with
        // `document.activeElement` still on the glyph's own rail button.
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

        // What to hand back afterwards was captured at pointerdown by
        // `beginToolGesture`, and is deliberately NOT re-derived here: by now
        // the modifier may have come up and cleared the override's own record
        // of it. Only the arrow-type preference is snapshotted at arm time,
        // because this is the moment before the gesture overwrites it.
        const previousArrowType = state.currentItemArrowType;

        const setAppState = (appState: Record<string, unknown>) =>
          api.updateScene({ appState } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);

        /** Hand the tool, and the arrow-type preference, back. */
        const restore = () => {
          // Before releaseClaim, not after: restoreTool's style-memory reload
          // reads `currentItemArrowType` and would otherwise fold this
          // gesture's temporary "elbow" into the linear bucket as if the user
          // had chosen it. The already-drawn arrow keeps its own elbowed
          // geometry — this only puts the *next* arrow's default back.
          setAppState({ currentItemArrowType: previousArrowType });
          releaseClaim();
        };

        // Released before the dispatch: the frame lost its race, a rare but
        // still real case now that arming itself requires movement.
        // Cancelling matters — vendor would otherwise receive a pointerdown
        // with no matching pointerup and hang in drag state.
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

        cleanup.current = () => {
          removeGestureEndListeners(onEarlyUp);
          removeGestureEndListeners(onGestureUp);
          if (frame.current !== null) cancelAnimationFrame(frame.current);
          frame.current = null;
          restore();
        };
        addGestureEndListeners(onEarlyUp);

        // flushSync, not a bare call — see the hook docstring's fourth
        // point: arm() runs outside React's own event dispatch, so without
        // this the rAF below can fire before the state update actually
        // commits.
        // From here the tool has genuinely been taken, so the claim owes a
        // restore of its own — not just whatever the override may have handed
        // it. Below this line every end path has something to give back.
        markToolGestureArmed();

        flushSync(() => {
          setAppState({ currentItemArrowType: "elbow" });
          api.setActiveTool({ type: "arrow", locked: true } as SetToolArg);
        });

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
          // Registered AFTER the dispatch, and this ordering is
          // load-bearing. Window pointerup listeners fire in registration
          // order, and vendor registers its own inside the dispatch above.
          // Registering ours at pointerdown — one frame earlier — would put
          // it FIRST, so the tool would be switched back out from under
          // vendor before it finalized the arrow.
          addGestureEndListeners(onGestureUp);
        });
      }
    },
    [api, element, side, styleMemory],
  );
}
