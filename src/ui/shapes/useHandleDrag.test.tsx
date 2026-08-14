import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// The hook imports these three from the Excalidraw package; loading the real
// package in jsdom runs module-level UI code that throws (same reason
// useSelectionStyle.test.tsx and ShapeHandles.test.tsx stub it). Stub
// `viewportCoordsToSceneCoords` with the exact formula the vendor package
// uses (packages/common/src/utils.ts) so position/clamp assertions stay
// meaningful, and `newElementWith`/`CaptureUpdateAction` the same way
// useSelectionStyle.test.tsx does.
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY", EVENTUALLY: "EVENTUALLY" },
  newElementWith: (el: Record<string, unknown>, updates: Record<string, unknown>) => ({
    ...el,
    ...updates,
    version: ((el.version as number) ?? 0) + 1,
  }),
  viewportCoordsToSceneCoords: (
    { clientX, clientY }: { clientX: number; clientY: number },
    appState: {
      zoom: { value: number };
      offsetLeft: number;
      offsetTop: number;
      scrollX: number;
      scrollY: number;
    },
  ) => ({
    x: (clientX - appState.offsetLeft) / appState.zoom.value - appState.scrollX,
    y: (clientY - appState.offsetTop) / appState.zoom.value - appState.scrollY,
  }),
}));

import { useHandleDrag } from "./useHandleDrag";
import { resetDeferred } from "../../lib/deferred-commit";
import { SHAPES_REGISTRY } from "./registry";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string; version: number };

/** jsdom has no PointerEvent, but MouseEvent carries clientX/Y and dispatches to
 *  the window "pointermove"/"pointerup" listeners `useDrag` registers — same
 *  helper `useDrag.test.tsx` uses. */
function fireWindow(type: string, clientX: number, clientY: number): void {
  window.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

function pointerDown(clientX: number, clientY: number): React.PointerEvent {
  return {
    button: 0,
    clientX,
    clientY,
    preventDefault() {},
    target: document.body,
  } as unknown as React.PointerEvent;
}

interface AppStateOverrides {
  zoom?: { value: number };
  offsetLeft?: number;
  offsetTop?: number;
  scrollX?: number;
  scrollY?: number;
}

function makeApi(element: El, appStateOverrides: AppStateOverrides = {}) {
  let elements: El[] = [element];
  const appState = {
    selectedElementIds: { [element.id]: true },
    zoom: { value: 1 },
    offsetLeft: 0,
    offsetTop: 0,
    scrollX: 0,
    scrollY: 0,
    ...appStateOverrides,
  };
  const updateScene = vi.fn(
    (args: { elements?: El[]; captureUpdate: string; commitDeferredChanges?: boolean }) => {
      if (args.elements) elements = args.elements;
    },
  );
  const api = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: () => () => {},
    updateScene,
  };
  return api as unknown as ExcalidrawAPI & { updateScene: typeof updateScene };
}

// 100x50 box, skew 0.25 -> handle.at gives local (25, 0), matching
// ShapeHandles.test.tsx's fixture.
const parallelogram = (over: Partial<El> = {}): El => ({
  id: "a",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  version: 1,
  customData: { flowShape: { kind: "parallelogram", p: { skew: 0.25 } } },
  ...over,
});

// The real handle def from the registry, not a hand-copied stand-in — keeps
// this test honest against whatever clamp the registry actually ships.
const skewHandle = SHAPES_REGISTRY.parallelogram.handles[0];

function flowParams(api: ExcalidrawAPI, id: string): Record<string, number> {
  const el = api.getSceneElements().find((e) => e.id === id) as unknown as El;
  return (el.customData as { flowShape: { p: Record<string, number> } }).flowShape.p;
}

