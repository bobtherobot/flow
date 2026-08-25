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
  return {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: () => () => {},
  } as unknown as ExcalidrawAPI;
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
    render(<QuickArrows api={makeApi([rect()])} />);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
  });

  it("renders all four arrows for a hovered shape", () => {
    render(<QuickArrows api={makeApi([rect()])} />);
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
    render(<QuickArrows api={makeApi([rect()])} />);
    movePointer(50, 25);
    const up = screen.getByRole("button", { name: "Quick arrow up" });
    // Edge midpoint (50, 0), out by ARROW_GAP + ARROW_DEPTH / 2 = 20.
    expect(up.style.transform).toContain("translate(50px, -20px)");
    expect(up.style.transform).toContain("rotate(0deg)");

    const right = screen.getByRole("button", { name: "Quick arrow right" });
    expect(right.style.transform).toContain("rotate(90deg)");
  });

  it("omits the arrows a box is too small to carry", () => {
    render(<QuickArrows api={makeApi([rect({ width: 10 })])} />);
    movePointer(5, 25);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
    expect(screen.getByRole("button", { name: "Quick arrow right" })).toBeTruthy();
  });

  it("renders nothing when there is no api yet", () => {
    render(<QuickArrows api={null} />);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
  });
});
