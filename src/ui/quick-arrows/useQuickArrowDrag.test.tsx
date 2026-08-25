import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuickArrowDrag } from "./useQuickArrowDrag";
import { resetToolRestoreState, setSuspendedTool } from "../toolbar/tool-restore";
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
  it("arms the elbow arrow tool on pointer down", () => {
    const api = makeApi();
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "elbow" },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow", locked: true });
  });

  it("dispatches the pointerdown on the canvas one frame later, at the edge midpoint", () => {
    const api = makeApi();
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    expect(seen, "not dispatched in the same tick").toHaveLength(0);

    flushFrame();
    expect(seen).toHaveLength(1);
    // East edge midpoint of a 100x50 box at the origin, identity viewport.
    expect(seen[0].clientX).toBe(100);
    expect(seen[0].clientY).toBe(25);
    expect(seen[0].pointerId).toBe(7);
    expect(seen[0].bubbles).toBe(true);
  });

  it("cancels the dispatch if the pointer is released before the frame", () => {
    const api = makeApi();
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    flushFrame();
    expect(seen, "a click must not leave vendor mid-drag").toHaveLength(0);
  });

  it("restores the previous tool on pointer up", () => {
    const api = makeApi("rectangle");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("restores the tool the Cmd/Ctrl override was suspending, not selection", () => {
    // The override is engaged: the active tool reads "selection", but the tool
    // the user actually wants back is the one it suspended.
    setSuspendedTool("ellipse");
    const api = makeApi("selection");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "ellipse", locked: true });
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
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(order).toEqual(["vendor", "restore"]);
  });

  it("puts the previous arrow type back so the gesture leaves no preference behind", () => {
    const api = makeApi();
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "sharp" },
    });
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
