import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useToolOverride } from "./useToolOverride";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

/** Mutable appState behind the fake api, so a test can model the canvas
 *  changing between engage and restore (an undo landing mid-hold). */
function fakeApi(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    activeTool: { type: "rectangle", locked: true },
    cursorButton: "up",
    newElement: null,
    multiElement: null,
    editingTextElement: null,
    selectedElementIds: {},
    selectedGroupIds: {},
    editingGroupId: null,
    ...overrides,
  };
  const listeners: Array<() => void> = [];
  const api = {
    getAppState: () => state,
    onChange: (cb: () => void) => {
      listeners.push(cb);
      return () => {};
    },
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
  return { api, state, emit: () => listeners.forEach((cb) => cb()) };
}

/** jsdom's navigator.platform is "", so Control is the modifier here. */
const press = () =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true }));
const release = () =>
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true }));

describe("useToolOverride", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suspends the drawing tool for the selection tool while held", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "selection", locked: true });
  });

  it("restores the suspended tool on release", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    release();
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("re-applies the selection read at release time, not at engage time", () => {
    const { api, state } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    // Stand-in for anything that changes the selection mid-hold: a Cmd-click,
    // or a Cmd+Z whose undo restores a different selection.
    state.selectedElementIds = { box: true };
    state.selectedGroupIds = { g1: true };
    state.editingGroupId = "g1";
    release();
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: {
        selectedElementIds: { box: true },
        selectedGroupIds: { g1: true },
        editingGroupId: "g1",
      },
    });
  });

  it("restores the tool before re-applying the selection", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    release();
    // setActiveTool clears the selection for any non-selection tool
    // (vendor App.tsx:4758), so the re-apply MUST come second.
    const toolCallOrder = (api.setActiveTool as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    const sceneCallOrder = (api.updateScene as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    // .at(-1) needs ES2022 lib; this repo deliberately keeps tsconfig at
    // ES2020 (see 9c1f515), so index from length instead.
    const toolCall = toolCallOrder[toolCallOrder.length - 1];
    const sceneCall = sceneCallOrder[sceneCallOrder.length - 1];
    expect(toolCall).toBeLessThan(sceneCall);
  });

  it("ignores the auto-repeat while the key is held down", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    press();
    press();
    expect(api.setActiveTool).toHaveBeenCalledTimes(1);
  });

  it("does nothing on release when it never engaged", () => {
    const { api } = fakeApi({ activeTool: { type: "selection", locked: true } });
    renderHook(() => useToolOverride(api));
    press();
    release();
    expect(api.setActiveTool).not.toHaveBeenCalled();
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("ignores a key that is not the platform modifier", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("does not engage while a pointer is down", () => {
    const { api } = fakeApi({ cursorButton: "down" });
    renderHook(() => useToolOverride(api));
    press();
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("restores on window blur, since Cmd+Tab never delivers the keyup", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    window.dispatchEvent(new Event("blur"));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("restores when the tab is hidden", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("detaches its listeners on unmount", () => {
    const { api } = fakeApi();
    const { unmount } = renderHook(() => useToolOverride(api));
    unmount();
    press();
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("is inert until the api exists", () => {
    renderHook(() => useToolOverride(null));
    expect(() => press()).not.toThrow();
  });
});

describe("useToolOverride — forced tool lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("locks an unlocked tool as soon as it mounts", () => {
    const { api } = fakeApi({ activeTool: { type: "rectangle", locked: false } });
    renderHook(() => useToolOverride(api));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: true });
  });

  it("re-locks when something unlocks the tool, such as the native Q shortcut", () => {
    const { api, state, emit } = fakeApi();
    renderHook(() => useToolOverride(api));
    state.activeTool = { type: "ellipse", locked: false };
    emit();
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "ellipse", locked: true });
  });

  it("writes nothing while the tool is already locked, so it converges", () => {
    const { api, emit } = fakeApi();
    renderHook(() => useToolOverride(api));
    emit();
    emit();
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("never re-asserts the lock on the image tool, which would reopen the file picker", () => {
    const { api } = fakeApi({ activeTool: { type: "image", locked: false } });
    renderHook(() => useToolOverride(api));
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });
});
