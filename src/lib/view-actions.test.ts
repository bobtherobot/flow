import { describe, it, expect, vi } from "vitest";
import { zoomIn, zoomOut, resetZoom, zoomToFit } from "./view-actions";

function mockApi(state: { zoom?: number; grid?: boolean } = {}) {
  const updateScene = vi.fn();
  const setViewport = vi.fn();
  const api = {
    updateScene,
    setViewport,
    getSceneElements: () => [] as unknown[],
    getAppState: () => ({
      zoom: { value: state.zoom ?? 1 },
      gridModeEnabled: state.grid ?? false,
    }),
  };
  // Cast: the real ExcalidrawAPI has many more members we don't exercise here.
  return { api: api as never, updateScene, setViewport };
}

describe("view-actions", () => {
  it("zoomIn multiplies the zoom by 1.1", () => {
    const { api, updateScene } = mockApi({ zoom: 1 });
    zoomIn(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 1.1 } } });
  });

  it("zoomOut divides the zoom by 1.1", () => {
    const { api, updateScene } = mockApi({ zoom: 1.1 });
    zoomOut(api);
    const arg = updateScene.mock.calls[0][0];
    expect(arg.appState.zoom.value).toBeCloseTo(1);
  });

  it("clamps zoom to a max of 30", () => {
    const { api, updateScene } = mockApi({ zoom: 30 });
    zoomIn(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 30 } } });
  });

  it("clamps zoom to a min of 0.1", () => {
    const { api, updateScene } = mockApi({ zoom: 0.1 });
    zoomOut(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 0.1 } } });
  });

  it("resetZoom sets zoom to 1", () => {
    const { api, updateScene } = mockApi({ zoom: 3 });
    resetZoom(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 1 } } });
  });

  it("zoomToFit fits the scene into the viewport", () => {
    // Upstream replaced scrollToContent with setViewport; "scale-down" is the
    // fit upstream's own Zoom-to-Fit uses (never zoom past 100%).
    const { api, setViewport } = mockApi();
    zoomToFit(api);
    expect(setViewport).toHaveBeenCalledWith({
      target: [],
      fit: "scale-down",
      animation: true,
    });
  });
});
