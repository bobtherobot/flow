import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  beginToolGesture,
  endToolGesture,
  getSuspendedTool,
  isToolGestureActive,
  resetToolRestoreState,
  restoreTool,
  setSuspendedTool,
} from "./tool-restore";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

beforeEach(() => resetToolRestoreState());

describe("module state", () => {
  it("remembers the suspended tool", () => {
    expect(getSuspendedTool()).toBeNull();
    setSuspendedTool("rectangle");
    expect(getSuspendedTool()).toBe("rectangle");
    setSuspendedTool(null);
    expect(getSuspendedTool()).toBeNull();
  });

  it("tracks whether a canvas gesture owns the tool", () => {
    expect(isToolGestureActive()).toBe(false);
    beginToolGesture();
    expect(isToolGestureActive()).toBe(true);
    endToolGesture();
    expect(isToolGestureActive()).toBe(false);
  });
});

describe("restoreTool", () => {
  function makeApi() {
    const appState = {
      selectedElementIds: { a: true },
      selectedGroupIds: {},
      editingGroupId: null,
      currentItemArrowType: "elbow",
    };
    return {
      api: {
        getAppState: () => appState,
        setActiveTool: vi.fn(),
        updateScene: vi.fn(),
      } as unknown as ExcalidrawAPI,
      appState,
    };
  }

  it("re-arms the tool locked, and puts the selection back", () => {
    const { api } = makeApi();
    restoreTool(api, "rectangle");
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: true });
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { selectedElementIds: { a: true }, selectedGroupIds: {}, editingGroupId: null },
    });
  });

  it("reloads the restored tool's style-memory category through the handle", () => {
    const { api } = makeApi();
    const styleMemory = { reloadCategory: vi.fn() };
    restoreTool(api, "rectangle", styleMemory as never);
    expect(styleMemory.reloadCategory).toHaveBeenCalledWith("shape", "rectangle", "elbow");
  });

  it("skips the style-memory reload when no handle is supplied", () => {
    const { api } = makeApi();
    expect(() => restoreTool(api, "rectangle")).not.toThrow();
  });
});
