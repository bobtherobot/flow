import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBottomActions } from "./useBottomActions";
import { bottomItem } from "./items";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(appState: Record<string, unknown> = {}) {
  return {
    getAppState: () => ({
      zoom: { value: 1 },
      viewBackgroundColor: "#ffffff",
      gridModeEnabled: false,
      zenModeEnabled: false,
      openSidebar: null,
      ...appState,
    }),
    onChange: () => () => {},
    executeAction: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

const grid = () => bottomItem("gridMode")!;

describe("useBottomActions", () => {
  it("reports zoom as a whole-number percentage", () => {
    const api = fakeApi({ zoom: { value: 1.25 } });
    const { result } = renderHook(() => useBottomActions(api));
    expect(result.current.zoomPct).toBe(125);
  });

  it("reflects the canvas background color", () => {
    const api = fakeApi({ viewBackgroundColor: "#f8f9fa" });
    const { result } = renderHook(() => useBottomActions(api));
    expect(result.current.background).toBe("#f8f9fa");
  });

  it("marks a toggle active from its appState flag", () => {
    const api = fakeApi({ gridModeEnabled: true });
    const { result } = renderHook(() => useBottomActions(api));
    expect(result.current.isActive(grid())).toBe(true);
  });

  it("dispatches the toggle's action via executeAction", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useBottomActions(api));
    result.current.toggle(grid());
    expect(api.executeAction).toHaveBeenCalledWith("gridMode");
  });

  it("sets the background via changeViewBackgroundColor with a value object", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useBottomActions(api));
    result.current.setBackground("#e03131");
    expect(api.executeAction).toHaveBeenCalledWith("changeViewBackgroundColor", {
      viewBackgroundColor: "#e03131",
    });
  });

  it("zooms in by updating the scene zoom", () => {
    const api = fakeApi({ zoom: { value: 1 } });
    const { result } = renderHook(() => useBottomActions(api));
    result.current.zoomIn();
    expect(api.updateScene).toHaveBeenCalled();
  });

  it("opens the search sidebar on runSearch", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useBottomActions(api));
    result.current.runSearch("");
    expect(api.executeAction).toHaveBeenCalledWith("searchMenu");
  });

  it("is inert with a null api", () => {
    const { result } = renderHook(() => useBottomActions(null));
    expect(result.current.zoomPct).toBe(100);
    expect(result.current.background).toBe("#ffffff");
    expect(() => result.current.zoomIn()).not.toThrow();
    expect(() => result.current.runSearch("x")).not.toThrow();
  });
});
