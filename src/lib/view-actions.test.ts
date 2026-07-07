import { describe, it, expect, vi } from "vitest";
import { zoomIn, zoomOut, resetZoom, zoomToFit, toggleGrid } from "./view-actions";

function mockApi(state: { zoom?: number; grid?: boolean } = {}) {
  const updateScene = vi.fn();
  const scrollToContent = vi.fn();
  const api = {
    updateScene,
    scrollToContent,
    getSceneElements: () => [] as unknown[],
    getAppState: () => ({
      zoom: { value: state.zoom ?? 1 },
      gridModeEnabled: state.grid ?? false,
    }),
  };
  // Cast: the real ExcalidrawAPI has many more members we don't exercise here.
  return { api: api as never, updateScene, scrollToContent };
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

  it("zoomToFit scrolls to content with fitToContent", () => {
    const { api, scrollToContent } = mockApi();
    zoomToFit(api);
    expect(scrollToContent).toHaveBeenCalledWith([], { fitToContent: true, animate: true });
  });

  it("toggleGrid flips gridModeEnabled", () => {
    const { api, updateScene } = mockApi({ grid: false });
    toggleGrid(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { gridModeEnabled: true } });
  });
});
