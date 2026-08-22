import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useZenMode } from "./useZenMode";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";

function fakeApi(state: Record<string, unknown>) {
  return {
    onChange: () => () => {},
    getAppState: () => state,
    executeAction: vi.fn(),
  };
}

describe("useZenMode", () => {
  it("reads zenModeEnabled from appState", () => {
    const on = renderHook(() =>
      useZenMode(fakeApi({ zenModeEnabled: true }) as unknown as ExcalidrawAPI),
    );
    expect(on.result.current.zen).toBe(true);

    const off = renderHook(() =>
      useZenMode(fakeApi({ zenModeEnabled: false }) as unknown as ExcalidrawAPI),
    );
    expect(off.result.current.zen).toBe(false);
  });

  it("toggles through the public zenMode action", () => {
    const api = fakeApi({ zenModeEnabled: false });
    const { result } = renderHook(() => useZenMode(api as unknown as ExcalidrawAPI));
    result.current.toggle();
    expect(api.executeAction).toHaveBeenCalledWith("zenMode");
  });

  it("is inert before Excalidraw mounts (api null)", () => {
    const { result } = renderHook(() => useZenMode(null));
    expect(result.current.zen).toBe(false);
    expect(() => result.current.toggle()).not.toThrow();
  });

  it("re-renders when onChange fires, so other surfaces stay in sync", () => {
    // The whole point of the bridge: Alt+Z or the View menu flips zen without
    // this component ever being clicked, and the chrome must still react.
    let state: Record<string, unknown> = { zenModeEnabled: false };
    let fire = () => {};
    const api = {
      onChange: (cb: () => void) => {
        fire = cb;
        return () => {};
      },
      getAppState: () => state,
      executeAction: vi.fn(),
    };
    const { result } = renderHook(() => useZenMode(api as unknown as ExcalidrawAPI));
    expect(result.current.zen).toBe(false);
    state = { zenModeEnabled: true };
    act(() => fire());
    expect(result.current.zen).toBe(true);
  });
});
