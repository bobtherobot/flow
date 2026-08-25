import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QuickArrows } from "./QuickArrows";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import {
  beginToolGesture,
  endToolGesture,
  resetToolRestoreState,
} from "../toolbar/tool-restore";

type El = Record<string, unknown> & { id: string; type: string };

function makeApi(elements: El[]) {
  const appState = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: "selection" },
    selectedElementIds: {},
    selectedLinearElement: null,
  };
  const listeners: Array<() => void> = [];
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

function movePointer(x: number, y: number) {
  act(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, buttons: 0 }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetToolRestoreState();
});
afterEach(() => vi.useRealTimers());

describe("QuickArrows", () => {
  it("renders nothing until something is hovered", () => {
    render(<QuickArrows api={makeApi([rect()]).api} />);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
  });

  it("renders all four arrows for a hovered shape", () => {
    render(<QuickArrows api={makeApi([rect()]).api} />);
    movePointer(50, 25);
    for (const name of [
      "Quick arrow up",
      "Quick arrow right",
      "Quick arrow down",
      "Quick arrow left",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("positions each arrow outside its edge and points it outward", () => {
    render(<QuickArrows api={makeApi([rect()]).api} />);
    movePointer(50, 25);
    const up = screen.getByRole("button", { name: "Quick arrow up" });
    // Edge midpoint (50, 0), out by ARROW_GAP + ARROW_DEPTH / 2 = 20.
    expect(up.style.transform).toContain("translate(50px, -20px)");
    expect(up.style.transform).toContain("rotate(0deg)");

    const right = screen.getByRole("button", { name: "Quick arrow right" });
    expect(right.style.transform).toContain("rotate(90deg)");
  });

  it("omits the arrows a box is too small to carry", () => {
    render(<QuickArrows api={makeApi([rect({ width: 10 })]).api} />);
    movePointer(5, 25);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
    expect(screen.getByRole("button", { name: "Quick arrow right" })).toBeTruthy();
  });

  it("re-renders the glyph positions when the canvas scrolls under a still pointer", () => {
    // A scroll mutates no element, so `useHoverTarget` hands `setTarget` the
    // identical object reference and React bails out of the re-render — while
    // this component reads the live viewport at render time. Measured: the
    // glyph stayed painted at its old screen y as `scrollY` went 0 -> -60.
    // That is not cosmetic: `isInHaloRegion` tests against the LIVE viewport,
    // so a stranded glyph can sit outside the live hover region and moving
    // toward it dismisses the arrows — the exact failure the halo prevents.
    const { api, appState, fire } = makeApi([rect()]);
    render(<QuickArrows api={api} />);
    movePointer(50, 25);
    const up = () => screen.getByRole("button", { name: "Quick arrow up" });
    // North edge midpoint (50, 0), out by ARROW_GAP + ARROW_DEPTH / 2 = 20.
    expect(up().style.transform).toContain("translate(50px, -20px)");

    act(() => {
      appState.scrollY = -30;
      fire();
    });
    expect(up().style.transform).toContain("translate(50px, -50px)");
  });

  it("freezes the overlay while a gesture owns the tool, zoom included", () => {
    // The hole the re-render fix above opened. `visibleSides` is recomputed on
    // every render and is zoom-dependent (MIN_SIDE_PX), and vendor allows
    // wheel/pinch zoom during a live drag -- so an unconditional bump would
    // let a mid-drag zoom-out UNMOUNT the very glyph being dragged. That runs
    // `useQuickArrowDrag`'s armed unmount cleanup: the tool is handed back and
    // the gesture-end listeners are torn down while vendor is still drawing,
    // and `isToolGestureActive()` goes false so the grace timer blanks the
    // overlay too. The gesture guard therefore has to sit ABOVE the bump, not
    // only inside `evaluate`.
    const { api, appState, fire } = makeApi([rect()]);
    render(<QuickArrows api={api} />);
    movePointer(50, 25);
    const right = () => screen.queryByRole("button", { name: "Quick arrow right" });
    const frozen = right()!.style.transform;

    beginToolGesture("selection");
    act(() => {
      // 50 * 0.3 = 15, below MIN_SIDE_PX: the e/w glyphs would be dropped by
      // the very next render.
      appState.zoom = { value: 0.3 };
      appState.scrollY = -30;
      fire();
    });
    expect(right(), "the dragged glyph survives a mid-gesture zoom").not.toBeNull();
    expect(right()!.style.transform, "and does not move under the drag").toBe(frozen);

    // And the freeze is only for the gesture: the next onChange after it ends
    // repaints normally, so nothing is left stale.
    endToolGesture();
    act(() => void fire());
    expect(right(), "the e/w glyphs go once the shape really is too short").toBeNull();
    expect(screen.getByRole("button", { name: "Quick arrow up" })).toBeTruthy();
  });

  it("renders nothing when there is no api yet", () => {
    render(<QuickArrows api={null} />);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
  });
});
