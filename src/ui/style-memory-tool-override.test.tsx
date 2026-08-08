import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// Both hooks touch the Excalidraw package (useStyleMemory for
// CaptureUpdateAction); loading the real package in jsdom runs module-level
// UI code that throws. Stub the one export used — same pattern as
// useStyleMemory.test.tsx and useToolOverride.test.tsx.
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY", EVENTUALLY: "EVENTUALLY", NEVER: "NEVER" },
}));

import { useStyleMemory } from "./useStyleMemory";
import { useToolOverride } from "./toolbar/useToolOverride";
import { resetStyleMemory, resolveLoad } from "../lib/style-memory-store";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";

/**
 * Corrective-pass regression coverage for blocker B: the previous wave's
 * release-time style-memory reload wrote via a hand-rolled `updateScene`
 * that bypassed useStyleMemory's own `applyPatch` — the only thing that
 * advances `prevContended`. This file mounts BOTH real hooks (not a fake
 * style-memory handle, unlike useToolOverride.test.tsx's wiring-only unit
 * tests) against one fake canvas, so the actual bug — the reload's own write
 * being misread as drift and folded into the still-selected foreign
 * element's bucket — is reachable exactly as it is in the real app.
 *
 * Both tests below are mechanically verified to FAIL against the previous
 * wave's implementation (hand-rolled `api.updateScene(patch,
 * CaptureUpdateAction.NEVER)` in useToolOverride.ts's `restore`) and PASS
 * against the fix (`styleMemory.reloadCategory`, routed through
 * useStyleMemory's own `applyPatch`).
 */

type El = Record<string, unknown> & { id: string; type: string };

/** A fake canvas combining useStyleMemory.test.tsx's `change`-driven appState
 *  poking with useToolOverride.test.tsx's tool/selection fields, plus real
 *  `setActiveTool` / `updateScene` implementations so both hooks' onChange
 *  subscriptions observe every write either hook makes — including each
 *  other's, which is the whole point of this file. */
function makeApi(elements: El[]) {
  const listeners: Array<() => void> = [];
  let depth = 0;
  const appState: Record<string, unknown> = {
    activeTool: { type: "rectangle", locked: true },
    cursorButton: "up",
    newElement: null,
    multiElement: null,
    editingTextElement: null,
    selectedElementIds: {},
    selectedGroupIds: {},
    editingGroupId: null,
    currentItemArrowType: "sharp",
    currentItemStrokeColor: "#1e1e1e",
    currentItemStrokeWidth: 2,
    currentItemStrokeStyle: "solid",
    currentItemBackgroundColor: "transparent",
    currentItemFillStyle: "solid",
    currentItemOpacity: 100,
    currentItemRoundness: "sharp",
  };
  const fire = () => {
    depth += 1;
    if (depth > 10) throw new Error("onChange recursed too deeply — a loop guard is broken");
    try {
      listeners.forEach((fn) => fn());
    } finally {
      depth -= 1;
    }
  };
  const api = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: (fn: () => void) => {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    },
    updateScene: (arg: { appState?: Record<string, unknown> }) => {
      Object.assign(appState, arg.appState ?? {});
      fire();
    },
    // Mirrors the vendor closely enough for this file's purposes: switching
    // TO selection preserves the selection (App.tsx:4758's guard); switching
    // to any other tool clears it.
    setActiveTool: (tool: { type: string; locked?: boolean }) => {
      const next: Record<string, unknown> = {
        activeTool: { ...(appState.activeTool as object), ...tool },
      };
      if (tool.type !== "selection") {
        next.selectedElementIds = {};
        next.selectedGroupIds = {};
        next.editingGroupId = null;
      }
      Object.assign(appState, next);
      fire();
    },
  };
  return {
    api: api as unknown as ExcalidrawAPI,
    appState,
    /** Mutate appState directly then fire, as a canvas interaction outside
     *  either hook's own writes would (a raw selection click, a panel edit). */
    change: (patch: Record<string, unknown>) => {
      Object.assign(appState, patch);
      fire();
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

/** jsdom's navigator.platform is "", so Control is the modifier here — same
 *  as useToolOverride.test.tsx. */
const press = () =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true }));
const release = () =>
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true }));

/** Mounts both hooks against the same fake api, wired the way App.tsx wires
 *  them: useStyleMemory's returned handle is passed straight to
 *  useToolOverride. */
function mountBoth(api: ExcalidrawAPI) {
  return renderHook(() => {
    const styleMemory = useStyleMemory(api);
    useToolOverride(api, styleMemory);
  });
}

describe("useToolOverride + useStyleMemory — release-time reload (blocker B)", () => {
  beforeEach(() => resetStyleMemory());

  it("does not overwrite the foreign element's own bucket (the new corruption path)", () => {
    // shape bucket ends up remembering width 7 (a plain adopt-then-edit,
    // exactly as a user drawing and then tweaking a rectangle would do).
    const h = makeApi([rect("r"), arrow("a", { strokeWidth: 1 })]);
    mountBoth(h.api);

    h.change({ selectedElementIds: { r: true } }); // adopts shape ← r's own width (4)
    h.change({ currentItemStrokeWidth: 7 }); // r still selected: folds 7 into shape
    h.change({ selectedElementIds: {} });

    // Cmd-hold, select the arrow (foreign/linear, its own width is 1), release.
    // No further edit — this is finding 2's "opposite corruption" consequence:
    // the release's OWN corrective write must not itself read as drift and
    // land in the still-selected arrow's bucket.
    press();
    h.change({ selectedElementIds: { a: true } }); // adopts linear ← a's own width (1)
    release();

    // The arrow's own remembered width must still be 1. Against the previous
    // wave's hand-rolled write (which skips useStyleMemory's applyPatch and so
    // never advances prevContended), the reload's own width-7 write reads as
    // drift on the very next onChange and gets folded into "linear" — the
    // category of the element still selected at that moment — overwriting it
    // with shape's value. RED there: 7. GREEN here: 1.
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeWidth: 1 });
  });

  it("after release, a later arrow tool selection loads the arrow's own remembered value", () => {
    // Same setup as above: shape remembers 7, the arrow's own width is 2.
    const h = makeApi([rect("r"), arrow("a", { strokeWidth: 2 })]);
    mountBoth(h.api);

    h.change({ selectedElementIds: { r: true } });
    h.change({ currentItemStrokeWidth: 7 });
    h.change({ selectedElementIds: {} });

    press();
    h.change({ selectedElementIds: { a: true } });
    release();

    // No further edit. Some time later, in a totally unrelated action, the
    // user switches to the Arrow tool to draw a new one — the "invariant
    // style memory was built on: a load always precedes a draw" (the human's
    // ruling, quoted in useStyleMemory.ts's StyleMemoryHandle doc) must hold
    // here too, not just for the tool the override happened to restore.
    h.change({ selectedElementIds: {}, activeTool: { type: "arrow" } });

    // Against the previous wave's implementation this loads the corrupted
    // linear bucket (7, leaked from shape by the bug covered in the test
    // above) — matching the corrective-pass finding that the old fix "is not
    // self-healing": the very next arrow draw reinforces the wrong value
    // instead of correcting it. Fixed, it loads the arrow's own 2.
    expect(h.appState.currentItemStrokeWidth).toBe(2);
  });
});
