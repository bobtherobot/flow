import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuickActions } from "./useQuickActions";
import { quickItem, BINDING_ID } from "./actions";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(appState: Record<string, unknown> = {}) {
  return {
    getAppState: () => ({
      activeTool: { type: "selection", locked: false },
      objectsSnapModeEnabled: false,
      zenModeEnabled: false,
      gridModeEnabled: false,
      currentItemArrowType: "sharp",
      currentItemFlowShape: null,
      ...appState,
    }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    executeAction: vi.fn(),
    // useActiveTool's setTool (now reused by useQuickActions -- see finding 6)
    // writes appState through updateScene before calling setActiveTool.
    updateScene: vi.fn(),
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

  it("selects a tool and reflects the active tool", () => {
    const api = fakeApi({ activeTool: { type: "ellipse", locked: false } });
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));
    expect(result.current.isActive(item("ellipse"))).toBe(true);
    expect(result.current.isActive(item("rectangle"))).toBe(false);
    act(() => result.current.trigger(item("rectangle")));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle" });
  });

  // Finding 6: TOOL_ITEMS used to be built from ALL_TOOLS while dropping
  // `toolType`/`flowShape`, so triggering "Triangle" from the quickbar called
  // `setActiveTool({ type: "triangle" })` -- not a real Excalidraw tool type,
  // since every flow shape shares the vendor's "rectangle" tool and differs
  // only by the `currentItemFlowShape` kind stamped into appState -- which
  // armed an inert tool that drew nothing. `trigger` must instead go through
  // `setTool` (reused from `useActiveTool`, the same function the shapebar's
  // own `ToolRail` calls) so the underlying tool AND the appState default
  // both get set.
  it("arms a flow shape's kind and activates its underlying rectangle tool", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));

    act(() => result.current.trigger(item("triangle")));

    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: { kind: "triangle", p: {} } },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle" });
  });

  // Pre-existing (not new to this branch) for arrow-curved/arrow-elbow, which
  // this same `setTool` reuse now also fixes: activating "Curved arrow" must
  // set `currentItemArrowType` before arming the shared "arrow" tool, not
  // call `setActiveTool({ type: "arrow-curved" })`.
  it("sets an arrow variant's default and activates the shared arrow tool", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useQuickActions(api, "on", () => {}));

    act(() => result.current.trigger(item("arrow-curved")));

    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: null, currentItemArrowType: "round" },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow" });
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
