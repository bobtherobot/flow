import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveTool } from "./useActiveTool";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(
  activeTool: { type: string; locked: boolean },
  currentItemArrowType = "sharp",
) {
  return {
    getAppState: () => ({ activeTool, currentItemArrowType }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

describe("useActiveTool", () => {
  it("reads the active tool type", () => {
    const api = fakeApi({ type: "rectangle", locked: true });
    const { result } = renderHook(() => useActiveTool(api));
    expect(result.current.activeType).toBe("rectangle");
  });

  it("defaults to selection when api is null", () => {
    const { result } = renderHook(() => useActiveTool(null));
    expect(result.current.activeType).toBe("selection");
  });

  it("setTool dispatches setActiveTool with the type", () => {
    const api = fakeApi({ type: "selection", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("diamond"));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "diamond" });
  });

  it("exposes the current new-arrow shape", () => {
    const api = fakeApi({ type: "arrow", locked: false }, "elbow");
    const { result } = renderHook(() => useActiveTool(api));
    expect(result.current.arrowType).toBe("elbow");
  });

  it("setTool with an arrow shape sets the default then activates the arrow tool", () => {
    const api = fakeApi({ type: "selection", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("arrow", "round"));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: null, currentItemArrowType: "round" },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow" });
  });

  it("setTool without an arrow or flow shape still clears the armed shape", () => {
    const api = fakeApi({ type: "selection", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("rectangle"));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: null },
    });
  });

  it("arms the shape with its default params and activates the rectangle tool", async () => {
    const api = fakeApi({ type: "selection", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("rectangle", undefined, "triangle"));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: { kind: "triangle", p: {} } },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle" });
  });

  it("clears the armed shape when a non-shape tool is picked", () => {
    const api = fakeApi({ type: "selection", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("line"));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: null },
    });
  });
});
