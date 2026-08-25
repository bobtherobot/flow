import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuickArrowDrag } from "./useQuickArrowDrag";
import {
  deferRestoreToGesture,
  getSuspendedTool,
  isToolGestureActive,
  resetToolRestoreState,
  setSuspendedTool,
} from "../toolbar/tool-restore";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

const rect = (): El => ({
  id: "r",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
});

function makeApi(activeTool = "selection") {
  const appState = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: activeTool },
    selectedElementIds: {},
    selectedGroupIds: {},
    editingGroupId: null,
    currentItemArrowType: "sharp",
  };
  return {
    getAppState: () => appState,
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

/**
 * Stand in for the vendor canvas the hook dispatches onto — including the one
 * behaviour that constrains the hook's design: vendor registers its own window
 * pointerup listener from INSIDE its pointerdown handler. `order` records who
 * ran first on pointerup.
 */
function installCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "interactive";
  const seen: PointerEvent[] = [];
  const order: string[] = [];
  canvas.addEventListener("pointerdown", (e) => {
    seen.push(e as PointerEvent);
    window.addEventListener("pointerup", () => order.push("vendor"), { once: true });
  });
  document.body.appendChild(canvas);
  return { canvas, seen, order };
}

/** A minimal stand-in for React's synthetic pointer event. */
function pointerDownEvent() {
  return {
    pointerId: 7,
    pointerType: "mouse",
    clientX: 130,
    clientY: 25,
    button: 0,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

/**
 * A `pointermove` from the press origin above, offset by (dx, dy). The hook
 * arms nothing until a move clears its squared-distance threshold (4, same
 * default as `useDrag.ts`) — the default offset here (10, 0) clears it with
 * plenty of margin.
 */
function movePointer(dx = 10, dy = 0) {
  act(() =>
    void window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 130 + dx, clientY: 25 + dy, pointerId: 7 }),
    ),
  );
}

