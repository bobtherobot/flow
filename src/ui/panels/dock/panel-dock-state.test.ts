import { describe, it, expect } from "vitest";
import {
  DEFAULT_DOCK_STATE,
  DOCK_LIMITS,
  dockReducer,
  dockedPanels,
  orderedPanels,
  normalizeDockState,
  syncPanelDefs,
  captureLayout,
  type DockState,
} from "./panel-dock-state";

/** A state seeded with three docked panels a,b,c in order. */
function seed(): DockState {
  return syncPanelDefs({ ...DEFAULT_DOCK_STATE, panels: [] }, ["a", "b", "c"]);
}

describe("syncPanelDefs", () => {
  it("appends a state entry for each registered id in order", () => {
    const s = syncPanelDefs(DEFAULT_DOCK_STATE, ["a", "b"]);
    expect(s.panels.map((p) => p.id)).toEqual(["a", "b"]);
    expect(s.panels.map((p) => p.order)).toEqual([0, 1]);
    expect(s.panels.every((p) => p.visible && p.expanded && !p.floating)).toBe(true);
  });

  it("preserves existing panel state and appends only missing ones", () => {
    const s1 = syncPanelDefs(DEFAULT_DOCK_STATE, ["a"]);
    const collapsed = dockReducer(s1, { type: "toggleSubExpanded", id: "a" });
    const s2 = syncPanelDefs(collapsed, ["a", "b"]);
    expect(s2.panels.find((p) => p.id === "a")?.expanded).toBe(false);
    expect(s2.panels.find((p) => p.id === "b")?.order).toBe(1);
  });

  it("drops orphan entries whose id is no longer registered", () => {
    const s = syncPanelDefs(seed(), ["a", "c"]);
    expect(s.panels.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("returns the same reference when nothing changes", () => {
    const s = seed();
    expect(syncPanelDefs(s, ["a", "b", "c"])).toBe(s);
  });
});

describe("normalizeDockState", () => {
  it("returns defaults for non-object input", () => {
    expect(normalizeDockState(null)).toEqual({ ...DEFAULT_DOCK_STATE, panels: [] });
    expect(normalizeDockState("nope")).toEqual({ ...DEFAULT_DOCK_STATE, panels: [] });
  });

  it("clamps out-of-range geometry", () => {
    const s = normalizeDockState({ floatW: 9999, floatH: 1, dockedWidth: 5 });
    expect(s.floatW).toBe(DOCK_LIMITS.MAX_W);
    expect(s.floatH).toBe(DOCK_LIMITS.MIN_H);
    expect(s.dockedWidth).toBe(DOCK_LIMITS.MIN_W);
  });

  it("keeps well-formed panels and skips malformed entries", () => {
    const s = normalizeDockState({
      panels: [{ id: "a", visible: false }, { nope: 1 }, { id: "b", floatW: 99999 }],
    });
    expect(s.panels.map((p) => p.id)).toEqual(["a", "b"]);
    expect(s.panels[0].visible).toBe(false);
    expect(s.panels[1].floatW).toBe(DOCK_LIMITS.MAX_W);
  });
});

describe("dockReducer — main panel", () => {
  it("toggles collapse", () => {
    const s = dockReducer(seed(), { type: "toggleCollapse" });
    expect(s.collapsed).toBe(true);
    expect(dockReducer(s, { type: "toggleCollapse" }).collapsed).toBe(false);
  });

  it("detaches with clamped geometry then re-docks", () => {
    const d = dockReducer(seed(), {
      type: "detach",
      floatX: 30,
      floatY: 40,
      floatW: 9999,
      floatH: 50,
    });
    expect(d.floating).toBe(true);
    expect(d.floatW).toBe(DOCK_LIMITS.MAX_W);
    expect(d.floatH).toBe(DOCK_LIMITS.MIN_H);
    expect(dockReducer(d, { type: "dock" }).floating).toBe(false);
  });

  it("resizes docked width within limits", () => {
    expect(dockReducer(seed(), { type: "resizeDocked", dockedWidth: 10 }).dockedWidth).toBe(
      DOCK_LIMITS.MIN_W,
    );
    expect(
      dockReducer(seed(), { type: "resizeDocked", dockedWidth: 300 }).dockedWidth,
    ).toBe(300);
  });

  it("resizeFloat leaves the omitted dimension untouched", () => {
    const base = { ...seed(), floatW: 300, floatH: 400 };
    const s = dockReducer(base, { type: "resizeFloat", floatW: 350 });
    expect(s.floatW).toBe(350);
    expect(s.floatH).toBe(400);
  });

  it("clampToViewport is a no-op while docked", () => {
    const s = seed();
    expect(dockReducer(s, { type: "clampToViewport", vw: 800, vh: 600, topOffset: 36 })).toBe(s);
  });

  it("clampToViewport pulls a floating panel back on-screen", () => {
    const float = dockReducer(seed(), {
      type: "detach",
      floatX: 5000,
      floatY: 5000,
      floatW: 260,
      floatH: 400,
    });
    const s = dockReducer(float, { type: "clampToViewport", vw: 1000, vh: 700, topOffset: 36 });
    expect(s.floatX).toBe(1000 - 260);
    expect(s.floatY).toBeLessThanOrEqual(700 - DOCK_LIMITS.MIN_H);
    expect(s.floatY).toBeGreaterThanOrEqual(36);
  });
});

describe("dockReducer — sub panels", () => {
  it("toggles expanded", () => {
    const s = dockReducer(seed(), { type: "toggleSubExpanded", id: "b" });
    expect(s.panels.find((p) => p.id === "b")?.expanded).toBe(false);
  });

  it("hiding a floating panel also clears its floating flag", () => {
    const floated = dockReducer(seed(), {
      type: "floatSub",
      id: "a",
      floatX: 10,
      floatY: 10,
      floatW: 240,
    });
    const hidden = dockReducer(floated, { type: "setSubVisible", id: "a", visible: false });
    const a = hidden.panels.find((p) => p.id === "a");
    expect(a?.visible).toBe(false);
    expect(a?.floating).toBe(false);
  });

  it("closeSub hides and un-floats", () => {
    const s = dockReducer(seed(), { type: "closeSub", id: "c" });
    const c = s.panels.find((p) => p.id === "c");
    expect(c).toMatchObject({ visible: false, floating: false });
  });

  it("floatSub then dockSub round-trips floating flag", () => {
    const f = dockReducer(seed(), {
      type: "floatSub",
      id: "b",
      floatX: 100,
      floatY: 80,
      floatW: 9999,
    });
    expect(f.panels.find((p) => p.id === "b")?.floating).toBe(true);
    expect(f.panels.find((p) => p.id === "b")?.floatW).toBe(DOCK_LIMITS.MAX_W);
    const d = dockReducer(f, { type: "dockSub", id: "b" });
    expect(d.panels.find((p) => p.id === "b")?.floating).toBe(false);
  });

  it("floating panels are excluded from the docked stack", () => {
    const f = dockReducer(seed(), {
      type: "floatSub",
      id: "b",
      floatX: 1,
      floatY: 1,
      floatW: 240,
    });
    expect(dockedPanels(f).map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("dockReducer — reorder", () => {
  it("moves a panel to the front", () => {
    const s = dockReducer(seed(), { type: "reorderSub", id: "c", targetIndex: 0 });
    expect(dockedPanels(s).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("moves a panel to the middle", () => {
    const s = dockReducer(seed(), { type: "reorderSub", id: "a", targetIndex: 1 });
    expect(dockedPanels(s).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("clamps an out-of-range target index to the end", () => {
    const s = dockReducer(seed(), { type: "reorderSub", id: "a", targetIndex: 99 });
    expect(dockedPanels(s).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });

  it("ignores an unknown id", () => {
    const s = seed();
    expect(dockReducer(s, { type: "reorderSub", id: "zzz", targetIndex: 0 })).toBe(s);
  });
});

describe("dockReducer — layouts", () => {
  it("resetDefault restores visibility, expansion, docking and sequential order", () => {
    let s = seed();
    s = dockReducer(s, { type: "toggleSubExpanded", id: "a" });
    s = dockReducer(s, { type: "setSubVisible", id: "b", visible: false });
    s = dockReducer(s, { type: "reorderSub", id: "c", targetIndex: 0 });
    s = dockReducer(s, { type: "toggleCollapse" });
    const reset = dockReducer(s, { type: "resetDefault" });
    expect(reset.collapsed).toBe(false);
    expect(reset.panels.every((p) => p.visible && p.expanded && !p.floating)).toBe(true);
    expect(orderedPanels(reset).map((p) => p.order)).toEqual([0, 1, 2]);
  });

  it("captureLayout + applyLayout round-trips per-panel state", () => {
    let s = seed();
    s = dockReducer(s, { type: "setSubVisible", id: "b", visible: false });
    s = dockReducer(s, { type: "resizeDocked", dockedWidth: 333 });
    const snapshot = captureLayout(s);

    // Mutate away, then restore
    let other = dockReducer(s, { type: "setSubVisible", id: "b", visible: true });
    other = dockReducer(other, { type: "resizeDocked", dockedWidth: 200 });

    const restored = dockReducer(other, { type: "applyLayout", state: snapshot });
    expect(restored.dockedWidth).toBe(333);
    expect(restored.panels.find((p) => p.id === "b")?.visible).toBe(false);
  });

  it("captureLayout is a deep clone (no shared references)", () => {
    const s = seed();
    const snap = captureLayout(s);
    snap.panels[0].order = 99;
    expect(s.panels[0].order).toBe(0);
  });
});

describe("immutability", () => {
  it("never mutates the input state", () => {
    const s = seed();
    const frozen = JSON.stringify(s);
    dockReducer(s, { type: "toggleCollapse" });
    dockReducer(s, { type: "reorderSub", id: "a", targetIndex: 2 });
    dockReducer(s, { type: "resetDefault" });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
