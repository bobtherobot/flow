import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Loading the real @excalidraw/excalidraw package in jsdom runs module-level
// UI code that throws (same reason useSelectionStyle.test.tsx stubs it).
// Stub sceneCoordsToViewportCoords with the exact formula the vendor package
// uses (packages/common/src/utils.ts) so position assertions stay meaningful.
vi.mock("@excalidraw/excalidraw", () => ({
  sceneCoordsToViewportCoords: (
    { sceneX, sceneY }: { sceneX: number; sceneY: number },
    appState: {
      zoom: { value: number };
      offsetLeft: number;
      offsetTop: number;
      scrollX: number;
      scrollY: number;
    },
  ) => ({
    x: (sceneX + appState.scrollX) * appState.zoom.value + appState.offsetLeft,
    y: (sceneY + appState.scrollY) * appState.zoom.value + appState.offsetTop,
  }),
}));

import { ShapeHandles } from "./ShapeHandles";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

interface AppStateOverrides {
  zoom?: { value: number };
  offsetLeft?: number;
  offsetTop?: number;
  scrollX?: number;
  scrollY?: number;
}

function makeApi(element: El, appStateOverrides: AppStateOverrides = {}) {
  const appState = {
    selectedElementIds: { [element.id]: true },
    zoom: { value: 1 },
    offsetLeft: 0,
    offsetTop: 0,
    scrollX: 0,
    scrollY: 0,
    ...appStateOverrides,
  };
  return {
    getSceneElements: () => [element],
    getAppState: () => appState,
    onChange: () => () => {},
  } as unknown as ExcalidrawAPI;
}

// 100x50 box, skew 0.25 -> handle.at gives local (25, 0).
const parallelogram = (over: Partial<El> = {}): El => ({
  id: "a",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
  customData: { flowShape: { kind: "parallelogram", p: { skew: 0.25 } } },
  ...over,
});

const triangle = (over: Partial<El> = {}): El => ({
  id: "t",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
  customData: { flowShape: { kind: "triangle", p: {} } },
  ...over,
});

describe("ShapeHandles", () => {
  it("renders one dot for a selected parallelogram", () => {
    render(<ShapeHandles api={makeApi(parallelogram())} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Parallelogram skew handle/i })).toBeInTheDocument();
  });

  it("renders nothing for a selected triangle (no handles)", () => {
    render(<ShapeHandles api={makeApi(triangle())} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing with a null api", () => {
    const { container } = render(<ShapeHandles api={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("positions the dot at the expected viewport point for a known scroll/zoom", () => {
    // Local handle point (25, 0), angle 0 -> scene point (25, 0) unrotated.
    // zoom 2, scroll (10, 5), offset (100, 50):
    //   x = (25 + 10) * 2 + 100 = 170
    //   y = (0 + 5) * 2 + 50 = 60
    const api = makeApi(parallelogram(), {
      zoom: { value: 2 },
      scrollX: 10,
      scrollY: 5,
      offsetLeft: 100,
      offsetTop: 50,
    });
    render(<ShapeHandles api={api} />);
    const dot = screen.getByRole("button", { name: /Parallelogram skew handle/i });
    expect(dot.style.transform).toContain("translate(170px, 60px)");
  });

  it("rotates the dot with the element", () => {
    // Unrotated: local (25, 0) on a 100x50 box -> scene (25, 0) -> viewport (25, 0).
    const unrotatedApi = makeApi(parallelogram());
    const { unmount } = render(<ShapeHandles api={unrotatedApi} />);
    const unrotatedDot = screen.getByRole("button", { name: /Parallelogram skew handle/i });
    expect(unrotatedDot.style.transform).toContain("translate(25px, 0px)");
    unmount();

    // Rotated 90deg (angle = PI/2) about the box centre (50, 25):
    //   dx = 25 - 50 = -25, dy = 0 - 25 = -25
    //   rx = dx*cos - dy*sin + cx = -25*0 - (-25*1) + 50 = 75
    //   ry = dx*sin + dy*cos + cy = -25*1 + -25*0 + 25 = 0
    // scene (75, 0) -> viewport (75, 0) at zoom 1 / no scroll / no offset.
    const rotatedApi = makeApi(parallelogram({ angle: Math.PI / 2 }));
    render(<ShapeHandles api={rotatedApi} />);
    const rotatedDot = screen.getByRole("button", { name: /Parallelogram skew handle/i });
    expect(rotatedDot.style.transform).toContain("translate(75px, 0px)");
    expect(rotatedDot.style.transform).not.toBe(unrotatedDot.style.transform);
  });
});