/** Run the queued animation frame callbacks. */
function flushFrame() {
  act(() => void vi.advanceTimersByTime(20));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetToolRestoreState();
  // jsdom has no rAF timing; drive it off the fake timer clock instead.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout),
  );
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useQuickArrowDrag", () => {
  it("arms the elbow arrow tool once the pointer moves past the threshold", () => {
    const api = makeApi();
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    expect(api.setActiveTool, "not armed until the pointer moves").not.toHaveBeenCalled();

    movePointer();
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "elbow" },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow", locked: true });
  });

  it("does not arm on a movement that stays inside the threshold", () => {
    // A 1px jitter is not a drag. Nothing may be focused, tool-changed, or
    // dispatched until the pointer clears the gate -- the gesture flag is
    // the one exception (see the hook's docstring on why it is claimed at
    // pointerdown rather than waiting for arm()), so this checks the flag
    // clears again on release, not that it was never set.
    const api = makeApi();
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer(1, 0);
    expect(api.setActiveTool, "not armed by a sub-threshold move").not.toHaveBeenCalled();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(isToolGestureActive()).toBe(false);
  });

  it("dispatches the pointerdown on the canvas one frame after arming, at the edge midpoint", () => {
    const api = makeApi();
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    expect(seen, "not dispatched in the same tick as arming").toHaveLength(0);

    flushFrame();
    expect(seen).toHaveLength(1);
    // East edge midpoint of a 100x50 box at the origin, identity viewport --
    // the dispatch origin is the shape's edge, not wherever the pointer
    // wandered to while arming the gesture.
    expect(seen[0].clientX).toBe(100);
    expect(seen[0].clientY).toBe(25);
    expect(seen[0].pointerId).toBe(7);
    expect(seen[0].bubbles).toBe(true);
  });

  it("cancels the dispatch if the pointer is released inside the frame after arming", () => {
    // Rare now that arming itself requires movement, but still possible: the
    // pointer clears the threshold and is released again before the
    // animation frame elapses.
    const api = makeApi();
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    flushFrame();
    expect(seen, "vendor must not be left mid-drag with no matching pointerup").toHaveLength(0);
  });

  it("a click with no movement dispatches nothing, arms nothing, and leaves no gesture flag", () => {
    // The bug this test exists to catch: an earlier version decided
    // click-vs-drag by racing pointerup against the animation frame, and
    // that race was lost almost every real click, quietly minting a
    // degenerate arrow bound only at its start. There is no race now --
    // without movement, arm() never runs at all.
    const api = makeApi("rectangle");
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));

    expect(seen).toHaveLength(0);
    expect(api.setActiveTool).not.toHaveBeenCalled();
    expect(isToolGestureActive()).toBe(false);
  });

  it("restores the previous tool on pointer up", () => {
    const api = makeApi("rectangle");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("leaves selection behind when the Cmd/Ctrl modifier is still held at the end", () => {
    // Quadrant (T, gesture) with the modifier STILL DOWN. Measured bug: the
    // gesture used to re-arm the suspended tool here, which defeated the
    // override for the rest of the hold -- the quick arrows stopped appearing
    // and a canvas drag drew an ellipse instead of marquee-selecting. The
    // override still owns "ellipse"; the gesture only owes the effective tool.
    setSuspendedTool("ellipse");
    const api = makeApi("selection");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "selection", locked: true });
    expect(getSuspendedTool(), "the override keeps its claim").toBe("ellipse");
  });

  it("restores the suspended tool when the modifier was released before the first move", () => {
    // Quadrant (T, gesture) with the modifier released DURING the press, and
    // released before the drag was even confirmed. `deferRestoreToGesture` is
    // what `useToolOverride.restore` calls on that keyup; the whole point of
    // capturing the tool at pointerdown is that this still knows what to hand
    // back afterwards. Measured bug: it used to hand back the override's own
    // "selection".
    setSuspendedTool("ellipse");
    const api = makeApi("selection");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    deferRestoreToGesture(); // the Cmd/Ctrl keyup, before any movement
    movePointer();
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "ellipse", locked: true });
    expect(getSuspendedTool(), "the obligation is discharged, not left open").toBeNull();
  });

  it("hands the suspended tool back after a Cmd-held click that never became a drag", () => {
    // The Critical. Nothing arms, so the gesture has nothing of its OWN to
    // restore -- but the override released mid-press and deliberately did not
    // restore either, precisely because this gesture had claimed the tool. If
    // this end path does nothing, the user's armed tool is gone until they
    // re-pick it: measured as `activeTool` stuck on "selection" with the
    // Ellipse tool simply lost.
    setSuspendedTool("ellipse");
    const api = makeApi("selection");
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    deferRestoreToGesture(); // the Cmd/Ctrl keyup, while the button is held
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));

    expect(seen, "a click still draws nothing").toHaveLength(0);
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "ellipse", locked: true });
    expect(isToolGestureActive()).toBe(false);
    expect(getSuspendedTool()).toBeNull();
  });

  it("restores the tool AFTER vendor finalizes, not before", () => {
    // Window pointerup listeners fire in registration order. If the hook
    // registered its restore at pointerdown it would run a frame ahead of
    // vendor's, switching the tool out from under the in-flight drag.
    const api = makeApi("rectangle");
    const { order } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    (api.setActiveTool as ReturnType<typeof vi.fn>).mockImplementation(
      (t: { type: string }) => {
        if (t.type === "rectangle") order.push("restore");
      },
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(order).toEqual(["vendor", "restore"]);
  });

  it("puts the previous arrow type back before restoreTool's style-memory reload reads it", () => {
    // `restore()` deliberately writes currentItemArrowType back BEFORE calling
    // restoreTool, because restoreTool's own style-memory reload re-reads
    // appState -- get the order wrong and the gesture's temporary "elbow"
    // gets folded into the linear bucket as if the user had chosen it. To see
    // that ordering at all, the fake `updateScene` has to actually apply its
    // appState patch (a bare vi.fn() leaves getAppState() and the reload
    // blind to it), and a styleMemory mock has to be supplied so restoreTool's
    // reloadCategory branch is exercised in the first place.
    const api = makeApi("rectangle");
    const state = api.getAppState() as unknown as Record<string, unknown>;
    (api.updateScene as ReturnType<typeof vi.fn>).mockImplementation(
      (arg: { appState?: Record<string, unknown> }) => {
        Object.assign(state, arg.appState ?? {});
      },
    );
    const reloadCategory = vi.fn();
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({
        api,
        element: rect() as never,
        side: "e",
        styleMemory: { reloadCategory },
      }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));

    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "sharp" },
    });
    // The reload must see the RESTORED arrow type ("sharp"), not the
    // gesture's temporary "elbow" -- proof the write lands before the reload
    // reads it, not after.
    expect(reloadCategory).toHaveBeenCalledWith("shape", "rectangle", "sharp");
  });

  it("does not strand the tool-gesture flag when pointercancel arrives instead of pointerup", () => {
    // Neither pointerup nor pointercancel is guaranteed to arrive on a real
    // gesture end, but when pointercancel DOES fire (e.g. a right-click
    // opening the context menu mid-drag) it must be treated exactly like a
    // pointerup. Otherwise `gestureActive` stays true forever, which per
    // useToolOverride.ts permanently disables the Cmd/Ctrl override's restore.
    const api = makeApi("rectangle");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointercancel")));
    expect(isToolGestureActive()).toBe(false);
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("does not strand the tool-gesture flag when the window loses focus mid-drag", () => {
    // Alt-tab, or the OS bringing another application forward, can end a
    // drag with neither a pointerup nor a pointercancel ever firing. A window
    // blur is the only signal left, and without listening for it the arrow
    // tool stays armed and currentItemArrowType stays "elbow" until reload.
    const api = makeApi("rectangle");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    movePointer();
    flushFrame();
    act(() => void window.dispatchEvent(new Event("blur")));
    expect(isToolGestureActive()).toBe(false);
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("does nothing when there is no api", () => {
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api: null, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    expect(seen).toHaveLength(0);
  });
});
