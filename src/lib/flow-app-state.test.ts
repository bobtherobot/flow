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
  pastePosition: "original",
  gridSize: 20,
  gridColor: "#dddddd",
} as const;

describe("flowSeedAppState", () => {
  it("carries every app-wide preference through to appState", () => {
    expect(flowSeedAppState({ ...PREFS })).toMatchObject({
      currentItemRoughness: 0,
      bindingMode: "on",
      laserColor: "#ff0000",
      selectionMode: "enclose",
      pastePosition: "original",
      gridSize: 20,
      gridColor: "#dddddd",
      gridColorBold: "#e5e5e5",
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

  it("seeds no armed shape", () => {
    expect(flowSeedAppState({ ...PREFS })).toMatchObject({ currentItemFlowShape: null });
  });

  it("treats the armed shape as a flow global, so an opened document cannot arm one", () => {
    expect(FLOW_GLOBAL_APP_STATE_KEYS).toContain("currentItemFlowShape");
    const stripped = withoutFlowGlobals({
      currentItemFlowShape: { kind: "triangle", p: {} },
      viewBackgroundColor: "#fff",
    });
    expect("currentItemFlowShape" in stripped).toBe(false);
    expect(stripped.viewBackgroundColor).toBe("#fff");
  });

  it("derives the bold gridline color rather than taking it as a preference", () => {
    // Only gridColor is persisted; the bold shade is always computed, so the two
    // cannot drift out of sync.
    const seed = flowSeedAppState({ ...PREFS, gridColor: "#001020" }) as Record<
      string,
      unknown
    >;

    expect(seed.gridColor).toBe("#001020");
    expect(seed.gridColorBold).toBe("#081828");
  });

  it("treats both grid colors as flow globals, so an opened document cannot override them", () => {
    const stripped = withoutFlowGlobals({
      gridColor: "#ff0000",
      gridColorBold: "#ff0808",
      viewBackgroundColor: "#ffffff",
    });

    expect(stripped).not.toHaveProperty("gridColor");
    expect(stripped).not.toHaveProperty("gridColorBold");
    expect(stripped).toHaveProperty("viewBackgroundColor", "#ffffff");
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
