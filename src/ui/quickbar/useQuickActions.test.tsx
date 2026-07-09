import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuickActions } from "./useQuickActions";
import { quickItem, LOCK_ID, BINDING_ID } from "./actions";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(appState: Record<string, unknown> = {}) {
  return {
    getAppState: () => ({
      activeTool: { type: "selection", locked: false },
      objectsSnapModeEnabled: false,
      zenModeEnabled: false,
      gridModeEnabled: false,
      ...appState,
    }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

const item = (id: string) => quickItem(id)!;

describe("useQuickActions", () => {
  it("dispatches a z-order action via executeAction", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));
    act(() => result.current.trigger(item("bringToFront")));
    expect(api.executeAction).toHaveBeenCalledWith("bringToFront");
  });

  it("reflects a generic toggle's appState flag", () => {
    const api = fakeApi({ objectsSnapModeEnabled: true });
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));
    expect(result.current.isActive(item("objectsSnapMode"))).toBe(true);
    expect(result.current.isActive(item("zenMode"))).toBe(false);
  });

  it("dispatches a generic toggle via its action name", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));
    act(() => result.current.trigger(item("zenMode")));
    expect(api.executeAction).toHaveBeenCalledWith("zenMode");
  });

  it("reflects and toggles the tool lock via setActiveTool", () => {
    const api = fakeApi({ activeTool: { type: "rectangle", locked: true } });
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));
    expect(result.current.isActive(item(LOCK_ID))).toBe(true);
    act(() => result.current.trigger(item(LOCK_ID)));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: false });
  });

  it("selects a tool and reflects the active tool", () => {
    const api = fakeApi({ activeTool: { type: "ellipse", locked: false } });
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));
    expect(result.current.isActive(item("ellipse"))).toBe(true);
    expect(result.current.isActive(item("rectangle"))).toBe(false);
    act(() => result.current.trigger(item("rectangle")));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle" });
  });

  it("reads binding active-state from the mode, not appState", () => {
    const api = fakeApi();
    const on = renderHook(() => useQuickActions(api, "on", () => {}));
    expect(on.result.current.isActive(item(BINDING_ID))).toBe(true);
    const off = renderHook(() => useQuickActions(api, "off", () => {}));
    expect(off.result.current.isActive(item(BINDING_ID))).toBe(false);
  });

  it("flips the binding mode through the callback, not executeAction", () => {
    const api = fakeApi();
    const onSet = vi.fn();
    const { result } = renderHook(() => useQuickActions(api, "on", onSet));
    act(() => result.current.trigger(item(BINDING_ID)));
    expect(onSet).toHaveBeenCalledWith("off");
    expect(api.executeAction).not.toHaveBeenCalled();
  });
});
