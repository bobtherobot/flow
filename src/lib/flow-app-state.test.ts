import { describe, it, expect } from "vitest";

import { FLOW_GLOBAL_APP_STATE_KEYS, withoutFlowGlobals } from "./flow-app-state";

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
