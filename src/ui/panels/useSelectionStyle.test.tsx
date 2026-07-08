import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// The hook imports CaptureUpdateAction + newElementWith from the Excalidraw
// package; loading the real package in jsdom runs module-level UI code that
// throws. Stub just the two exports the hook uses (newElementWith bumps version).
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY" },
  newElementWith: (el: Record<string, unknown>, updates: Record<string, unknown>) => ({
    ...el,
    ...updates,
    version: ((el.version as number) ?? 0) + 1,
  }),
}));

import { useSelectionStyle } from "./useSelectionStyle";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string; version: number };

function makeApi(elements: El[], selectedElementIds: Record<string, boolean>) {
  const appState = {
    selectedElementIds,
    currentItemStrokeColor: "#111111",
  };
  const api = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: () => () => {},
    updateScene: vi.fn(),
    executeAction: vi.fn(),
  };
  // The hook only touches this subset of the imperative API.
  return api as unknown as ExcalidrawAPI & {
    updateScene: ReturnType<typeof vi.fn>;
    executeAction: ReturnType<typeof vi.fn>;
  };
}

const rect = (id: string, over: Partial<El> = {}): El => ({
  id,
  type: "rectangle",
  version: 1,
  strokeColor: "#111111",
  ...over,
});

describe("useSelectionStyle", () => {
  it("reports no selection and is inert with a null api", () => {
    const { result } = renderHook(() => useSelectionStyle(null));
    expect(result.current.hasSelection).toBe(false);
    expect(result.current.hasText).toBe(false);
    expect(result.current.hasLinear).toBe(false);
    expect(() => result.current.setProp({ prop: "strokeColor", value: "#f00" })).not.toThrow();
  });

  it("derives hasSelection, hasText and hasLinear from the selection", () => {
    const api = makeApi(
      [rect("r"), { ...rect("t"), type: "text" }, { ...rect("a"), type: "arrow" }],
      { r: true, t: true, a: true },
    );
    const { result } = renderHook(() => useSelectionStyle(api));
    expect(result.current.hasSelection).toBe(true);
    expect(result.current.hasText).toBe(true);
    expect(result.current.hasLinear).toBe(true);
    expect(result.current.textTargetIds).toEqual({ t: true });
  });

  it("hasText/hasLinear are false for a plain rectangle selection", () => {
    const api = makeApi([rect("r")], { r: true });
    const { result } = renderHook(() => useSelectionStyle(api));
    expect(result.current.hasText).toBe(false);
    expect(result.current.hasLinear).toBe(false);
  });

  it("setProp writes the new value and currentItem default via updateScene", () => {
    const api = makeApi([rect("r"), rect("s")], { r: true });
    const { result } = renderHook(() => useSelectionStyle(api));
    result.current.setProp({
      prop: "strokeColor",
      value: "#ff0000",
      currentItemKey: "currentItemStrokeColor",
    });

    expect(api.updateScene).toHaveBeenCalledTimes(1);
    const arg = api.updateScene.mock.calls[0][0];
    const changed = arg.elements.find((e: El) => e.id === "r");
    const untouched = arg.elements.find((e: El) => e.id === "s");
    expect(changed.strokeColor).toBe("#ff0000");
    expect(changed.version).toBe(2); // newElementWith bumped the version
    expect(untouched.strokeColor).toBe("#111111");
    expect(arg.appState).toEqual({ currentItemStrokeColor: "#ff0000" });
  });

  it("executeAction delegates to the imperative api", () => {
    const api = makeApi([rect("a", { type: "arrow" })], { a: true });
    const { result } = renderHook(() => useSelectionStyle(api));
    result.current.executeAction("changeArrowType", "elbow");
    expect(api.executeAction).toHaveBeenCalledWith("changeArrowType", "elbow");
  });

  it("selectedCount counts only truthy selectedElementIds", () => {
    const api = makeApi(
      [rect("a"), rect("b"), rect("c")],
      { a: true, b: true, c: false },
    );
    const { result } = renderHook(() => useSelectionStyle(api));
    expect(result.current.selectedCount).toBe(2);
  });
});
