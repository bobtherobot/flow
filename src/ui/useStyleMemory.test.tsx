import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// The hook imports CaptureUpdateAction from the Excalidraw package; loading the
// real package in jsdom runs module-level UI code that throws. Stub the one
// export it uses.
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY", EVENTUALLY: "EVENTUALLY", NEVER: "NEVER" },
}));

import { useStyleMemory } from "./useStyleMemory";
import { resetStyleMemory, resolveLoad, getActiveCategory } from "../lib/style-memory-store";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

/** A fake canvas whose appState and elements can be driven between onChange fires. */
function makeApi(elements: El[]) {
  const listeners: Array<() => void> = [];
  let depth = 0;
  const appState: Record<string, unknown> = {
    selectedElementIds: {},
    activeTool: { type: "selection" },
    currentItemArrowType: "sharp",
    currentItemStrokeColor: "#1e1e1e",
    currentItemStrokeWidth: 2,
    currentItemStrokeStyle: "solid",
    currentItemBackgroundColor: "transparent",
    currentItemFillStyle: "solid",
    currentItemOpacity: 100,
    currentItemRoundness: "sharp",
  };
  const api = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: (fn: () => void) => {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    },
    // Faithful to the real canvas: a write fires onChange again. That is what
    // exercises the hook's loop guard. The depth cap turns a broken guard into a
    // loud failure instead of a hung test run.
    updateScene: vi.fn((arg: { appState?: Record<string, unknown> }) => {
      Object.assign(appState, arg.appState ?? {});
      depth += 1;
      if (depth > 5) {
        throw new Error("updateScene recursed too deeply — the loop guard is broken");
      }
      try {
        listeners.forEach((fn) => fn());
      } finally {
        depth -= 1;
      }
    }),
  };
  return {
    api: api as unknown as ExcalidrawAPI & { updateScene: ReturnType<typeof vi.fn> },
    appState,
    setElements: (next: El[]) => {
      elements = next;
    },
    /** Mutate appState then fire the canvas's change callback, as Excalidraw would. */
    change: (patch: Record<string, unknown>) => {
      Object.assign(appState, patch);
      listeners.forEach((fn) => fn());
    },
  };
}

const rect = (id: string, over: Partial<El> = {}): El => ({
  id,
  type: "rectangle",
  width: 100,
  height: 80,
  strokeColor: "#ff0000",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 4,
  strokeStyle: "solid",
  opacity: 100,
  roundness: null,
  ...over,
});

const arrow = (id: string, over: Partial<El> = {}): El => ({
  id,
  type: "arrow",
  width: 100,
  height: 10,
  strokeColor: "#0000ff",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  opacity: 100,
  elbowed: false,
  roundness: null,
  ...over,
});

