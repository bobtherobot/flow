import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHoverTarget } from "./useHoverTarget";
import { beginToolGesture, endToolGesture, resetToolRestoreState } from "../toolbar/tool-restore";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

interface ApiOverrides {
  activeTool?: { type: string };
  selectedElementIds?: Record<string, boolean>;
  selectedLinearElement?: { isEditing: boolean } | null;
}

function makeApi(elements: El[], over: ApiOverrides = {}) {
  const listeners: Array<() => void> = [];
  const appState = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: "selection" },
    selectedElementIds: {},
    selectedLinearElement: null,
    ...over,
  };
  const api = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: (cb: () => void) => {
      listeners.push(cb);
      return () => {};
    },
  } as unknown as ExcalidrawAPI;
  return { api, appState, fire: () => listeners.forEach((cb) => cb()) };
}

const rect = (over: Partial<El> = {}): El => ({
  id: "r",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
  ...over,
});

/** Dispatch a window pointermove, the only input this hook has. */
function movePointer(x: number, y: number, buttons = 0) {
  act(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, buttons }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetToolRestoreState();
});
afterEach(() => vi.useRealTimers());

describe("useHoverTarget", () => {
  it("returns the element under the pointer", () => {
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current?.id).toBe("r");
  });

  it("keeps the element while the pointer is out in the halo", () => {
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, -20);
    expect(result.current?.id).toBe("r");
  });

  it("drops the element only after the grace period, not merely on the next tick", () => {
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    movePointer(500, 500);
    // Two advances, not one. A single "advance past the window" assertion
    // passes for ANY delay from 0 upward, because timers never fire
    // synchronously — so it would not notice the grace period being lost.
    act(() => void vi.advanceTimersByTime(100)); // still inside the 120ms window
    expect(result.current?.id, "still held before the window closes").toBe("r");
    act(() => void vi.advanceTimersByTime(30)); // 130ms total, past it
    expect(result.current).toBeNull();
  });

  it("returns the topmost element when two overlap", () => {
    const { api } = makeApi([rect({ id: "under" }), rect({ id: "over" })]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current?.id).toBe("over");
  });

  it("returns nothing while a drawing tool is armed", () => {
    const { api } = makeApi([rect()], { activeTool: { type: "rectangle" } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("re-evaluates on an appState change, without the pointer moving", () => {
    // This is the Cmd/Ctrl override case: holding the modifier switches the
    // active tool to selection while the pointer is perfectly still, and the
    // arrows must appear anyway.
    const { api, appState, fire } = makeApi([rect()], { activeTool: { type: "rectangle" } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
    act(() => {
      appState.activeTool = { type: "selection" };
      fire();
    });
    expect(result.current?.id).toBe("r");
  });

  it("returns nothing for a non-bindable element", () => {
    const { api } = makeApi([rect({ type: "freedraw" })]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("returns nothing while more than one element is selected", () => {
    const { api } = makeApi([rect()], { selectedElementIds: { a: true, b: true } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("returns nothing while a linear element is being edited", () => {
    const { api } = makeApi([rect()], { selectedLinearElement: { isEditing: true } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("returns nothing while a mouse button is held", () => {
    // Dragging the shape itself keeps the selection tool active and the
    // pointer over the element; the arrows should get out of the way.
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25, 1);
    expect(result.current).toBeNull();
  });

  it("holds an already-resolved target while a quick-arrow gesture owns the tool", () => {
    // A quick-arrow drag holds a button down for its whole duration, which
    // would otherwise read as "some other gesture owns the canvas" and null
    // the target out from under the very triangle being dragged.
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current?.id).toBe("r");

    beginToolGesture("selection");
    movePointer(50, 25, 1);
    expect(result.current?.id, "held during the gesture despite buttons!=0").toBe("r");
    act(() => void vi.advanceTimersByTime(200)); // well past the grace window
    expect(result.current?.id, "still held after the grace window elapses").toBe("r");

    endToolGesture();
    movePointer(50, 25, 1); // button still physically held, gesture just ended
    act(() => void vi.advanceTimersByTime(130)); // past the grace window
    expect(result.current, "clears as before once the gesture releases its hold").toBeNull();
  });

  it("returns nothing, and drops any stale target, once the api goes away", () => {
    const { api } = makeApi([rect()]);
    const { result, rerender } = renderHook(
      ({ a }: { a: ExcalidrawAPI | null }) => useHoverTarget(a),
      { initialProps: { a: api as ExcalidrawAPI | null } },
    );
    movePointer(50, 25);
    expect(result.current?.id).toBe("r");
    rerender({ a: null });
    expect(result.current).toBeNull();
  });
});
