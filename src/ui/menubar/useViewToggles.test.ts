import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewToggles } from "./useViewToggles";

type Api = Parameters<typeof useViewToggles>[0];

function fakeApi(state: Record<string, unknown>) {
  return {
    onChange: () => () => {},
    getAppState: () => state,
    executeAction: vi.fn(),
    setActiveTool: vi.fn(),
  };
}

const baseState = {
  gridModeEnabled: true,
  objectsSnapModeEnabled: false,
  zenModeEnabled: true,
  activeTool: { type: "rectangle", locked: true },
};

describe("useViewToggles", () => {
  it("reflects appState flags in checked", () => {
    const api = fakeApi(baseState);
    const { result } = renderHook(() => useViewToggles(api as unknown as Api));
    expect(result.current.grid.checked).toBe(true);
    expect(result.current.objectsSnap.checked).toBe(false);
    expect(result.current.zenMode.checked).toBe(true);
    expect(result.current.toolLock.checked).toBe(true);
  });

  it("dispatches the matching action for grid/snap/zen toggles", () => {
    const api = fakeApi(baseState);
    const { result } = renderHook(() => useViewToggles(api as unknown as Api));
    result.current.grid.toggle();
    result.current.objectsSnap.toggle();
    result.current.zenMode.toggle();
    expect(api.executeAction).toHaveBeenCalledWith("gridMode");
    expect(api.executeAction).toHaveBeenCalledWith("objectsSnapMode");
    expect(api.executeAction).toHaveBeenCalledWith("zenMode");
  });

  it("toggles the tool lock via setActiveTool with the flipped locked flag", () => {
    const api = fakeApi(baseState);
    const { result } = renderHook(() => useViewToggles(api as unknown as Api));
    result.current.toolLock.toggle();
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: false });
  });

  it("is inert when api is null (checked false, toggles no-op)", () => {
    const { result } = renderHook(() => useViewToggles(null));
    expect(result.current.grid.checked).toBe(false);
    expect(result.current.toolLock.checked).toBe(false);
    expect(() => {
      result.current.grid.toggle();
      result.current.toolLock.toggle();
    }).not.toThrow();
  });

  it("re-renders checked state when onChange fires", () => {
    let state: Record<string, unknown> = {
      gridModeEnabled: false,
      objectsSnapModeEnabled: false,
      zenModeEnabled: true,
      activeTool: { type: "rectangle", locked: true },
    };
    let fire = () => {};
    const api = {
      onChange: (cb: () => void) => {
        fire = cb;
        return () => {};
      },
      getAppState: () => state,
      executeAction: vi.fn(),
      setActiveTool: vi.fn(),
    };
    const { result } = renderHook(() => useViewToggles(api as unknown as Api));
    expect(result.current.grid.checked).toBe(false);
    state = {
      gridModeEnabled: true,
      objectsSnapModeEnabled: false,
      zenModeEnabled: true,
      activeTool: { type: "rectangle", locked: true },
    };
    act(() => fire());
    expect(result.current.grid.checked).toBe(true);
  });
});
