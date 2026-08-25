import { useEffect, useReducer, useRef, useState } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SceneElement } from "../shapes/useShapeSelection";
import { isBindableForQuickArrows, isFrameLikeForQuickArrows } from "./bindable";
import { isInHaloRegion, type Viewport } from "./quick-arrow-geometry";
import { isToolGestureActive } from "../toolbar/tool-restore";

/** How long the arrows survive the pointer leaving their region. Without it,
 *  the boundary flickers as the pointer wobbles across it. */
const HOVER_GRACE_MS = 120;

interface HoverAppState {
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
  activeTool: { type: string };
  selectedElementIds: Record<string, boolean>;
  selectedLinearElement?: { isEditing?: boolean } | null;
}

function viewportOf(s: HoverAppState): Viewport {
  return {
    zoom: s.zoom.value,
    scrollX: s.scrollX,
    scrollY: s.scrollY,
    offsetLeft: s.offsetLeft,
    offsetTop: s.offsetTop,
  };
}

/**
 * The element whose quick arrows should be on screen right now, or null.
 *
 * Hover-driven, not selection-driven: point at any bindable shape and its
 * arrows appear whether or not it is selected.
 *
 * Two inputs, not one. Pointer position is the obvious one. The second is
 * `api.onChange`, and it is not optional: holding Cmd/Ctrl engages flow's
 * temporary-selection override by calling `setActiveTool({type: "selection"})`
 * (`useToolOverride.ts`), which must reveal the arrows **with the pointer
 * perfectly still**. A hook driven by pointer events alone would leave the
 * user jiggling the mouse to make them show up.
 *
 * Subscribes to `onChange` directly, so — like `useShapeSelection` — its
 * caller must be a sibling of `<Excalidraw>`, never inside `App`. A state bump
 * from `onChange` that re-renders `<Excalidraw>` makes `componentDidUpdate`
 * re-fire `onChange`, looping forever.
 *
 * The `onChange` subscription bumps a render counter **unconditionally**, the
 * same `useReducer((n) => n + 1, 0)` this hook's model `useShapeSelection`
 * uses, and that is not redundant with the target state. The overlay reads the
 * live viewport (`scrollX`/`scrollY`/`zoom`) at render time, but a scroll
 * mutates no element: `setTarget` is handed the identical object reference,
 * React bails out of the re-render, and the glyphs stay painted at their old
 * screen positions while `isInHaloRegion` goes on testing against the new
 * viewport. A glyph stranded outside the live hover region dismisses the
 * arrows as the pointer travels toward it — precisely the failure the halo
 * exists to prevent. Measured: hover a shape, scroll 60px, and the glyph's `y`
 * stayed put while `scrollY` went 0 -> -60.
 */
export function useHoverTarget(api: ExcalidrawAPI | null): SceneElement | null {
  const [target, setTarget] = useState<SceneElement | null>(null);
  // Re-render on every appState change, whether or not the target moved — see
  // the docstring's third paragraph.
  const [, bump] = useReducer((n: number) => n + 1, 0);
  // Last known pointer position, so an appState change can re-evaluate hover
  // without waiting for the pointer to move. `buttons` rides along: any held
  // button means some other gesture owns the canvas.
  const pointer = useRef<{ x: number; y: number; buttons: number } | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!api) {
      // Clear, don't just bail. Without this the hook keeps handing back the
      // last element it resolved even though there is no live API to resolve
      // against. `useShapeSelection` has no equivalent gap because it derives
      // its result synchronously on every render.
      setTarget(null);
      return;
    }

    const clearGrace = () => {
      if (graceTimer.current !== null) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };

    const evaluate = () => {
      // A quick-arrow drag owns the tool right now (Task 5's
      // `isToolGestureActive`, tool-restore.ts). Recomputing would null the
      // target out -- a drag holds a button down, and a held button hides
      // the arrows -- unmounting the very triangle being dragged and tearing
      // down the gesture's pointerup listener before it can restore the tool.
      if (isToolGestureActive()) return;
      const p = pointer.current;
      if (!p) return;
      const next = p.buttons !== 0 ? null : resolve(api, p.x, p.y);
      if (next) {
        clearGrace();
        setTarget(next);
        return;
      }
      // Losing the target is delayed; gaining one is immediate.
      if (graceTimer.current === null) {
        graceTimer.current = setTimeout(() => {
          graceTimer.current = null;
          setTarget(null);
        }, HOVER_GRACE_MS);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, buttons: e.buttons };
      evaluate();
    };

    window.addEventListener("pointermove", onPointerMove);
    const unsubscribe = api.onChange(() => {
      // Bump first, and unconditionally: `evaluate` re-renders only when the
      // hovered element itself changes, and pan/zoom changes neither.
      bump();
      evaluate();
    });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      unsubscribe();
      clearGrace();
    };
  }, [api]);

  return target;
}

/** The topmost bindable element whose halo region contains the pointer. */
function resolve(api: ExcalidrawAPI, x: number, y: number): SceneElement | null {
  const state = api.getAppState() as unknown as HoverAppState;
  if (state.activeTool.type !== "selection") return null;
  if (state.selectedLinearElement?.isEditing) return null;
  if (Object.keys(state.selectedElementIds ?? {}).length > 1) return null;

  const v = viewportOf(state);
  const elements = api.getSceneElements();
  // Last in the array paints on top, so walk backwards to find the topmost —
  // with exactly one exception, and it is not a small one. Excalidraw stores a
  // frame AFTER its own children but renders it BEHIND them, so a plain
  // backwards walk hands back the FRAME for every shape sitting inside one:
  // the glyphs appear at the frame's edge midpoints and the arrow binds to the
  // frame, leaving the child's own arrows unreachable for as long as it is in
  // a frame. So a frame is only ever a fallback: keep the topmost one seen and
  // carry on looking. Any non-frame bindable under the pointer wins, and a
  // frame still gets its own arrows when nothing else is there.
  let frame: SceneElement | null = null;
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!isBindableForQuickArrows(el)) continue;
    if (!isInHaloRegion(el, v, x, y)) continue;
    if (isFrameLikeForQuickArrows(el)) {
      if (!frame) frame = el;
      continue;
    }
    return el;
  }
  return frame;
}
