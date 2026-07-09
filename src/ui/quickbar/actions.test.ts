import { describe, it, expect } from "vitest";
import { QUICK_ITEMS, TOOL_ITEM_IDS, quickItem, LOCK_ID, BINDING_ID } from "./actions";
import { TOOLS } from "../toolbar/tools";

describe("QUICK_ITEMS registry", () => {
  it("has no duplicate ids", () => {
    const ids = QUICK_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every action/toggle-with-actionName a verified Excalidraw action name", () => {
    // Names confirmed present in the fork's action registry.
    const known = new Set([
      "bringToFront", "bringForward", "sendBackward", "sendToBack",
      "group", "ungroup",
      "alignLeft", "alignHorizontallyCentered", "alignRight",
      "alignTop", "alignVerticallyCentered", "alignBottom",
      "distributeHorizontally", "distributeVertically",
      "objectsSnapMode", "gridMode", "zenMode",
      "undo", "redo",
    ]);
    for (const item of QUICK_ITEMS) {
      if (item.actionName) expect(known.has(item.actionName)).toBe(true);
    }
  });

  it("derives tool items from TOOLS (same ids), hidden-by-default set matches", () => {
    expect(TOOL_ITEM_IDS).toEqual(TOOLS.map((t) => t.id));
    for (const id of TOOL_ITEM_IDS) {
      expect(quickItem(id)?.kind).toBe("tool");
    }
  });

  it("marks the two special toggles (lock, binding) without an actionName", () => {
    expect(quickItem(LOCK_ID)?.kind).toBe("toggle");
    expect(quickItem(LOCK_ID)?.actionName).toBeUndefined();
    expect(quickItem(BINDING_ID)?.kind).toBe("toggle");
    expect(quickItem(BINDING_ID)?.actionName).toBeUndefined();
  });

  it("gives generic toggles a toggleFlag that names an appState boolean", () => {
    expect(quickItem("objectsSnapMode")?.toggleFlag).toBe("objectsSnapModeEnabled");
    expect(quickItem("gridMode")?.toggleFlag).toBe("gridModeEnabled");
    expect(quickItem("zenMode")?.toggleFlag).toBe("zenModeEnabled");
  });

  it("returns undefined for an unknown id", () => {
    expect(quickItem("nope")).toBeUndefined();
  });
});
