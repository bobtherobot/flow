import { describe, it, expect, vi } from "vitest";

// The barrel pulls in Excalidraw's dialog components, which blow up on import
// under jsdom — same stub approach as excalidraw-scene.test.ts.
vi.mock("@excalidraw/excalidraw", () => ({ FONT_FAMILY: { Nunito: 6 } }));

import {
  FLOW_GLOBAL_APP_STATE_KEYS,
  flowSeedAppState,
  withoutFlowGlobals,
} from "./flow-app-state";

const PREFS = {
  sloppiness: 0,
  bindingMode: "on",
  laserColor: "#ff0000",
  selectionMode: "enclose",
  gridSize: 20,
} as const;

describe("flowSeedAppState", () => {
  it("carries every app-wide preference through to appState", () => {
    expect(flowSeedAppState({ ...PREFS })).toMatchObject({
      currentItemRoughness: 0,
      bindingMode: "on",
      laserColor: "#ff0000",
      selectionMode: "enclose",
      gridSize: 20,
    });
  });

  it("applies flow's own canvas defaults", () => {
    const seed = flowSeedAppState({ ...PREFS });

    expect(seed.currentItemRoundness).toBe("sharp");
    expect(seed.objectsSnapModeEnabled).toBe(true);
    expect(seed.currentItemFontFamily).toBe(6);
    expect(seed.activeTool).toEqual({
      type: "selection",
      customType: null,
      locked: true,
      lastActiveTool: null,
    });
  });

  it("covers every flow-owned global key, so File ▸ New can restore them all", () => {
    // resetScene wipes appState wholesale; a global that this seed forgets is a
    // preference that silently reverts on File ▸ New.
    const seed = flowSeedAppState({ ...PREFS }) as Record<string, unknown>;

    for (const key of FLOW_GLOBAL_APP_STATE_KEYS) {
      expect(seed).toHaveProperty(key);
    }
  });
});

describe("withoutFlowGlobals", () => {
  it("drops every flow-owned global key", () => {
    const appState = {
      bindingMode: "off",
      laserColor: "#00ff00",
      selectionMode: "enclose",
      gridSize: 5,
    };

    const result = withoutFlowGlobals(appState);

    for (const key of FLOW_GLOBAL_APP_STATE_KEYS) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it("keeps document-owned appState untouched", () => {
    const appState = {
      gridSize: 5,
      viewBackgroundColor: "#ffffff",
      zoom: { value: 2 },
      // Session/document state by design — flow does not persist these, so a
      // saved doc restores its own (matches gridModeEnabled / zenModeEnabled).
      objectsSnapModeEnabled: false,
    };

    const result = withoutFlowGlobals(appState);

    expect(result).toEqual({
      viewBackgroundColor: "#ffffff",
      zoom: { value: 2 },
      objectsSnapModeEnabled: false,
    });
  });

  it("does not mutate the input", () => {
    const appState = { gridSize: 5, viewBackgroundColor: "#fff" };

    withoutFlowGlobals(appState);

    expect(appState).toEqual({ gridSize: 5, viewBackgroundColor: "#fff" });
  });

  it("tolerates an appState missing every flow key", () => {
    expect(withoutFlowGlobals({ viewBackgroundColor: "#fff" })).toEqual({
      viewBackgroundColor: "#fff",
    });
  });
});
