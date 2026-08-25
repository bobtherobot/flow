import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { useToolOverride } from "../toolbar/useToolOverride";
import { useQuickArrowDrag } from "./useQuickArrowDrag";
import { getSuspendedTool, resetToolRestoreState } from "../toolbar/tool-restore";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

/**
 * The two hooks that can take the active tool away, mounted together and
 * driven by real key and pointer events.
 *
 * Each of them has its own unit tests against a stand-in for the other, and
 * those are the ones that pin down the individual decisions. This file exists
 * because every bug in the `(suspendedTool, gesture)` quadrant has lived in
 * the *seam*: the tool the user gets back is decided by a keyup in one hook
 * and a pointerup in the other, and either hook alone looks correct. Three of
 * the cases below shipped broken and were caught in a browser, not here.
 *
 * `useQuickArrowDrag`'s own tests stand in for the keyup by calling
 * `deferRestoreToGesture()` directly; here the keyup is a real
 * `keyup` event travelling through the real `useToolOverride`.
 */

type El = Record<string, unknown> & { id: string; type: string };

const rect = (): El => ({
  id: "r",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
});

/** A fake api whose `activeTool` actually follows `setActiveTool`, so the two
 *  hooks read each other's writes the way they do against the real one. */
function makeApi(initialTool: string) {
  const state: Record<string, unknown> = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: initialTool, locked: true },
    cursorButton: "up",
    newElement: null,
    multiElement: null,
    editingTextElement: null,
    selectedElementIds: {},
    selectedGroupIds: {},
    editingGroupId: null,
    currentItemArrowType: "sharp",
  };
  const setActiveTool = vi.fn((tool: { type: string; locked: boolean }) => {
    state.activeTool = { ...tool };
  });
  const updateScene = vi.fn((arg: { appState?: Record<string, unknown> }) => {
    Object.assign(state, arg.appState ?? {});
  });
  const api = {
    getAppState: () => state,
    getSceneElements: () => [rect()],
    setActiveTool,
    updateScene,
    onChange: () => () => {},
  } as unknown as ExcalidrawAPI;
  return { api, state, activeTool: () => (state.activeTool as { type: string }).type };
}

function Harness({ api }: { api: ExcalidrawAPI }) {
  useToolOverride(api);
  const onPointerDown = useQuickArrowDrag({ api, element: rect() as never, side: "e" });
  return (
    <button type="button" aria-label="Quick arrow right" onPointerDown={onPointerDown} />
  );
}

const glyph = () => screen.getByRole("button", { name: "Quick arrow right" });

/** jsdom's navigator.platform is "", so Control is the modifier here. */
const holdModifier = () =>
  act(() =>
    void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true })),
  );
const releaseModifier = () =>
  act(() =>
    void window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true })),
  );

const pressGlyph = () =>
  act(() =>
    void fireEvent.pointerDown(glyph(), { pointerId: 7, clientX: 130, clientY: 25, button: 0 }),
  );
const dragPointer = () =>
  act(() =>
    void window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 7, clientX: 160, clientY: 25 }),
    ),
  );
const releasePointer = () =>
  act(() => void window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 })));
/** Let the arm -> rAF -> dispatch chain complete. */
const flushFrame = () => act(() => void vi.advanceTimersByTime(20));

beforeEach(() => {
  vi.useFakeTimers();
  resetToolRestoreState();
  const canvas = document.createElement("canvas");
  canvas.className = "interactive";
  document.body.appendChild(canvas);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout),
  );
});
afterEach(() => {
  // Including the stand-in canvas: a leftover would make the next test's
  // `querySelector("canvas.interactive")` find the previous test's element.
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("quick-arrow drag and the Cmd/Ctrl tool override, together", () => {
  it("a Cmd-held click on a glyph leaves the armed tool exactly where it was", () => {
    // THE CRITICAL. Ellipse armed, hold Ctrl (the arrows appear), press a
    // glyph, release Ctrl, release the button without moving. Measured before
    // the fix: `activeTool` stuck on "selection" and the Ellipse tool simply
    // gone until re-picked -- the keyup cleared the override's record of it
    // and then early-returned, and the click path restored nothing.
    const { api, activeTool } = makeApi("ellipse");
    render(<Harness api={api} />);

    holdModifier();
    expect(activeTool(), "the override is engaged").toBe("selection");
    pressGlyph();
    releaseModifier();
    flushFrame();
    releasePointer();

    expect(activeTool()).toBe("ellipse");
    expect(getSuspendedTool(), "and no claim is left dangling").toBeNull();
  });

  it("releasing Cmd before the first move still restores the suspended tool", () => {
    // The tool has to be captured at pointerdown. Capturing it when the drag
    // is confirmed -- one keyup later -- read null and fell back to the
    // override's own "selection".
    const { api, activeTool } = makeApi("ellipse");
    render(<Harness api={api} />);

    holdModifier();
    pressGlyph();
    releaseModifier(); // BEFORE any movement: this is what made it fall back
    dragPointer();
    flushFrame();
    releasePointer();

    expect(activeTool()).toBe("ellipse");
  });

  it("a Cmd-held drag leaves the override still engaged for the rest of the hold", () => {
    // The feature's primary Cmd path. The gesture used to re-arm "ellipse"
    // while Ctrl was still down, so the arrows stopped appearing and a canvas
    // drag drew an ellipse instead of marquee-selecting.
    const { api, activeTool } = makeApi("ellipse");
    render(<Harness api={api} />);

    holdModifier();
    pressGlyph();
    dragPointer();
    flushFrame();
    releasePointer(); // Ctrl is STILL down

    expect(activeTool(), "still the effective tool for the hold").toBe("selection");
    expect(getSuspendedTool(), "the override kept its claim").toBe("ellipse");

    releaseModifier();
    expect(activeTool(), "and hands it back on its own keyup, as always").toBe("ellipse");
  });

  it("a drag with no modifier involved restores the tool that was live", () => {
    // The quadrant's third state, unchanged by any of this and asserted here
    // so a fix aimed at the modifier cases cannot quietly break it.
    const { api, activeTool } = makeApi("rectangle");
    render(<Harness api={api} />);

    pressGlyph();
    dragPointer();
    flushFrame();
    releasePointer();

    expect(activeTool()).toBe("rectangle");
  });
});