describe("useStyleMemory", () => {
  beforeEach(() => {
    resetStyleMemory();
  });

  it("is inert with a null api", () => {
    expect(() => renderHook(() => useStyleMemory(null))).not.toThrow();
  });

  it("adopts a single newly-selected element into its bucket", () => {
    const h = makeApi([rect("r")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });

    expect(getActiveCategory()).toBe("shape");
    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#ff0000", currentItemStrokeWidth: 4 });
  });

  it("writes the adopted snapshot through to appState", () => {
    const h = makeApi([arrow("a", { endArrowhead: "dot", endArrowheadSize: 12 })]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { a: true } });

    // Resident keys have no other write point — adoption is what carries them.
    expect(h.appState.currentItemEndArrowhead).toBe("dot");
    expect(h.appState.currentItemEndArrowheadSize).toBe(12);
    expect(h.appState.currentItemStrokeColor).toBe("#0000ff");
  });

  it("leaves the buckets alone when several elements are added at once", () => {
    const h = makeApi([rect("r"), rect("s", { strokeColor: "#00ff00" })]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true, s: true } });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toEqual({});
  });

  it("adopts on a later single add even after a bulk selection", () => {
    const h = makeApi([rect("r"), rect("s", { strokeColor: "#00ff00" }), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true, s: true } });
    h.change({ selectedElementIds: { r: true, s: true, a: true } });

    expect(getActiveCategory()).toBe("linear");
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
  });

  it("adopts a captioned container into both the shape and text buckets", () => {
    const h = makeApi([
      rect("c", { boundElements: [{ id: "t", type: "text" }], padding: 20 }),
      {
        id: "t",
        type: "text",
        containerId: "c",
        strokeColor: "#123456",
        fontFamily: 7,
        fontSize: 40,
        textAlign: "center",
        opacity: 100,
      },
    ]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { c: true } });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#ff0000" });
    // Text colour, font and the container's padding are resident — written through.
    expect(h.appState.currentItemTextColor).toBe("#123456");
    expect(h.appState.currentItemFontSize).toBe(40);
    expect(h.appState.currentItemPadding).toBe(20);
    // Adopting the bound caption makes "text" active internally; the clicked
    // element (the container) must win so a subsequent tool change or edit
    // lands in "shape", not "text".
    expect(getActiveCategory()).toBe("shape");
  });

  it("does not let an arrow's style reach a newly drawn box", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    // Adopt the box, then the arrow. The arrow was selected most recently, so
    // appState now carries its #0000ff / width 1 — only a real bucket swap can
    // put the box's #ff0000 / width 4 back.
    h.change({ selectedElementIds: { r: true } });
    h.change({ selectedElementIds: {} });
    h.change({ selectedElementIds: { a: true } });
    h.change({ selectedElementIds: {} });
    expect(h.appState.currentItemStrokeColor).toBe("#0000ff");

    h.api.updateScene.mockClear();
    h.change({ activeTool: { type: "rectangle" } });

    expect(h.appState.currentItemStrokeColor).toBe("#ff0000");
    expect(h.appState.currentItemStrokeWidth).toBe(4);
    const load = h.api.updateScene.mock.calls.map((c) => c[0]).pop();
    expect(load.appState.currentItemStrokeColor).toBe("#ff0000");
  });

  it("uses CaptureUpdateAction.NEVER so a defaults swap is not an undo entry", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });
    h.change({ selectedElementIds: {} });
    h.change({ selectedElementIds: { a: true } });
    h.change({ selectedElementIds: {} });
    h.api.updateScene.mockClear();
    h.change({ activeTool: { type: "rectangle" } });

    expect(h.api.updateScene).toHaveBeenCalled();
    for (const [arg] of h.api.updateScene.mock.calls) {
      expect(arg.captureUpdate).toBe("NEVER");
      expect(arg.elements).toBeUndefined();
    }
  });

  it("writes nothing on a tool change whose values already match", () => {
    const h = makeApi([rect("r")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });
    h.change({ selectedElementIds: {}, activeTool: { type: "rectangle" } });
    h.api.updateScene.mockClear();

    // Back to selection and out again: the bucket now equals live appState.
    h.change({ activeTool: { type: "selection" } });
    h.change({ activeTool: { type: "rectangle" } });

    expect(h.api.updateScene).not.toHaveBeenCalled();
  });

  it("writes nothing when a non-drawing tool is activated", () => {
    const h = makeApi([rect("r")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });
    h.api.updateScene.mockClear();
    h.change({ activeTool: { type: "hand" } });

    expect(h.api.updateScene).not.toHaveBeenCalled();
  });

  it("folds a currentItem edit into every category in the selection", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true, a: true } });
    h.change({ currentItemStrokeColor: "#abcdef" });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#abcdef" });
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#abcdef" });
  });

  it("folds an edit made with an empty selection into the active category", () => {
    const h = makeApi([arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { a: true } }); // active = linear
    h.change({ selectedElementIds: {} });
    h.change({ currentItemStrokeWidth: 9 });

    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeWidth: 9 });
    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toEqual({});
  });

  it("does not fold its own load back into the wrong bucket", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });   // shape ← #ff0000
    h.change({ selectedElementIds: {} });
    h.change({ selectedElementIds: { a: true } });   // linear ← #0000ff, active = linear
    h.change({ selectedElementIds: {} });
    h.change({ activeTool: { type: "rectangle" } }); // loads shape's #ff0000

    // The load moved currentItemStrokeColor. If that drift were folded into the
    // still-active linear bucket, the arrow's remembered stroke would be lost.
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
  });

  // Mutation-kill test for applyPatch no longer dropping a literal `undefined`
  // patch value. The mock appState never otherwise touches
  // currentItemCornerRadius, so without this test a reintroduced
  // `if (value === undefined) continue;` guard would pass all 601 unit tests
  // silently — the guard's removal has no observable effect unless something
  // seeds a stale defined value first. This seeds one exactly the way a real
  // session would (a live edit folded into the active "shape" bucket via the
  // capture-edit path), then switches to an elbow arrow — a "linear" target
  // that never recorded a radius of its own — and asserts the stale value is
  // actually cleared, not left behind.
  it("resets a stale corner radius instead of leaking it into a category that never recorded one", () => {
    const h = makeApi([rect("r")]);
    renderHook(() => useStyleMemory(h.api));

    // Folds into the active ("shape") bucket, since nothing is selected —
    // mirrors what editing an existing square rectangle's radius leaves
    // behind (see StrokePanel's setRadius).
    h.change({ currentItemCornerRadius: 0 });

    h.api.updateScene.mockClear();
    h.change({ activeTool: { type: "arrow" }, currentItemArrowType: "elbow" });

    expect(h.api.updateScene).toHaveBeenCalled();
    const writes = h.api.updateScene.mock.calls.map(([arg]) => arg.appState ?? {});
    // The reset must be an explicit write, not an accidental omission that
    // happens to leave appState looking right.
    expect(writes.some((w) => "currentItemCornerRadius" in w)).toBe(true);
    expect(h.appState.currentItemCornerRadius).toBeUndefined();
  });

  // Mutation-kill test for applyPatch's ref-before-write ordering. The prior
  // "does not fold its own load back into the wrong bucket" test does not
  // catch a swapped ordering: in every sequence it drives, the re-entrant fold
  // lands back in the category that was just made active — a harmless
  // overwrite of the value already there. A selection spanning two categories,
  // built by sequential single-adds, is what makes the corruption observable:
  // adopting the second element writes through while both are still selected,
  // so categoriesInSelection returns both, and a stale prevContended makes the
  // re-entrant onChange see drift and fold the second element's values into
  // the first element's (still-active) bucket too.
  it("a second single-add does not fold its write-through into the first element's bucket", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } }); // single add, adopts shape
    h.change({ selectedElementIds: { r: true, a: true } }); // ctrl-click the arrow: single add, adopts linear, writes through while both selected

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#ff0000", currentItemStrokeWidth: 4 });
  });
});
