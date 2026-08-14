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
import { resetDeferred, consumeDeferred } from "../../lib/deferred-commit";
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

// 200x100 box, head 0.4 / stem 0.4 -> head handle.at gives local (120, 0),
// stem handle.at gives local (0, 30). Matches fatArrow.test.ts's fixture box.
const fatArrow = (over: Partial<El> = {}): El => ({
  id: "b",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  angle: 0,
  version: 1,
  customData: { flowShape: { kind: "fatArrow", p: { head: 0.4, stem: 0.4 } } },
  ...over,
});

const headHandle = SHAPES_REGISTRY.fatArrow.handles[0];
const stemHandle = SHAPES_REGISTRY.fatArrow.handles[1];

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

  // Grab offset: pressing a few px off the dot's exact centre (still within
  // the 10px dot, well under useDrag's movement threshold so it counts as
  // "the same press") must not snap the shape to the pointer -- the offset
  // between the press point and the dot's true position should be preserved
  // for the rest of the gesture, the same way dragging a real UI handle
  // never "grab-teleports" the dragged thing to the cursor.
  it("preserves the offset between where the pointer went down and the dot's true position", () => {
    const el = parallelogram();
    const api = makeApi(el);
    const { result } = renderHook(() => useHandleDrag({ api, element: el, handle: skewHandle }));

    // The dot's true position for skew: 0.25 on a 100x50 box is local (25, 0)
    // (matches the fixture comment above). Press 3px off-centre instead of
    // dead-on.
    act(() => result.current(pointerDown(28, 3)));
    // Move the same delta (+35, 0) a dead-centre press would use to land on
    // skew 0.6 (see the very first test in this file) -- the offset grab
    // should reproduce that same result, not skew toward the pointer's own
    // absolute position (which would be skew: (28+35)/100 = 0.63).
    act(() => fireWindow("pointermove", 63, 3));
    act(() => fireWindow("pointerup", 63, 3));

    expect(flowParams(api, "a").skew).toBeCloseTo(0.6);
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

  it("releases the deferred-commit flag if the gesture is interrupted before its commit write", () => {
    // Models Escape deselecting the element mid-drag: `useShapeSelection`
    // drops the selection immediately, unmounting `ShapeHandleDot` (and this
    // hook with it) before pointerup ever fires. `useDrag`'s own unmount
    // cleanup only strips its window listeners -- it has no synthetic onEnd
    // to run the commit -- so without this hook's own unmount release, the
    // deferred-commit bit `markDeferred()` set during the move would stay
    // true forever, and the next unrelated scene write would wrongly inherit
    // its uncommitted-element-filter bypass.
    const el = parallelogram();
    const api = makeApi(el);
    const { result, unmount } = renderHook(() =>
      useHandleDrag({ api, element: el, handle: skewHandle }),
    );

    act(() => result.current(pointerDown(25, 0)));
    act(() => fireWindow("pointermove", 60, 0));

    // Sanity check: the move really did emit a transient write (this test is
    // only meaningful if the flag is actually set going into the unmount) --
    // read without consuming, since consumeDeferred() resets on read and the
    // unmount cleanup below is what's actually under test.
    const beforeUnmount = api.updateScene.mock.calls.map(
      ([args]: [{ captureUpdate: string }]) => args,
    );
    expect(beforeUnmount.some((c) => c.captureUpdate === "EVENTUALLY")).toBe(true);

    unmount();

    // The unmount cleanup released the flag itself -- consumeDeferred() (which
    // resets on read) now reports nothing pending.
    expect(consumeDeferred()).toBe(false);
    // No IMMEDIATELY write either -- the gesture was interrupted, not
    // completed, so it never should have committed.
    const afterUnmount = api.updateScene.mock.calls.map(
      ([args]: [{ captureUpdate: string }]) => args,
    );
    expect(afterUnmount.some((c) => c.captureUpdate === "IMMEDIATELY")).toBe(false);
  });

  // The fat arrow is the first two-handle shape, which is what makes this
  // test possible: dragging one handle must merge over the params object
  // (`{ ...p, ...handle.from(...) }` in useHandleDrag's applyDrag) rather
  // than replace it, or the handle not being dragged would silently reset to
  // undefined/its default the moment the other one moves. No prior shape had
  // two handles to prove this with — deferred from Task 10 to here.
  describe("merge preservation (fat arrow's two handles)", () => {
    it("dragging the head handle leaves stem untouched", () => {
      const el = fatArrow();
      const api = makeApi(el);
      const { result } = renderHook(() =>
        useHandleDrag({ api, element: el, handle: headHandle }),
      );

      act(() => result.current(pointerDown(120, 0)));
      act(() => fireWindow("pointermove", 60, 0));
      act(() => fireWindow("pointerup", 60, 0));

      const p = flowParams(api, "b");
      expect(p.head).toBeCloseTo(0.7);
      expect(p.stem).toBe(0.4);
    });

    it("dragging the stem handle leaves head untouched", () => {
      const el = fatArrow();
      const api = makeApi(el);
      const { result } = renderHook(() =>
        useHandleDrag({ api, element: el, handle: stemHandle }),
      );

      act(() => result.current(pointerDown(0, 30)));
      act(() => fireWindow("pointermove", 0, 20));
      act(() => fireWindow("pointerup", 0, 20));

      const p = flowParams(api, "b");
      expect(p.stem).toBeCloseTo(0.6);
      expect(p.head).toBe(0.4);
    });
  });
});
