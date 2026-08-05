import { describe, it, expect, vi, beforeEach } from "vitest";

// The real package runs DOM/canvas code that throws in jsdom, so stub the
// exports this wrapper imports. `vi.hoisted` lets the hoisted mock factory
// reference the fns; return values are set per-test.
const { loadFromBlob } = vi.hoisted(() => ({ loadFromBlob: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({
  loadFromBlob,
  serializeAsJSON: vi.fn(),
  exportToBlob: vi.fn(),
  exportToSvg: vi.fn(),
}));

import { applyContentsToScene } from "./excalidraw-scene";
import type { ExcalidrawAPI } from "./excalidraw-scene";

function fakeApi() {
  return {
    updateScene: vi.fn(),
    addFiles: vi.fn(),
  } as unknown as ExcalidrawAPI & {
    updateScene: ReturnType<typeof vi.fn>;
    addFiles: ReturnType<typeof vi.fn>;
  };
}

/** The appState a `.excalidraw` authored with non-flow-default settings carries. */
const SAVED_APP_STATE = {
  bindingMode: "off",
  laserColor: "#00ff00",
  selectionMode: "enclose",
  gridSize: 5,
  objectsSnapModeEnabled: false,
  viewBackgroundColor: "#fafafa",
};

beforeEach(() => {
  loadFromBlob.mockReset();
  loadFromBlob.mockResolvedValue({
    elements: [],
    appState: SAVED_APP_STATE,
    files: null,
  });
});

describe("applyContentsToScene", () => {
  it("does not push the doc's copy of flow's global preferences", async () => {
    const api = fakeApi();

    await applyContentsToScene(api, "{}");

    const { appState } = api.updateScene.mock.calls[0][0];
    expect(appState).not.toHaveProperty("bindingMode");
    expect(appState).not.toHaveProperty("laserColor");
    expect(appState).not.toHaveProperty("selectionMode");
    expect(appState).not.toHaveProperty("gridSize");
  });

  it("still applies the doc's own canvas state", async () => {
    const api = fakeApi();

    await applyContentsToScene(api, "{}");

    const { appState } = api.updateScene.mock.calls[0][0];
    expect(appState.viewBackgroundColor).toBe("#fafafa");
    // Not persisted by flow, so the doc's value wins by design.
    expect(appState.objectsSnapModeEnabled).toBe(false);
  });

  it("normalizes imported elements to the app-wide sloppiness", async () => {
    const api = fakeApi();
    loadFromBlob.mockResolvedValue({
      elements: [{ id: "a", roughness: 2 }],
      appState: SAVED_APP_STATE,
      files: null,
    });

    await applyContentsToScene(api, "{}", 0);

    const { elements, appState } = api.updateScene.mock.calls[0][0];
    expect(elements[0].roughness).toBe(0);
    expect(appState.currentItemRoughness).toBe(0);
  });
});