describe("useHandleDrag", () => {
  // deferred-commit.ts holds module-level state (only one gesture can be in
  // flight at a time in the real app) — start every test unmarked.
  beforeEach(() => {
    resetDeferred();
  });

  it("drags from the handle's current position to a known viewport point and produces the expected parameter", () => {
    const el = parallelogram();
    const api = makeApi(el);
    const { result } = renderHook(() => useHandleDrag({ api, element: el, handle: skewHandle }));

    act(() => result.current(pointerDown(25, 0)));
    act(() => fireWindow("pointermove", 60, 0));
    act(() => fireWindow("pointerup", 60, 0));

    expect(flowParams(api, "a").skew).toBeCloseTo(0.6);
  });

  it("clamps the parameter at both ends", () => {
    const el = parallelogram();
    const api = makeApi(el);
    const { result } = renderHook(() => useHandleDrag({ api, element: el, handle: skewHandle }));

    act(() => result.current(pointerDown(25, 0)));
    act(() => fireWindow("pointermove", 1000, 0));
    act(() => fireWindow("pointerup", 1000, 0));
    expect(flowParams(api, "a").skew).toBeCloseTo(0.9);

    act(() => result.current(pointerDown(90, 0)));
    act(() => fireWindow("pointermove", -1000, 0));
    act(() => fireWindow("pointerup", -1000, 0));
    expect(flowParams(api, "a").skew).toBe(0);
  });

  it("maps a drag on a rotated element as if it were unrotated", () => {
    // angle = PI/2 about the box centre (50, 25). A drag targeting local
    // (60, 0) — which should produce skew 0.6 — sits, once rotated, at scene
    // point (75, 35) (dx=10,dy=-25 rotated 90 degrees about the centre, plus
    // the centre back). Feeding (75, 35) as the viewport point (zoom 1, no
    // scroll/offset) should map back to local (60, 0) via the hook's
    // un-rotation and produce the same 0.6 a non-rotated drag to (60, 0)
    // would.
    const el = parallelogram({ angle: Math.PI / 2 });
    const api = makeApi(el);
    const { result } = renderHook(() => useHandleDrag({ api, element: el, handle: skewHandle }));

    // Start at the handle's actual (rotated) current position so the
    // pointer-down itself doesn't matter to the assertion, only the move does.
    act(() => result.current(pointerDown(0, 0)));
    act(() => fireWindow("pointermove", 75, 35));
    act(() => fireWindow("pointerup", 75, 35));

    expect(flowParams(api, "a").skew).toBeCloseTo(0.6);
  });

  it("emits transient (EVENTUALLY) updates during the move and exactly one committing (IMMEDIATELY) update on pointer-up", () => {
    const el = parallelogram();
    const api = makeApi(el);
    const { result } = renderHook(() => useHandleDrag({ api, element: el, handle: skewHandle }));

    act(() => result.current(pointerDown(25, 0)));
    act(() => fireWindow("pointermove", 40, 0));
    act(() => fireWindow("pointermove", 55, 0));
    act(() => fireWindow("pointermove", 70, 0));
    act(() => fireWindow("pointerup", 70, 0));

    const calls = api.updateScene.mock.calls.map(([args]: [{ captureUpdate: string; commitDeferredChanges?: boolean }]) => args);
    const transient = calls.filter((c) => c.captureUpdate === "EVENTUALLY");
    const committed = calls.filter((c) => c.captureUpdate === "IMMEDIATELY");

    expect(transient.length).toBeGreaterThan(0);
    expect(committed).toHaveLength(1);
    expect(committed[0].commitDeferredChanges).toBe(true);
    expect(flowParams(api, "a").skew).toBeCloseTo(0.7);
  });

  it("does not write anything for a click that never crosses the drag threshold", () => {
    const el = parallelogram();
    const api = makeApi(el);
    const { result } = renderHook(() => useHandleDrag({ api, element: el, handle: skewHandle }));

    act(() => result.current(pointerDown(25, 0)));
    act(() => fireWindow("pointerup", 25, 0));

    expect(api.updateScene).not.toHaveBeenCalled();
  });
});
