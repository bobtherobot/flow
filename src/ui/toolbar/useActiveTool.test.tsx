import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveTool } from "./useActiveTool";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(activeTool: { type: string; locked: boolean }) {
  return {
    getAppState: () => ({ activeTool }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

describe("useActiveTool", () => {
  it("reads the active tool type and lock flag", () => {
    const api = fakeApi({ type: "rectangle", locked: true });
    const { result } = renderHook(() => useActiveTool(api));
    expect(result.current.activeType).toBe("rectangle");
    expect(result.current.locked).toBe(true);
  });

  it("defaults to selection/unlocked when api is null", () => {
    const { result } = renderHook(() => useActiveTool(null));
    expect(result.current.activeType).toBe("selection");
    expect(result.current.locked).toBe(false);
  });

  it("setTool dispatches setActiveTool with the type", () => {
    const api = fakeApi({ type: "selection", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("diamond"));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "diamond" });
  });

  it("toggleLock flips the lock flag on the current tool", () => {
    const api = fakeApi({ type: "arrow", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.toggleLock());
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow", locked: true });
  });
});
