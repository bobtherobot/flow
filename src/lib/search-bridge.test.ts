import { describe, expect, it, vi } from "vitest";
import { openSearch, pushQueryIntoSearchInput } from "./search-bridge";
import type { ExcalidrawAPI } from "./excalidraw-scene";

/** Minimal api stub for the two calls the bridge makes. */
function makeApi(openTab: string | null): ExcalidrawAPI {
  return {
    getAppState: () => ({ openSidebar: openTab ? { name: "default", tab: openTab } : null }),
    executeAction: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

describe("pushQueryIntoSearchInput", () => {
  it("returns false when no search input exists", () => {
    const root = document.createElement("div");
    expect(pushQueryIntoSearchInput("hi", root)).toBe(false);
  });

  it("sets the value and fires an input event on the native search input", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="layer-ui__search-inputWrapper"><input /></div>`;
    document.body.appendChild(root);
    const input = root.querySelector("input")!;
    const onInput = vi.fn();
    input.addEventListener("input", onInput);

    expect(pushQueryIntoSearchInput("hello", root)).toBe(true);
    expect(input.value).toBe("hello");
    expect(onInput).toHaveBeenCalledTimes(1);

    root.remove();
  });
});

describe("openSearch", () => {
  it("dispatches searchMenu when the sidebar is closed", () => {
    const api = makeApi(null);
    openSearch(api, "");
    expect(api.executeAction).toHaveBeenCalledWith("searchMenu");
  });

  it("does not dispatch searchMenu when the search panel is already open", () => {
    const api = makeApi("search");
    openSearch(api, "");
    expect(api.executeAction).not.toHaveBeenCalled();
  });
});
