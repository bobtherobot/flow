import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  beginToolGesture,
  deferRestoreToGesture,
  endToolGesture,
  getSuspendedTool,
  isToolGestureActive,
  markToolGestureArmed,
  resetToolRestoreState,
  restoreTool,
  setSuspendedTool,
} from "./tool-restore";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

beforeEach(() => resetToolRestoreState());

describe("module state", () => {
  it("remembers the suspended tool", () => {
    expect(getSuspendedTool()).toBeNull();
    setSuspendedTool("rectangle");
    expect(getSuspendedTool()).toBe("rectangle");
    setSuspendedTool(null);
    expect(getSuspendedTool()).toBeNull();
  });

  it("tracks whether a canvas gesture owns the tool", () => {
    expect(isToolGestureActive()).toBe(false);
    beginToolGesture("rectangle");
    expect(isToolGestureActive()).toBe(true);
    endToolGesture();
    expect(isToolGestureActive()).toBe(false);
  });
});

/**
 * The `(suspendedTool, gesture)` quadrant, one case per state plus the two
 * ways the fourth can resolve. Three of these were real, measured bugs; the
 * table in `tool-restore.ts` says which.
 */
describe("the (suspendedTool, gesture) quadrant", () => {
  it("(null, none): hands nothing back — there is nothing to hand back", () => {
    expect(endToolGesture()).toBeNull();
  });

  it("(null, gesture): hands back the tool that was live at pointerdown", () => {
    beginToolGesture("rectangle");
    markToolGestureArmed();
    expect(endToolGesture()).toBe("rectangle");
  });

  it("(null, gesture) unarmed: a plain click hands nothing back at all", () => {
    // Not merely "hands back the same tool" — a click must write nothing,
    // because restoreTool also re-applies the selection and reloads style
    // memory, neither of which a click has any business doing.
    beginToolGesture("rectangle");
    expect(endToolGesture()).toBeNull();
  });

  it("(T, gesture): captures the SUSPENDED tool, not the override's selection", () => {
    setSuspendedTool("ellipse");
    beginToolGesture("selection"); // what activeTool reads while the override is engaged
    markToolGestureArmed();
    deferRestoreToGesture(); // the modifier comes up mid-gesture
    expect(endToolGesture()).toBe("ellipse");
  });

  it("(T, gesture) with the modifier still down: leaves selection, and the claim, alone", () => {
    setSuspendedTool("ellipse");
    beginToolGesture("selection");
    markToolGestureArmed();
    expect(endToolGesture(), "the effective tool during the hold").toBe("selection");
    expect(getSuspendedTool(), "the override still owns the real tool").toBe("ellipse");
  });

  it("(T, gesture) unarmed, modifier released mid-press: still hands T back", () => {
    // The Critical. Nothing armed, so the gesture owes nothing of its own —
    // but the override released its claim without restoring, precisely
    // because this gesture held one, so the obligation is here now.
    setSuspendedTool("ellipse");
    beginToolGesture("selection");
    deferRestoreToGesture();
    expect(endToolGesture()).toBe("ellipse");
    expect(getSuspendedTool()).toBeNull();
  });

  it("keeps the suspended tool set when it hands the obligation to a gesture", () => {
    // `useToolOverride.restore` must NOT clear it on the way past: the gesture
    // inherits the claim intact and clears it only when it discharges.
    setSuspendedTool("ellipse");
    beginToolGesture("selection");
    expect(deferRestoreToGesture()).toBe(true);
    expect(getSuspendedTool()).toBe("ellipse");
    markToolGestureArmed();
    endToolGesture();
    expect(getSuspendedTool()).toBeNull();
  });

  it("declines the hand-off when no gesture is in flight", () => {
    setSuspendedTool("ellipse");
    expect(deferRestoreToGesture()).toBe(false);
    expect(getSuspendedTool(), "the override still owns it and must restore itself").toBe(
      "ellipse",
    );
  });

  it("marking armed with no gesture in flight is inert", () => {
    expect(() => markToolGestureArmed()).not.toThrow();
    expect(isToolGestureActive()).toBe(false);
  });
});

describe("restoreTool", () => {
  function makeApi() {
    const appState = {
      selectedElementIds: { a: true },
      selectedGroupIds: {},
      editingGroupId: null,
      currentItemArrowType: "elbow",
    };
    return {
      api: {
        getAppState: () => appState,
        setActiveTool: vi.fn(),
        updateScene: vi.fn(),
      } as unknown as ExcalidrawAPI,
      appState,
    };
  }

  it("re-arms the tool locked, and puts the selection back", () => {
    const { api } = makeApi();
    restoreTool(api, "rectangle");
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: true });
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { selectedElementIds: { a: true }, selectedGroupIds: {}, editingGroupId: null },
    });
  });

  it("reloads the restored tool's style-memory category through the handle", () => {
    const { api } = makeApi();
    const styleMemory = { reloadCategory: vi.fn() };
    restoreTool(api, "rectangle", styleMemory as never);
    expect(styleMemory.reloadCategory).toHaveBeenCalledWith("shape", "rectangle", "elbow");
  });

  it("skips the style-memory reload when no handle is supplied", () => {
    const { api } = makeApi();
    expect(() => restoreTool(api, "rectangle")).not.toThrow();
  });
});
