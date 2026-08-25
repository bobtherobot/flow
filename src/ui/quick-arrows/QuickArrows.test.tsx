import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QuickArrows } from "./QuickArrows";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

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

beforeEach(() => vi.useFakeTimers());
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

  it("renders nothing when there is no api yet", () => {
    render(<QuickArrows api={null} />);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
  });
});
