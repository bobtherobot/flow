# Drag-to-scrub numeric inputs — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the range track beside every numeric field with a Firefox-devtools style drag gesture on the field itself, and make one gesture equal one undo entry.

**Architecture:** A new `useScrubDrag` hook owns all pointer maths and emits `(value, transient)`. `NumberInput` renders a `↕` grip and wires the gesture; `transient` threads down through `useSelectionStyle`/`transform.ts` to select `CaptureUpdateAction.EVENTUALLY` mid-drag and `IMMEDIATELY` on release. `SliderInput` sheds its numeric field and survives only for the two arrowhead-size controls.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom), Playwright, Excalidraw via the `vendor/excalidraw` submodule.

**Spec:** `docs/superpowers/specs/2026-08-05-scrub-numeric-inputs-design.md`

## Global Constraints

- **Zero fork edits.** Everything lands in `src/`. Do not modify `vendor/excalidraw` — the font-size design deliberately avoids the one change that would have needed it.
- **Scrub geometry:** `SCRUB_TRAVEL_PX = 150`, drag threshold `3px`, Shift `×10`, Alt `×0.1`. Dragging **up** increases.
- **Capture modes:** `EVENTUALLY` while `transient === true`, `IMMEDIATELY` otherwise. Never `NEVER` — it advances the history baseline and breaks batching.
- **Per-field spans:** W/H/X/Y `300`, radius/padding `200`, font size `150`. Stroke width, opacity, rotation and grid size pass **no** span and inherit `max - min`.
- **Test commands:** `npm test -- --run` (unit), `npm run typecheck`, `npx playwright test <file>` (e2e). The dev server for e2e is started by `playwright.config.ts`.
- **Accessible names:** stroke width and the three opacity rows drop the `" value"` suffix. Font size keeps `"Font size value"` — its sibling toggle group owns `"Font size"`.
- **Never modify a test to make it pass.** If a test fails, fix the implementation.

---

### Task 1: The `useScrubDrag` hook

**Files:**
- Create: `src/ui/panels/controls/useScrubDrag.ts`
- Test: `src/ui/panels/controls/useScrubDrag.test.tsx`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `useScrubDrag(args: UseScrubDragArgs): ScrubDragBinding` and the exported constant `SCRUB_TRAVEL_PX = 150`.
  ```ts
  interface UseScrubDragArgs {
    value: number | null;
    min: number;
    max: number;
    step?: number;            // scrub granularity, default 1
    span: number | null;      // value units per SCRUB_TRAVEL_PX; null disables
    disabled?: boolean;
    onScrub: (value: number, transient: boolean) => void;
    onClick?: () => void;     // press that never became a drag
  }
  interface ScrubDragBinding {
    onPointerDown: (e: React.PointerEvent) => void;
    isDragging: boolean;
  }
  ```

**Context:** jsdom implements `PointerEvent` but **not** `setPointerCapture`. The hook therefore subscribes to `window` for `pointermove`/`pointerup`/`keydown`, which both survives a drag leaving the element in a real browser and works in jsdom with no stubbing.

- [ ] **Step 1: Write the failing test**

Create `src/ui/panels/controls/useScrubDrag.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useScrubDrag, SCRUB_TRAVEL_PX } from "./useScrubDrag";

/** Minimal host so the hook can be driven through real DOM events. */
function Harness(props: Partial<Parameters<typeof useScrubDrag>[0]> = {}) {
  const scrub = useScrubDrag({
    value: 50,
    min: 0,
    max: 100,
    span: 100,
    onScrub: () => {},
    ...props,
  });
  return (
    <div data-testid="grip" onPointerDown={scrub.onPointerDown}>
      {scrub.isDragging ? "dragging" : "idle"}
    </div>
  );
}

/** span 100 over 150px travel → 1 unit per 1.5px. `init` is applied to the
 *  pointerdown too, so a modifier held before the press is the press's
 *  multiplier rather than a mid-drag change. */
const drag = (fromY: number, toY: number, init: PointerEventInit = {}) => {
  fireEvent.pointerDown(screen.getByTestId("grip"), { clientY: fromY, button: 0, ...init });
  fireEvent.pointerMove(window, { clientY: toY, ...init });
  fireEvent.pointerUp(window, { clientY: toY, ...init });
};

describe("useScrubDrag", () => {
  it("maps a full SCRUB_TRAVEL_PX drag upward to one full span", () => {
    const onScrub = vi.fn();
    render(<Harness value={0} min={0} max={1000} span={100} onScrub={onScrub} />);
    drag(300, 300 - SCRUB_TRAVEL_PX);
    expect(onScrub).toHaveBeenLastCalledWith(100, false);
  });

  it("decreases when dragging down", () => {
    const onScrub = vi.fn();
    render(<Harness value={50} min={0} max={100} span={100} onScrub={onScrub} />);
    drag(300, 300 + 75); // half the travel → half the span
    expect(onScrub).toHaveBeenLastCalledWith(0, false);
  });

  it("emits transient values during the drag and one final commit", () => {
    const onScrub = vi.fn();
    render(<Harness value={50} min={0} max={100} span={100} onScrub={onScrub} />);
    const grip = screen.getByTestId("grip");
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerMove(window, { clientY: 270 });
    fireEvent.pointerUp(window, { clientY: 270 });

    const transientCalls = onScrub.mock.calls.filter(([, t]) => t === true);
    const commitCalls = onScrub.mock.calls.filter(([, t]) => t === false);
    expect(transientCalls.length).toBe(2);
    expect(commitCalls).toEqual([[70, false]]);
  });

  it("multiplies by 10 with Shift and by 0.1 with Alt", () => {
    const shift = vi.fn();
    const { unmount } = render(<Harness value={0} min={-1e6} max={1e6} span={100} onScrub={shift} />);
    drag(300, 285, { shiftKey: true }); // 15px → 10 units → ×10
    expect(shift).toHaveBeenLastCalledWith(100, false);
    unmount();

    const alt = vi.fn();
    render(<Harness value={0} min={-1e6} max={1e6} span={100} step={0.1} onScrub={alt} />);
    drag(300, 150, { altKey: true }); // full travel → 100 units → ×0.1
    expect(alt).toHaveBeenLastCalledWith(10, false);
  });

  it("re-anchors when a modifier changes mid-drag instead of jumping", () => {
    const onScrub = vi.fn();
    render(<Harness value={0} min={-1e6} max={1e6} span={100} onScrub={onScrub} />);
    fireEvent.pointerDown(screen.getByTestId("grip"), { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });                  // +10 → 10
    // Pressing Shift re-anchors here, so this event moves nothing...
    fireEvent.pointerMove(window, { clientY: 285, shiftKey: true });
    expect(onScrub).toHaveBeenLastCalledWith(10, true);
    // ...and subsequent travel is measured from the new anchor: 15px × 10.
    fireEvent.pointerMove(window, { clientY: 270, shiftKey: true });
    fireEvent.pointerUp(window, { clientY: 270, shiftKey: true });
    // Rescaling the whole 30px delta instead would have jumped to 200.
    expect(onScrub).toHaveBeenLastCalledWith(110, false);
  });

  it("clamps to min and max", () => {
    const onScrub = vi.fn();
    render(<Harness value={95} min={0} max={100} span={100} onScrub={onScrub} />);
    drag(300, 100); // way past the top
    expect(onScrub).toHaveBeenLastCalledWith(100, false);
  });

  it("snaps to the step and clears float noise", () => {
    const onScrub = vi.fn();
    render(<Harness value={2} min={0} max={10} span={10} step={0.5} onScrub={onScrub} />);
    drag(300, 290); // 10px → 0.666 units → snaps to 0.5
    expect(onScrub).toHaveBeenLastCalledWith(2.5, false);
  });

  it("treats movement under the 3px threshold as a click, not a drag", () => {
    const onScrub = vi.fn();
    const onClick = vi.fn();
    render(<Harness value={50} span={100} onScrub={onScrub} onClick={onClick} />);
    drag(300, 298);
    expect(onScrub).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("cancels an armed press on Escape without committing or clicking", () => {
    const onScrub = vi.fn();
    const onClick = vi.fn();
    render(<Harness value={50} min={0} max={100} span={100} onScrub={onScrub} onClick={onClick} />);
    fireEvent.pointerDown(screen.getByTestId("grip"), { clientY: 300, button: 0 });
    fireEvent.keyDown(window, { key: "Escape" }); // still under the 3px threshold
    expect(onScrub).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    // The gesture is over: a later release must not resurrect the click.
    fireEvent.pointerUp(window, { clientY: 300 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("reverts to the gesture's start value on Escape", () => {
    const onScrub = vi.fn();
    render(<Harness value={50} min={0} max={100} span={100} onScrub={onScrub} />);
    fireEvent.pointerDown(screen.getByTestId("grip"), { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 270 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onScrub).toHaveBeenLastCalledWith(50, false);
    // The gesture is over: further movement is ignored.
    onScrub.mockClear();
    fireEvent.pointerMove(window, { clientY: 200 });
    expect(onScrub).not.toHaveBeenCalled();
  });

  it("reports isDragging only while dragging", () => {
    render(<Harness value={50} span={100} onScrub={() => {}} />);
    expect(screen.getByTestId("grip")).toHaveTextContent("idle");
    fireEvent.pointerDown(screen.getByTestId("grip"), { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 280 });
    expect(screen.getByTestId("grip")).toHaveTextContent("dragging");
    fireEvent.pointerUp(window, { clientY: 280 });
    expect(screen.getByTestId("grip")).toHaveTextContent("idle");
  });

  it("is inert when disabled, when the value is mixed, and for a null span", () => {
    for (const props of [{ disabled: true }, { value: null }, { span: null }]) {
      const onScrub = vi.fn();
      const { unmount } = render(<Harness {...props} onScrub={onScrub} />);
      drag(300, 200);
      expect(onScrub).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("ignores non-primary buttons", () => {
    const onScrub = vi.fn();
    render(<Harness value={50} span={100} onScrub={onScrub} />);
    fireEvent.pointerDown(screen.getByTestId("grip"), { clientY: 300, button: 2 });
    fireEvent.pointerMove(window, { clientY: 200 });
    expect(onScrub).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run src/ui/panels/controls/useScrubDrag.test.tsx`
Expected: FAIL — `Failed to resolve import "./useScrubDrag"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/panels/controls/useScrubDrag.ts`:

```ts
import { useEffect, useRef, useState } from "react";

/** Pointer travel, in px, that sweeps one full `span` of value. */
export const SCRUB_TRAVEL_PX = 150;
/** Movement before an armed press becomes a drag. */
const DRAG_THRESHOLD_PX = 3;
const SHIFT_MULTIPLIER = 10;
const ALT_MULTIPLIER = 0.1;

interface UseScrubDragArgs {
  /** Current value; null (mixed selection) disables the gesture. */
  value: number | null;
  min: number;
  max: number;
  /** Granularity the dragged value snaps to. */
  step?: number;
  /** Value units traversed by a full SCRUB_TRAVEL_PX drag; null disables. */
  span: number | null;
  disabled?: boolean;
  onScrub: (value: number, transient: boolean) => void;
  /** Fired for a press that never crossed the drag threshold. */
  onClick?: () => void;
}

interface ScrubDragBinding {
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging: boolean;
}

interface Gesture {
  /** Pointer Y the current delta is measured from; moves when a modifier changes. */
  anchorY: number;
  /** Value the current delta is added to; moves with anchorY. */
  anchorValue: number;
  /** Value at pointerdown, for Escape. Never moves. */
  startValue: number;
  /** Last emitted value, so we only emit on change. */
  last: number;
  multiplier: number;
  dragging: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Snap to `step`, then round away float noise — a 0.1 multiplier on a 0.5 step
 *  otherwise produces values like 2.4000000000000004. */
const snap = (v: number, step: number) =>
  Math.round(Math.round(v / step) * step * 1e4) / 1e4;

const multiplierOf = (e: { shiftKey: boolean; altKey: boolean }) =>
  e.shiftKey ? SHIFT_MULTIPLIER : e.altKey ? ALT_MULTIPLIER : 1;

/**
 * Firefox-devtools style drag-to-scrub. A vertical drag of SCRUB_TRAVEL_PX
 * sweeps `span` value units (up increases); Shift coarsens ×10 and Alt refines
 * ×0.1. Emits every intermediate value with `transient: true` and exactly one
 * final value with `transient: false`, so callers can batch a gesture into a
 * single undo entry. A press that never crosses the 3px threshold is a click.
 *
 * Move/up/Escape are handled on `window` rather than via pointer capture, so a
 * drag that leaves the element keeps tracking (and so jsdom, which implements
 * no pointer capture, can drive the gesture in tests).
 */
export function useScrubDrag({
  value,
  min,
  max,
  step = 1,
  span,
  disabled = false,
  onScrub,
  onClick,
}: UseScrubDragArgs): ScrubDragBinding {
  const [active, setActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);

  // Latest props for the window listeners, which are bound once per gesture.
  // Written in an effect (never during render) so the listeners always read
  // current values without re-subscribing on every parent render.
  const latest = useRef({ min, max, step, span, onScrub, onClick });
  useEffect(() => {
    latest.current = { min, max, step, span, onScrub, onClick };
  });

  useEffect(() => {
    if (!active) return;

    const end = (commit: number | null) => {
      gesture.current = null;
      setActive(false);
      setIsDragging(false);
      if (commit !== null) latest.current.onScrub(commit, false);
      else latest.current.onClick?.();
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (!g.dragging) {
        if (Math.abs(e.clientY - g.anchorY) < DRAG_THRESHOLD_PX) return;
        g.dragging = true;
        setIsDragging(true);
      }
      const { min: lo, max: hi, step: st, span: sp, onScrub: emit } = latest.current;
      if (sp === null) return;

      const m = multiplierOf(e);
      if (m !== g.multiplier) {
        // Re-anchor rather than rescaling the whole delta, which would make the
        // value jump the instant a modifier is pressed.
        g.anchorY = e.clientY;
        g.anchorValue = g.last;
        g.multiplier = m;
      }

      const delta = (g.anchorY - e.clientY) * (sp / SCRUB_TRAVEL_PX) * m;
      const next = clamp(snap(g.anchorValue + delta, st), lo, hi);
      if (next !== g.last) {
        g.last = next;
        emit(next, true);
      }
    };

    const onUp = () => {
      const g = gesture.current;
      end(g?.dragging ? g.last : null);
    };

    // Escape before the drag threshold cancels outright: no commit, and no
    // click either — the press never became either gesture.
    const cancel = () => {
      gesture.current = null;
      setActive(false);
      setIsDragging(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const g = gesture.current;
      // Intermediates were never captured, so re-committing the start value
      // produces a no-op diff and leaves no undo entry behind.
      if (g?.dragging) end(g.startValue);
      else cancel();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || value === null || span === null || e.button !== 0) return;
    // Suppress the native focus so a press on the field body scrubs; the click
    // path focuses explicitly instead.
    e.preventDefault();
    gesture.current = {
      anchorY: e.clientY,
      anchorValue: value,
      startValue: value,
      last: value,
      multiplier: multiplierOf(e),
      dragging: false,
    };
    setActive(true);
  };

  return { onPointerDown, isDragging };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- --run src/ui/panels/controls/useScrubDrag.test.tsx`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/ui/panels/controls/useScrubDrag.ts src/ui/panels/controls/useScrubDrag.test.tsx
git commit -m "feat(controls): add useScrubDrag, a drag-to-scrub pointer gesture"
```

---

### Task 2: Capture-mode plumbing

**Files:**
- Modify: `src/ui/panels/useSelectionStyle.ts:15-23` (`SetPropArgs`), `:38-47` (`SelectionStyle`), `:82-103` (`update`/`setProp`)
- Modify: `src/lib/transform.ts:20-47` (`resizeElementDimension`), `:54-70` (`setContainerPadding`)
- Test: `src/ui/panels/useSelectionStyle.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  // useSelectionStyle
  setProp: (args: { prop: string; value: unknown; currentItemKey?: string;
                    ids?: SelectedElementIds; transient?: boolean }) => void;
  update: (ids: SelectedElementIds,
           updater: (el: SceneElement) => ElementUpdate,
           currentItems?: Record<string, unknown>,
           transient?: boolean) => void;
  // transform.ts
  resizeElementDimension(api, id, dimension, value, transient?: boolean): void
  setContainerPadding(api, id, value, transient?: boolean): void
  ```
  In every case `transient` defaults to `false`, so existing callers are unchanged.

**Context:** `CaptureUpdateAction.EVENTUALLY` schedules neither a capture nor a snapshot update (`vendor/excalidraw/packages/excalidraw/store.ts`, `commit()`), so the next `IMMEDIATELY` diffs against the pre-drag state. `NEVER` would advance the baseline — do not use it.

- [ ] **Step 1: Extend the Excalidraw mock and write the failing tests**

The existing mock at the top of `src/ui/panels/useSelectionStyle.test.tsx:8` stubs only `IMMEDIATELY`. Add `EVENTUALLY`:

```ts
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY", EVENTUALLY: "EVENTUALLY" },
  newElementWith: (el: Record<string, unknown>, updates: Record<string, unknown>) => ({
    ...el,
    ...updates,
    version: ((el.version as number) ?? 0) + 1,
  }),
}));
```

Append to the `describe("useSelectionStyle", ...)` block:

```tsx
  it("records setProp immediately by default", () => {
    const api = makeApi([rect("r")], { r: true });
    const { result } = renderHook(() => useSelectionStyle(api));
    act(() => result.current.setProp({ prop: "strokeColor", value: "#f00" }));
    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "IMMEDIATELY" }),
    );
  });

  it("defers a transient setProp so a gesture becomes one undo entry", () => {
    const api = makeApi([rect("r")], { r: true });
    const { result } = renderHook(() => useSelectionStyle(api));
    act(() => result.current.setProp({ prop: "strokeColor", value: "#f00", transient: true }));
    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "EVENTUALLY" }),
    );
  });

  it("passes the transient flag through update()", () => {
    const api = makeApi([rect("r")], { r: true });
    const { result } = renderHook(() => useSelectionStyle(api));
    act(() => result.current.update({ r: true }, () => ({ x: 5 }), undefined, true));
    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "EVENTUALLY" }),
    );
  });
```

Add `act` to the React Testing Library import at the top of the file:

```tsx
import { renderHook, act } from "@testing-library/react";
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run src/ui/panels/useSelectionStyle.test.tsx`
Expected: the two `EVENTUALLY` tests FAIL (received `"IMMEDIATELY"`); the default-behaviour test passes. TypeScript will also reject the `transient` property and the 4th `update` argument.

- [ ] **Step 3: Thread `transient` through `useSelectionStyle`**

In `src/ui/panels/useSelectionStyle.ts`, add to `SetPropArgs`:

```ts
  /** Restrict the write to these ids (defaults to the selection). */
  ids?: SelectedElementIds;
  /** Mid-gesture write: defer history so the whole drag is one undo entry. */
  transient?: boolean;
}
```

Update the `SelectionStyle` interface's `update` signature:

```ts
  update: (
    ids: SelectedElementIds,
    updater: (el: SceneElement) => ElementUpdate,
    currentItems?: Record<string, unknown>,
    transient?: boolean,
  ) => void;
```

Replace the `update` and `setProp` bodies:

```ts
  const update: SelectionStyle["update"] = (ids, updater, currentItems, transient = false) => {
    if (!api) return;
    // `newElementWith` bumps version/versionNonce so Excalidraw records the edit
    // in history (raw spreads read back fine but are never captured for undo).
    const next = updateSelected(api.getSceneElements(), ids, updater, (el, updates) =>
      newElementWith(el, updates as Partial<SceneElement>),
    );
    // The dynamic currentItem* keys can't be statically typed here; the cast is
    // localized to this scene-write boundary.
    api.updateScene({
      elements: next,
      appState: currentItems as UpdateAppState | undefined,
      // EVENTUALLY defers without advancing the history baseline, so the next
      // IMMEDIATELY diffs against the pre-gesture state. NEVER would *update*
      // the baseline and collapse undo to the last intermediate step.
      captureUpdate: transient
        ? CaptureUpdateAction.EVENTUALLY
        : CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const setProp = ({ prop, value, currentItemKey, ids, transient }: SetPropArgs) =>
    update(
      ids ?? selectedIds,
      (el) => ((el as Record<string, unknown>)[prop] === value ? null : { [prop]: value }),
      currentItemKey ? { [currentItemKey]: value } : undefined,
      transient,
    );
```

Also update the `setProp` doc comment on the interface (line ~38) to read:

```ts
  /** Apply a single property to the selection (or a custom id set) and set its
   *  default. Records one undo step unless `transient`, which defers history to
   *  the next non-transient write. */
```

- [ ] **Step 4: Thread `transient` through `transform.ts`**

In `src/lib/transform.ts`, add the parameter and shared resolution. Add near the top, under the `MIN_ELEMENT_SIZE` export:

```ts
/** Mid-gesture writes defer history so a whole scrub is one undo entry. */
const captureFor = (transient: boolean) =>
  transient ? CaptureUpdateAction.EVENTUALLY : CaptureUpdateAction.IMMEDIATELY;
```

`resizeElementDimension` — extend the signature and the final write:

```ts
export function resizeElementDimension(
  api: ExcalidrawAPI,
  id: string,
  dimension: "width" | "height",
  value: number,
  transient = false,
): void {
```

```ts
  const next = elements.map((el) => map.get(el.id) ?? el);
  api.updateScene({ elements: next, captureUpdate: captureFor(transient) });
}
```

`setContainerPadding` — the same two edits:

```ts
export function setContainerPadding(
  api: ExcalidrawAPI,
  id: string,
  value: number,
  transient = false,
): void {
```

```ts
  const next = elements.map((el) => map.get(el.id) ?? el);
  api.updateScene({ elements: next, captureUpdate: captureFor(transient) });
}
```

Both functions' doc comments end with "One undo step." / "as a single undo step." — extend each to "...as a single undo step (deferred to the next non-transient write when `transient`)."

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test -- --run src/ui/panels/useSelectionStyle.test.tsx && npm run typecheck`
Expected: PASS, and a clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels/useSelectionStyle.ts src/ui/panels/useSelectionStyle.test.tsx src/lib/transform.ts
git commit -m "feat(panels): thread a transient capture mode through the scene write paths"
```

---

### Task 3: `SliderInput` joins the transient protocol + the undo-batching proof

**Files:**
- Modify: `src/ui/panels/controls/SliderInput.tsx` (the `onChange` contract; the numeric field stays for now)
- Modify: `src/ui/panels/controls/SliderInput.test.tsx` (update two assertions, append four)
- Modify: `src/ui/panels/StrokePanel.tsx:203-208` (`setArrowheadSize`)
- Test: `e2e/stroke-panel.spec.ts` (append the undo test)

**Interfaces:**
- Consumes: `setProp({ ..., transient })` from Task 2.
- Produces: `SliderInput`'s `onChange` becomes `(value: number, transient: boolean) => void`. Every other prop — including `unit` and `hideValue` — is **unchanged**; the field is removed later, in Task 5, once nothing renders it.

**Context:** This task is deliberately ordered before the `NumberInput` work. The arrowhead sliders are the only in-app gesture that can validate the `EVENTUALLY` batching, and the spec flags that batching as inferred from the vendor source rather than observed. Prove it here, before the pattern spreads across twelve call sites.

It changes the contract **without** removing the numeric field, because `StrokePanel`'s Width row and `ColorPanel`'s opacity row still render `SliderInput` with a `unit` prop until Task 5. Stripping the field now would leave the tree failing to typecheck between tasks.

- [ ] **Step 1: Update two assertions and write the failing transient tests**

In `src/ui/panels/controls/SliderInput.test.tsx`, the two typed-commit assertions gain the flag:

- line 26: `expect(onChange).toHaveBeenLastCalledWith(20);` → `expect(onChange).toHaveBeenLastCalledWith(20, false);`
- line 35: `expect(onChange).toHaveBeenLastCalledWith(12);` → `expect(onChange).toHaveBeenLastCalledWith(12, false);`

The existing "commits live when the range slider moves" test asserts `toHaveBeenCalledWith(10)` — replace that whole test and append the rest:

```tsx
  it("emits transient values while dragging", () => {
    const onChange = vi.fn();
    render(<SliderInput value={4} min={0} max={100} onChange={onChange} ariaLabel="Stroke width" />);
    const range = screen.getByRole("slider", { name: "Stroke width" });
    fireEvent.change(range, { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith(10, true);
  });

  it("commits once on pointer release", () => {
    const onChange = vi.fn();
    render(<SliderInput value={4} min={0} max={100} onChange={onChange} ariaLabel="Stroke width" />);
    const range = screen.getByRole("slider", { name: "Stroke width" });
    fireEvent.change(range, { target: { value: "10" } });
    fireEvent.pointerUp(range);
    expect(onChange).toHaveBeenLastCalledWith(10, false);
    expect(onChange.mock.calls.filter(([, t]) => t === false)).toHaveLength(1);
  });

  it("does not commit again when blur follows pointer release", () => {
    const onChange = vi.fn();
    render(<SliderInput value={4} min={0} max={100} onChange={onChange} ariaLabel="Stroke width" />);
    const range = screen.getByRole("slider", { name: "Stroke width" });
    fireEvent.change(range, { target: { value: "10" } });
    fireEvent.pointerUp(range);
    fireEvent.blur(range);
    expect(onChange.mock.calls.filter(([, t]) => t === false)).toHaveLength(1);
  });

  it("commits after a keyboard adjustment", () => {
    const onChange = vi.fn();
    render(<SliderInput value={4} min={0} max={100} onChange={onChange} ariaLabel="Stroke width" />);
    const range = screen.getByRole("slider", { name: "Stroke width" });
    fireEvent.change(range, { target: { value: "5" } });
    fireEvent.keyUp(range, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(5, false);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run src/ui/panels/controls/SliderInput.test.tsx`
Expected: FAIL — `onChange` is called with a single argument, so every assertion carrying a `true`/`false` second argument fails.

- [ ] **Step 3: Give `SliderInput` the transient contract**

In `src/ui/panels/controls/SliderInput.tsx`, add the `useRef` import and change the `onChange` prop type:

```tsx
import { useRef } from "react";
import { useNumberField } from "./useNumberField";
```

```tsx
  /** `transient` is true for every value during a drag and false for typed
   *  commits and the single commit ending a drag, so a whole gesture can be
   *  one undo entry. */
  onChange: (value: number, transient: boolean) => void;
```

Inside the component, adapt the field's commits and add the range's gesture tracking:

```tsx
  const field = useNumberField({ value, min, max, onChange: (v) => onChange(v, false) });

  // The value of an uncommitted transient write, if any. Guards against the
  // three possible gesture-end events double-committing the same value.
  const pending = useRef<number | null>(null);

  const commit = () => {
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    onChange(next, false);
  };
```

Replace the range input's `onChange` and add the three end-of-gesture handlers:

```tsx
        onChange={(e) => {
          const next = Number(e.target.value);
          pending.current = next;
          onChange(next, true);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
```

Update the component's doc comment, which currently claims the slider commits live:

```tsx
/**
 * A range slider paired with a numeric field and an optional unit suffix. `null`
 * renders an empty field (mixed selection) with the slider parked at `min`.
 * Dragging the slider emits transient values live and commits once on release;
 * the numeric field commits only on blur or Enter so it doesn't churn while
 * typing.
 */
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- --run src/ui/panels/controls/SliderInput.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 5: Wire the arrowhead call sites**

In `src/ui/panels/StrokePanel.tsx`, replace `setArrowheadSize` (around line 203):

```tsx
  const setArrowheadSize = (
    which: "startArrowheadSize" | "endArrowheadSize",
    currentItemKey: string,
  ) =>
    (value: number, transient: boolean) =>
      sel.setProp({ prop: which, value, currentItemKey, ids: linearIds, transient });
```

The two `SliderInput` call sites need no edit — they already pass this function straight through, and `hideValue` stays until Task 5.

- [ ] **Step 6: Write the undo-batching e2e proof**

Append to `e2e/stroke-panel.spec.ts`:

```ts
test("an arrowhead-size drag records exactly one undo entry", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Arrow", 860, 320);

  const size = page.getByRole("slider", { name: "End arrowhead size" });
  await expect(size).toBeEnabled();
  const before = await size.inputValue();

  // Drag the thumb across the track in steps, so the gesture emits many
  // intermediate values rather than a single jump.
  const box = (await size.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();

  const after = await size.inputValue();
  expect(Number(after)).toBeGreaterThan(Number(before));

  // One undo must restore the pre-drag value: if the intermediates were each
  // captured, this would step back a single increment instead.
  await page.keyboard.press("Control+z");
  await expect(size).toHaveValue(before);
});
```

- [ ] **Step 7: Run the e2e proof**

Run: `npx playwright test e2e/stroke-panel.spec.ts`
Expected: PASS, all 4 tests.

**If the undo test fails**, the `EVENTUALLY` assumption is wrong and the rest of the plan's batching depends on it. Stop and report rather than working around it — the likely causes are (a) something else triggering an `IMMEDIATELY` capture mid-drag, or (b) the appState `currentItem*` write in `setProp` capturing separately from the element write. Diagnosing that is cheaper here than after eight more call sites depend on it.

- [ ] **Step 8: Run the full unit suite and commit**

```bash
npm test -- --run && npm run typecheck
git add src/ui/panels/controls/SliderInput.tsx src/ui/panels/controls/SliderInput.test.tsx \
        src/ui/panels/StrokePanel.tsx e2e/stroke-panel.spec.ts
git commit -m "feat(controls): batch a slider drag into a single undo entry"
```

---

### Task 4: `NumberInput` gains the scrub gesture

**Files:**
- Modify: `src/ui/panels/controls/NumberInput.tsx` (whole file)
- Modify: `src/ui/panels/controls/NumberInput.test.tsx` (update the `onChange` assertions, append scrub tests)
- Modify: `src/ui/panels/panels.css:297-321` (the `.flow-ctl-num` rules)

**Interfaces:**
- Consumes: `useScrubDrag`, `SCRUB_TRAVEL_PX` from Task 1.
- Produces: `NumberInput` with props
  ```ts
  { value: number | null; min?: number; max?: number; step?: number; unit?: string;
    scrubSpan?: number; onChange: (value: number, transient: boolean) => void;
    ariaLabel: string; disabled?: boolean; id?: string; className?: string }
  ```

**Context:** `step` stays `undefined` by default. It is forwarded to `useNumberField` only when a caller passes it, because a forwarded default of `1` would silently round the fractional values Transform's fields accept today. The scrub's own granularity defaults to `1` independently.

- [ ] **Step 1: Update the existing tests and write the failing scrub tests**

In `src/ui/panels/controls/NumberInput.test.tsx`, the four `onChange` assertions now carry the transient flag. Change:

- line 27: `expect(onChange).toHaveBeenCalledWith(24);` → `expect(onChange).toHaveBeenCalledWith(24, false);`
- line 37: `expect(onChange).toHaveBeenLastCalledWith(24);` → `expect(onChange).toHaveBeenLastCalledWith(24, false);`
- line 46: `expect(onChange).toHaveBeenLastCalledWith(1);` → `expect(onChange).toHaveBeenLastCalledWith(1, false);`

Add `fireEvent` to the RTL import, then append these tests inside the `describe`:

```tsx
  it("renders a scrub grip when the bounds give it a span", () => {
    const { container } = render(
      <NumberInput value={20} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip");
    expect(grip).toBeInTheDocument();
    // The input is the accessible control; the grip is decoration.
    expect(grip).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no grip when the bounds are infinite and no span is given", () => {
    const { container } = render(
      <NumberInput value={20} onChange={() => {}} ariaLabel="Opacity" />,
    );
    expect(container.querySelector(".flow-ctl-num__grip")).not.toBeInTheDocument();
  });

  it("scrubs from the grip, emitting transient values then one commit", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip")!;
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    // span defaults to max-min = 100 → 15px of a 150px travel = +10.
    expect(onChange).toHaveBeenLastCalledWith(60, false);
    expect(onChange.mock.calls.filter(([, t]) => t === true).length).toBeGreaterThan(0);
  });

  it("honours an explicit scrubSpan over the min/max range", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumberInput value={0} min={-1e6} max={1e6} scrubSpan={300} onChange={onChange} ariaLabel="X position" />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip")!;
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 250 });   // 50px → 300/150 × 50 = 100
    fireEvent.pointerUp(window, { clientY: 250 });
    expect(onChange).toHaveBeenLastCalledWith(100, false);
  });

  it("scrubs from the field body while it is unfocused", () => {
    const onChange = vi.fn();
    render(<NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).toHaveBeenLastCalledWith(60, false);
  });

  it("yields the field body to text selection once focused", () => {
    const onChange = vi.fn();
    render(<NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity") as HTMLInputElement;
    field.focus();
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("focuses and selects the field for a press that never became a drag", () => {
    render(<NumberInput value={50} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity") as HTMLInputElement;
    // `type="number"` inputs don't expose selectionStart/End — spy on select()
    // rather than asserting a selection range that throws for this input type.
    const select = vi.spyOn(field, "select");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerUp(window, { clientY: 300 });
    expect(field).toHaveFocus();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("does not scrub when disabled", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" disabled />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip")!;
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies an external id and className", () => {
    const { container } = render(
      <NumberInput value={20} min={5} max={100} id="grid-size" className="flow-num__control"
                   onChange={() => {}} ariaLabel="Grid size" />,
    );
    expect(screen.getByLabelText("Grid size")).toHaveAttribute("id", "grid-size");
    expect(container.querySelector(".flow-ctl-num")).toHaveClass("flow-num__control");
  });
```

Note: `container.querySelector` is used only for the grip, which is `aria-hidden` by design and so has no accessible query. Everything else queries by label.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run src/ui/panels/controls/NumberInput.test.tsx`
Expected: FAIL — no `.flow-ctl-num__grip` element, and the commit assertions receive one argument.

- [ ] **Step 3: Rewrite `NumberInput`**

Replace the whole of `src/ui/panels/controls/NumberInput.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useNumberField } from "./useNumberField";
import { useScrubDrag } from "./useScrubDrag";

interface NumberInputProps {
  /** Current value, or null when the selection is mixed (renders empty). */
  value: number | null;
  min?: number;
  max?: number;
  /** Granularity for the scrub gesture. When passed explicitly it also snaps
   *  typed values; left undefined, typed values are only range-clamped. */
  step?: number;
  /** Optional short unit suffix (e.g. "px"). */
  unit?: string;
  /** Value units a full drag traverses. Defaults to the min/max range, which is
   *  right wherever the bounds are a designed range; fields whose bounds are
   *  sanity clamps (position, size) pass their own. */
  scrubSpan?: number;
  /** `transient` is true for every value during a drag and false for typed
   *  commits and the single commit ending a drag. */
  onChange: (value: number, transient: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Associates an external <label htmlFor>. */
  id?: string;
  /** Extra class on the wrapper, for host-specific sizing. */
  className?: string;
}

/**
 * A numeric field that can be dragged like Firefox devtools' CSS inspector: hover
 * shows an ns-resize cursor, dragging up/down scrubs the value live, and a click
 * without movement focuses the field to type instead. A `↕` grip advertises the
 * gesture and keeps working while the field is focused, where the field body
 * yields to normal text selection.
 *
 * `null` renders empty (mixed selection) and disables the scrub. Typed values
 * commit on blur or Enter, never per keystroke; Escape reverts.
 */
export function NumberInput({
  value,
  min = -Infinity,
  max = Infinity,
  step,
  unit,
  scrubSpan,
  onChange,
  ariaLabel,
  disabled = false,
  id,
  className,
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const field = useNumberField({ value, min, max, step, onChange: (v) => onChange(v, false) });

  const range = max - min;
  const span = scrubSpan ?? (Number.isFinite(range) ? range : null);

  const scrub = useScrubDrag({
    value,
    min,
    max,
    step: step ?? 1,
    span,
    disabled,
    onScrub: onChange,
    onClick: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  });

  // Hold the resize cursor while the pointer is outside the field mid-drag.
  useEffect(() => {
    if (!scrub.isDragging) return;
    document.body.classList.add("flow-scrubbing");
    return () => document.body.classList.remove("flow-scrubbing");
  }, [scrub.isDragging]);

  return (
    <div
      className={`flow-ctl-num${className ? ` ${className}` : ""}`}
      aria-disabled={disabled || undefined}
    >
      {span !== null && (
        <span
          className="flow-ctl-num__grip"
          aria-hidden="true"
          onPointerDown={scrub.onPointerDown}
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path
              d="M4 1.5 L6.5 4.5 H1.5 Z M4 12.5 L6.5 9.5 H1.5 Z"
              fill="currentColor"
            />
          </svg>
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        type="number"
        className="flow-ctl-num__input"
        aria-label={ariaLabel}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        value={field.text}
        disabled={disabled}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        onChange={field.onChange}
        onKeyDown={field.onKeyDown}
        onPointerDown={(e) => {
          // A focused field is being edited: leave the body to text selection.
          if (document.activeElement === inputRef.current) return;
          scrub.onPointerDown(e);
        }}
      />
      {unit && <span className="flow-ctl-num__unit">{unit}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- --run src/ui/panels/controls/NumberInput.test.tsx`
Expected: PASS, 16 tests.

- [ ] **Step 5: Style the grip and cursors**

In `src/ui/panels/panels.css`, replace the `.flow-ctl-num` block (lines 297-321) with:

```css
.flow-ctl-num {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  /* A vertical scrub must not scroll the panel on touch. */
  touch-action: none;
}
.flow-ctl-num__grip {
  display: inline-flex;
  align-items: center;
  color: var(--flow-ink-muted);
  opacity: 0.45;
  cursor: ns-resize;
  /* The stylesheet has no duration token; 120ms matches its other hovers. */
  transition: opacity 120ms ease;
}
.flow-ctl-num:hover .flow-ctl-num__grip {
  opacity: 0.9;
}
.flow-ctl-num[aria-disabled] .flow-ctl-num__grip {
  opacity: 0.25;
  cursor: default;
}
.flow-ctl-num__input {
  width: 56px;
  padding: 3px 5px;
  font: inherit;
  font-size: 12px;
  text-align: right;
  border: 1px solid var(--flow-border);
  border-radius: var(--flow-radius-sm);
  background: #fff;
  color: var(--flow-ink);
  cursor: ns-resize;
}
/* Editing, not scrubbing. */
.flow-ctl-num__input:focus {
  outline: none;
  border-color: var(--flow-accent);
  box-shadow: 0 0 0 2px var(--flow-active);
  cursor: text;
}
.flow-ctl-num__input:disabled {
  cursor: default;
}
/* The grip is the affordance now — the spinners only steal width. */
.flow-ctl-num__input::-webkit-outer-spin-button,
.flow-ctl-num__input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}
.flow-ctl-num__input[type="number"] {
  appearance: textfield;
}
.flow-ctl-num__unit {
  font-size: 11px;
  color: var(--flow-ink-muted);
}
/* Set for the duration of a drag, so the cursor holds while the pointer
   travels outside the field. */
body.flow-scrubbing,
body.flow-scrubbing * {
  cursor: ns-resize !important;
}
```

The `--flow-ink-muted`, `--flow-border`, `--flow-radius-sm`, `--flow-accent` and `--flow-active` tokens are all already in use in this stylesheet.

- [ ] **Step 6: Verify the panels still render, then commit**

```bash
npm test -- --run && npm run typecheck
git add src/ui/panels/controls/NumberInput.tsx src/ui/panels/controls/NumberInput.test.tsx src/ui/panels/panels.css
git commit -m "feat(controls): give NumberInput a drag-to-scrub gesture and grip"
```

Note: the existing `NumberInput` call sites (Transform, Text) pass single-argument callbacks. TypeScript accepts those against the new two-argument `onChange` — a function that ignores a parameter is assignable — so the tree keeps compiling. Tasks 6-8 update them for behaviour, not to fix compile errors.

---

### Task 5: Stroke width and opacity drop their sliders

**Files:**
- Modify: `src/ui/panels/StrokePanel.tsx:1-5` (imports), `:210-225` (the Width row), `:265-297` (drop `hideValue`)
- Modify: `src/ui/panels/ColorPanel.tsx:1-6` (imports), `:59-84` (`onOpacity` + the opacity control)
- Modify: `src/ui/panels/controls/SliderInput.tsx` (strip the now-dead field)
- Modify: `src/ui/panels/controls/SliderInput.test.tsx` (drop the field tests)
- Modify: `src/ui/panels/panels.css:369-394` (delete the field rules)
- Modify: `src/ui/panels/StrokePanel.test.tsx:25-45`
- Modify: `src/ui/panels/ColorPanel.test.tsx:33,41`
- Modify: `e2e/stroke-panel.spec.ts:35`, `e2e/color-panel.spec.ts:66,81-82`, `e2e/drawing-defaults.spec.ts:48-50,73`

**Interfaces:**
- Consumes: `NumberInput` (Task 4), `setProp({ ..., transient })` (Task 2).
- Produces: `SliderInput` loses its `unit` and `hideValue` props, ending as `{ value, min, max, step?, onChange, ariaLabel, disabled? }`. Accessible names change: `"Stroke width value"` → `"Stroke width"`, `"Fill opacity value"` → `"Fill opacity"`, `"Stroke opacity value"` → `"Stroke opacity"`, `"Laser opacity value"` → `"Laser opacity"`.

**Context:** Once the Width and opacity rows move to `NumberInput`, the only `SliderInput` callers left are the two `hideValue` arrowhead sizes — so its numeric field becomes dead code and comes out in the same task, keeping every intermediate state compiling.

- [ ] **Step 1: Update the unit tests to the new control and names**

In `src/ui/panels/StrokePanel.test.tsx`, the width test currently asserts against the range slider. Replace lines 25-45's slider assertions so they target the field. The test that reads:

```tsx
    const slider = screen.getByLabelText("Stroke width");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "10");
```

becomes:

```tsx
    const width = screen.getByLabelText("Stroke width");
    expect(width).toHaveAttribute("min", "0");
    expect(width).toHaveAttribute("max", "10");
    expect(screen.queryByRole("slider", { name: "Stroke width" })).not.toBeInTheDocument();
```

and the two `screen.getByLabelText("Stroke width value")` assertions (lines 34, 44) become `screen.getByLabelText("Stroke width")`.

In `src/ui/panels/ColorPanel.test.tsx`, lines 33 and 41: `"Laser opacity value"` → `"Laser opacity"`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run src/ui/panels/StrokePanel.test.tsx src/ui/panels/ColorPanel.test.tsx`
Expected: FAIL. `"Stroke width"` still resolves to the *range slider*, so `queryByRole("slider", ...)` finds it and the no-slider assertion fails, and `toHaveValue(2)` fails because a range input reports the string `"2"`. In `ColorPanel`, `"Laser opacity"` does not exist at all.

- [ ] **Step 3: Convert the Width row**

In `src/ui/panels/StrokePanel.tsx`, swap the import on line 2:

```tsx
import { NumberInput } from "./controls/NumberInput";
```

`SliderInput` is still used by the two arrowhead rows, so keep that import too — the file imports both.

Replace the Width row's control:

```tsx
          <NumberInput
            value={widthDisplay}
            min={displayValue(MIN_STROKE_PX, units)}
            max={displayValue(MAX_STROKE_PX, units)}
            step={units === "px" ? 0.5 : unitStep(units)}
            unit={units}
            ariaLabel="Stroke width"
            onChange={(v, transient) =>
              sel.setProp({
                prop: "strokeWidth",
                value: toPx(v, units),
                currentItemKey: "currentItemStrokeWidth",
                transient,
              })
            }
          />
```

The span is left to default: `max - min` is the designed 0-10 range.

- [ ] **Step 4: Convert the opacity control**

In `src/ui/panels/ColorPanel.tsx`, swap the import on line 2 to `NumberInput` (`SliderInput` is no longer used in this file — remove it):

```tsx
import { NumberInput } from "./controls/NumberInput";
```

`onOpacity` must carry the flag through to the write. Replace it (line ~59):

```tsx
  const onOpacity = (next: number, transient: boolean) => {
    const base = hue === MIXED || isTransparent ? "#1e1e1e" : hue;
    write(combineColorAlpha(base, next), transient);
  };
```

`write` takes the flag too (line ~52). The `onWrite` hatch used by the always-global Laser row persists a preference rather than writing elements, so it has no history to defer — it ignores the flag:

```tsx
  const write = (color: string, transient = false) =>
    onWrite ? onWrite(color) : sel.setProp({ prop, value: color, currentItemKey, ids, transient });
```

`onColor` calls `write(...)` with one argument and keeps committing immediately — no change needed there.

Replace the control:

```tsx
        <NumberInput
          value={isTransparent ? 0 : alpha === MIXED ? null : alpha}
          min={0}
          max={100}
          unit="%"
          onChange={onOpacity}
          ariaLabel={`${label} opacity`}
          disabled={disabled || isTransparent}
        />
```

Update the `ColorRow` doc comment (line ~26-32), which says "opacity is a separate slider":

```tsx
/**
 * One "color + opacity" row. The swatch edits hue only; opacity is a separate
 * drag-to-scrub field. They are combined into an 8-digit hex written to the
 * element so each color carries its own opacity (Excalidraw's element `opacity`
 * is a single value and can't do this). MIXED selections show an indeterminate
 * swatch and an empty opacity field.
 */
```

- [ ] **Step 5: Strip `SliderInput`'s dead numeric field**

Nothing renders it now — the two arrowhead call sites both pass `hideValue`. Remove that prop from both blocks in `src/ui/panels/StrokePanel.tsx` (they keep every other prop), then reduce `src/ui/panels/controls/SliderInput.tsx` to:

```tsx
import { useRef } from "react";

interface SliderInputProps {
  /** Current value, or null when the selection is mixed. */
  value: number | null;
  min: number;
  max: number;
  step?: number;
  /** `transient` is true for every value during a drag and false for the single
   *  commit at the end, so a whole gesture is one undo entry. */
  onChange: (value: number, transient: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A bare range slider, for values where the exact number is meaningless — the
 * per-end arrowhead sizes, which are a factor of stroke width. Every value with
 * a meaningful number uses NumberInput's drag-to-scrub field instead.
 *
 * `null` parks the slider at `min` (mixed selection). Dragging emits transient
 * values live; the single commit fires on release — pointerup, keyup or blur,
 * whichever ends the gesture, and only once.
 */
export function SliderInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  disabled = false,
}: SliderInputProps) {
  // The value of an uncommitted transient write, if any. Guards against the
  // three possible gesture-end events double-committing the same value.
  const pending = useRef<number | null>(null);

  const commit = () => {
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    onChange(next, false);
  };

  return (
    <div className="flow-ctl-slider" aria-disabled={disabled || undefined}>
      <input
        type="range"
        className="flow-ctl-slider__range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          pending.current = next;
          onChange(next, true);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}
```

In `src/ui/panels/controls/SliderInput.test.tsx`, delete the five tests that exercise the removed field — "shows the current value and unit", "renders an empty field for a mixed (null) value", "commits the numeric field only on Enter, clamped to range", "commits the numeric field on blur", and "hideValue renders only the range slider" — and replace the "disables both inputs when disabled" test with:

```tsx
  it("parks at min for a mixed (null) value", () => {
    render(<SliderInput value={null} min={2} max={12} onChange={() => {}} ariaLabel="Stroke width" />);
    expect(screen.getByRole("slider", { name: "Stroke width" })).toHaveValue("2");
  });

  it("renders no numeric field", () => {
    render(<SliderInput value={6} min={2} max={12} onChange={() => {}} ariaLabel="Stroke width" />);
    expect(screen.queryByLabelText("Stroke width value")).not.toBeInTheDocument();
  });

  it("disables the slider when disabled", () => {
    render(<SliderInput value={4} min={0} max={100} onChange={() => {}} ariaLabel="Stroke width" disabled />);
    expect(screen.getByRole("slider", { name: "Stroke width" })).toBeDisabled();
  });
```

The four transient tests from Task 3 stay as they are. Drop the now-unused `userEvent` import.

In `src/ui/panels/panels.css`, delete the four rule blocks that styled that field (lines 369-394) — `.flow-ctl-slider__field`, `.flow-ctl-slider__num`, `.flow-ctl-slider__num:focus` and `.flow-ctl-slider__unit`. Keep `.flow-ctl-slider` and `.flow-ctl-slider__range`.

- [ ] **Step 6: Run the unit tests and verify they pass**

Run: `npm test -- --run && npm run typecheck`
Expected: PASS across the suite — `SliderInput.test.tsx` at 7 tests.

- [ ] **Step 7: Update the e2e selectors**

Four call sites, all a straight rename:

- `e2e/stroke-panel.spec.ts:35` — `page.getByLabel("Stroke width value")` → `page.getByLabel("Stroke width")`
- `e2e/color-panel.spec.ts:66` — `page.getByLabel("Stroke opacity value")` → `page.getByLabel("Stroke opacity")`
- `e2e/color-panel.spec.ts:81-82` — both `page.getByLabel("Fill opacity value")` → `page.getByLabel("Fill opacity")`
- `e2e/drawing-defaults.spec.ts:73` — `page.getByLabel("Stroke width value")` → `page.getByLabel("Stroke width")`

`e2e/drawing-defaults.spec.ts:43-51` asserts the *slider's* range. Rewrite that test against the field:

```ts
test("the stroke width field spans 0 to 10px", async ({ page }) => {
```

and replace its three assertion lines:

```ts
  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveAttribute("min", "0");
  await expect(width).toHaveAttribute("max", "10");
  await expect(page.getByRole("slider", { name: "Stroke width" })).toHaveCount(0);
```

Keep the surrounding setup in that test as-is.

- [ ] **Step 8: Add the headline scrub e2e**

Append to `e2e/stroke-panel.spec.ts`:

```ts
test("scrubbing the stroke width field changes the value in one undo entry", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveValue("2");

  // Drag up over the field: span is the 0-10 range, so 150px sweeps the lot.
  const box = (await width.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 12 });
  await page.mouse.up();

  await expect(width).toHaveValue("6");
  await page.keyboard.press("Control+z");
  await expect(width).toHaveValue("2");
});
```

- [ ] **Step 9: Run the affected e2e specs**

Run: `npx playwright test e2e/stroke-panel.spec.ts e2e/color-panel.spec.ts e2e/drawing-defaults.spec.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/ui/panels/StrokePanel.tsx src/ui/panels/StrokePanel.test.tsx \
        src/ui/panels/ColorPanel.tsx src/ui/panels/ColorPanel.test.tsx \
        src/ui/panels/controls/SliderInput.tsx src/ui/panels/controls/SliderInput.test.tsx \
        src/ui/panels/panels.css \
        e2e/stroke-panel.spec.ts e2e/color-panel.spec.ts e2e/drawing-defaults.spec.ts
git commit -m "feat(panels): replace the stroke width and opacity sliders with scrub fields"
```

---

### Task 6: Transform panel spans and transient writes

**Files:**
- Modify: `src/ui/panels/TransformPanel.tsx:60-79` (the setters), `:86-178` (the seven `NumberInput` call sites)
- Test: `src/ui/panels/TransformPanel.test.tsx`

**Interfaces:**
- Consumes: `NumberInput` `scrubSpan` (Task 4); `resizeElementDimension`/`setContainerPadding` `transient` (Task 2); `sel.update(..., transient)` (Task 2).
- Produces: no new API.

**Context:** These fields' `min`/`max` are sanity clamps (`MAX_SIZE = 1e5`, `MAX_COORD = 1e6`), not designed ranges, so each passes an explicit span. Rotation is the exception — its 0-360 bounds *are* the range, so it passes none.

- [ ] **Step 1: Write the failing test**

`src/ui/panels/TransformPanel.test.tsx` already mocks `../../lib/transform` (so `resizeElementDimension` is a spy) and builds its selection with `mockSel(elements, selectedIds)`, which returns `{ sel, update }`. Its `rect()` helper produces an element at `x: 10, y: 20, width: 100, height: 50`. Reuse all of that.

Add `fireEvent` to the RTL import on line 2, import the mocked helper so it can be asserted on, and append these tests:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
```

```tsx
import { resizeElementDimension } from "../../lib/transform";
```

```tsx
  // Field order in the panel: W, H, X, Y, Rotation, Radius, Padding — every one
  // has finite bounds, so every one renders a grip.
  const gripAt = (container: HTMLElement, index: number) =>
    container.querySelectorAll(".flow-ctl-num__grip")[index];

  const scrub = (grip: Element, dy: number) => {
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 300 - dy });
    fireEvent.pointerUp(window, { clientY: 300 - dy });
  };

  it("scrubs X with a 300-unit span, deferring history until release", () => {
    const { sel, update } = mockSel([rect()], { a: true });
    const { container } = render(<TransformPanel sel={sel} api={api} />);

    scrub(gripAt(container, 2), 15); // 15px × (300/150) = +30, from x=10

    const flags = update.mock.calls.map((call) => call[3]);
    expect(flags.length).toBeGreaterThan(1);
    expect(flags.slice(0, -1).every((f) => f === true)).toBe(true);
    expect(flags.at(-1)).toBe(false);

    // The last call's updater carries the committed value.
    const updater = update.mock.calls.at(-1)![1] as (el: El) => Record<string, number>;
    expect(updater(rect())).toEqual({ x: 40 });
  });

  it("scrubs width through the resize helper with the transient flag", () => {
    const { sel } = mockSel([rect()], { a: true });
    const { container } = render(<TransformPanel sel={sel} api={api} />);

    scrub(gripAt(container, 0), 15); // +30, from width=100

    const calls = vi.mocked(resizeElementDimension).mock.calls;
    expect(calls.at(-1)).toEqual([api, "a", "width", 130, false]);
    expect(calls.slice(0, -1).every((c) => c[4] === true)).toBe(true);
  });

  it("gives rotation no explicit span, sweeping its full 0-360 range", () => {
    const { sel, update } = mockSel([rect()], { a: true });
    const { container } = render(<TransformPanel sel={sel} api={api} />);

    scrub(gripAt(container, 4), 75); // half the travel → half of 360 = +180

    const updater = update.mock.calls.at(-1)![1] as (el: El) => { angle: number };
    expect(updater(rect()).angle).toBeCloseTo(Math.PI, 5);
  });
```

Reset the `resizeElementDimension` spy between tests. If the file has no `beforeEach`, add one at the top of the `describe`:

```tsx
  beforeEach(() => {
    vi.mocked(resizeElementDimension).mockClear();
  });
```

and add `beforeEach` to the `vitest` import on line 1.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run src/ui/panels/TransformPanel.test.tsx`
Expected: FAIL — `update` is called with only 3 arguments, so every `flags` entry is `undefined`, and `resizeElementDimension` is called with 4.

- [ ] **Step 3: Forward `transient` through the setters**

In `src/ui/panels/TransformPanel.tsx`, replace the five setters:

```tsx
  const setDimension = (dimension: "width" | "height", value: number, transient: boolean) => {
    if (el && api) resizeElementDimension(api, el.id, dimension, value, transient);
  };
  const setCoord = (prop: "x" | "y", value: number, transient: boolean) => {
    if (el) sel.update({ [el.id]: true }, () => ({ [prop]: value }), undefined, transient);
  };
  const setAngle = (deg: number, transient: boolean) => {
    if (!el) return;
    // The bound text (if any) carries its own angle, so rotate it in lockstep.
    const boundTextId = sel.elements.find(
      (e) => e.type === "text" && (e as { containerId?: string }).containerId === el.id,
    )?.id;
    const ids = boundTextId ? { [el.id]: true, [boundTextId]: true } : { [el.id]: true };
    sel.update(ids, () => ({ angle: degToRad(deg) }), undefined, transient);
  };
  const setRadius = (value: number, transient: boolean) => {
    if (radiusEl) {
      sel.update({ [radiusEl.id]: true }, () => cornerRadiusUpdate(radiusEl, value), undefined, transient);
    }
  };
  const setPadding = (value: number, transient: boolean) => {
    if (el && api) setContainerPadding(api, el.id, value, transient);
  };
```

- [ ] **Step 4: Add the spans to the seven call sites**

Width and Height gain `scrubSpan={300}` and pass the flag through:

```tsx
            <NumberInput
              value={num(el?.width)}
              min={MIN_ELEMENT_SIZE}
              max={MAX_SIZE}
              scrubSpan={300}
              ariaLabel="Width"
              disabled={sizeDisabled}
              onChange={(n, transient) => setDimension("width", n, transient)}
            />
```

```tsx
            <NumberInput
              value={num(el?.height)}
              min={MIN_ELEMENT_SIZE}
              max={MAX_SIZE}
              scrubSpan={300}
              ariaLabel="Height"
              disabled={sizeDisabled}
              onChange={(n, transient) => setDimension("height", n, transient)}
            />
```

X and Y likewise:

```tsx
            <NumberInput
              value={num(el?.x)}
              min={-MAX_COORD}
              max={MAX_COORD}
              scrubSpan={300}
              ariaLabel="X position"
              disabled={disabled}
              onChange={(n, transient) => setCoord("x", n, transient)}
            />
```

```tsx
            <NumberInput
              value={num(el?.y)}
              min={-MAX_COORD}
              max={MAX_COORD}
              scrubSpan={300}
              ariaLabel="Y position"
              disabled={disabled}
              onChange={(n, transient) => setCoord("y", n, transient)}
            />
```

Rotation passes **no** span — 0-360 is already the range:

```tsx
          <NumberInput
            value={el ? normDeg(radToDeg(el.angle)) : null}
            min={0}
            max={360}
            unit="°"
            ariaLabel="Rotation"
            disabled={angleDisabled}
            onChange={setAngle}
          />
```

Radius and padding take `scrubSpan={200}`:

```tsx
          <NumberInput
            value={radiusValue}
            min={0}
            max={MAX_SIZE}
            scrubSpan={200}
            unit="px"
            ariaLabel="Corner radius"
            disabled={radiusDisabled}
            onChange={setRadius}
          />
```

```tsx
          <NumberInput
            value={paddingValue}
            min={0}
            max={MAX_SIZE}
            scrubSpan={200}
            unit="px"
            ariaLabel="Padding"
            disabled={paddingDisabled}
            onChange={setPadding}
          />
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test -- --run src/ui/panels/TransformPanel.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Verify in the running app, then commit**

Run: `npx playwright test e2e/transform-panel.spec.ts`
Expected: PASS — the existing spec exercises typed entry, which must be unaffected.

```bash
git add src/ui/panels/TransformPanel.tsx src/ui/panels/TransformPanel.test.tsx
git commit -m "feat(transform): scrubbable W/H/X/Y/rotation/radius/padding with batched undo"
```

---

### Task 7: Font size scrubs, commits on release

**Files:**
- Modify: `src/ui/panels/TextPanel.tsx:1-6` (imports), `:95-116` (the Size row)
- Create: `src/ui/panels/TextPanel.test.tsx` (the panel has no unit test today)

**Interfaces:**
- Consumes: `NumberInput` `scrubSpan` (Task 4).
- Produces: no new API.

**Context:** Font size writes through `sel.executeAction("changeFontSize", n)`, and that action hardcodes `CaptureUpdateAction.IMMEDIATELY` in the vendor (`packages/excalidraw/actions/actionProperties.tsx`), which flow will not fork. So this field holds transient values in local state — the digits track the drag, the canvas does not — and fires the action once on release. It is the one field without live canvas preview, by design.

- [ ] **Step 1: Write the failing test**

`TextPanel` takes only `{ sel }` and derives `disabled` from `sel.hasText`, reading font size off `sel.textTargetIds`. Create `src/ui/panels/TextPanel.test.tsx`, modelling the fake `SelectionStyle` on the `mockSel` helper in `src/ui/panels/StrokePanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TextPanel } from "./TextPanel";
import type { SelectionStyle } from "./useSelectionStyle";

const textEl = { id: "t", type: "text", fontSize: 20, fontFamily: 1, textAlign: "left" };

function mockSel(over: Record<string, unknown> = {}) {
  const executeAction = vi.fn();
  const sel = {
    elements: [textEl],
    appState: null,
    selectedIds: { t: true },
    textTargetIds: { t: true },
    hasSelection: true,
    selectedCount: 1,
    hasText: true,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction,
    ...over,
  } as unknown as SelectionStyle;
  return { sel, executeAction };
}

describe("TextPanel", () => {
  it("shows the selected text's font size", () => {
    const { sel } = mockSel();
    render(<TextPanel sel={sel} />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(20);
  });

  it("shows scrubbed digits without writing, then commits once on release", () => {
    const { sel, executeAction } = mockSel();
    const { container } = render(<TextPanel sel={sel} />);
    const grip = container.querySelectorAll(".flow-ctl-num__grip")[0];

    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 290 }); // 10px × (150/150) = +10
    // The digits track the drag; the canvas deliberately does not, because
    // Excalidraw's changeFontSize action always captures history.
    expect(screen.getByLabelText("Font size value")).toHaveValue(30);
    expect(executeAction).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { clientY: 290 });
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledWith("changeFontSize", 30);
  });

  it("still commits a typed size on Enter", async () => {
    const { sel, executeAction } = mockSel();
    render(<TextPanel sel={sel} />);
    const field = screen.getByLabelText("Font size value");
    fireEvent.change(field, { target: { value: "42" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(executeAction).toHaveBeenLastCalledWith("changeFontSize", 42);
  });

  it("disables the field with no text selected", () => {
    const { sel } = mockSel({ hasText: false, textTargetIds: {} });
    render(<TextPanel sel={sel} />);
    expect(screen.getByLabelText("Font size value")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run src/ui/panels/TextPanel.test.tsx`
Expected: the two read-only tests PASS; the scrub test FAILS because `executeAction` fires during the move rather than only on release.

- [ ] **Step 3: Hold transient values in local state**

In `src/ui/panels/TextPanel.tsx`, add the React import at the top:

```tsx
import { useState } from "react";
```

Inside the component, above the `return`, add:

```tsx
  // Font size can't defer its history (Excalidraw's changeFontSize action always
  // captures), so a scrub previews in the field only and writes once on release.
  const [scrubSize, setScrubSize] = useState<number | null>(null);
```

Replace the manual-size `NumberInput`:

```tsx
          <NumberInput
            value={scrubSize ?? (fontSizeNum === MIXED ? null : fontSizeNum)}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            scrubSpan={150}
            unit="px"
            ariaLabel="Font size value"
            disabled={disabled}
            onChange={(n, transient) => {
              if (transient) {
                setScrubSize(n);
                return;
              }
              // Write first, so the field reads the committed value on the very
              // next render rather than flashing the pre-drag one.
              sel.executeAction("changeFontSize", n);
              setScrubSize(null);
            }}
          />
```

Update the comment above it, which currently describes only the preset behaviour:

```tsx
          {/* Manual size. Reflects the current value (incl. a preset click); a
              custom value simply won't match any S/M/L/XL, so none stays lit.
              Dragging previews in the field and commits on release. */}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- --run src/ui/panels/TextPanel.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx playwright test e2e/text-panel.spec.ts
git add src/ui/panels/TextPanel.tsx src/ui/panels/TextPanel.test.tsx
git commit -m "feat(text): scrubbable font size that commits once on release"
```

---

### Task 8: Preferences grid size uses `NumberInput`

**Files:**
- Modify: `src/ui/PreferencesDialog.tsx:1-10` (imports), `:56-66` (delete the hand-rolled field), `:178-200` (the markup)
- Modify: `src/ui/preferences-dialog.css:111-134`
- Test: `src/ui/PreferencesDialog.test.tsx`

**Interfaces:**
- Consumes: `NumberInput` `id` + `className` (Task 4).
- Produces: no new API. The grid-size input keeps its `id`/label association and its 5rem dialog sizing.

**Context:** This deletes the last duplicate of `useNumberField`'s wiring outside `NumberInput`, and grid size (5-100) gets scrubbing from its own bounds with no span. The dialog styles its field differently from the panels, hence `className`.

- [ ] **Step 1: Write the failing test**

`src/ui/PreferencesDialog.test.tsx` renders through a `setup(overrides)` helper that returns the spies but not `container`, so query the grip off `document`. Grid size is `MIN 5 / MAX 100 / STEP 5` (`src/lib/grid.ts:5-7`), giving a default span of 95.

Add `fireEvent` to the RTL import and append:

```tsx
  it("keeps the label associated with the grid size field", () => {
    setup();
    expect(screen.getByLabelText("Grid size")).toHaveValue(20);
  });

  it("scrubs the grid size, snapped to the step", () => {
    const { onChangeGridSize } = setup();
    const grip = document.querySelector(".flow-ctl-num__grip")!;

    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    // span 95 over 150px → 15px ≈ +9.5, from 20 → 29.5, snapped to step 5 → 30.
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });

    expect(onChangeGridSize).toHaveBeenLastCalledWith(30);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run src/ui/PreferencesDialog.test.tsx`
Expected: FAIL — no `.flow-ctl-num__grip` in the dialog.

- [ ] **Step 3: Replace the hand-rolled field**

In `src/ui/PreferencesDialog.tsx`, swap the `useNumberField` import for `NumberInput`:

```tsx
import { NumberInput } from "./panels/controls/NumberInput";
```

Delete the `gridField` block (lines 57-66) — the comment above it and the `useNumberField` call both go. Keep `const gridSizeId = useId();`.

Replace the markup:

```tsx
            {category === "general" && (
              <div className="flow-num">
                <label className="flow-num__label" htmlFor={gridSizeId}>
                  Grid size
                </label>
                <NumberInput
                  id={gridSizeId}
                  className="flow-num__control"
                  value={gridSize}
                  min={MIN_GRID_SIZE}
                  max={MAX_GRID_SIZE}
                  step={GRID_SIZE_STEP}
                  unit="px"
                  ariaLabel="Grid size"
                  onChange={(n) => onChangeGridSize(n)}
                />
              </div>
            )}
```

`onChange` drops the transient flag deliberately: a preference write has no scene history to defer, so every value persists as it is dragged.

Note the input now carries **both** an `id`-associated `<label>` and an `aria-label`. The `aria-label` wins for the accessible name; both read "Grid size", so they agree.

- [ ] **Step 4: Rescope the dialog CSS**

In `src/ui/preferences-dialog.css`, `.flow-num__control` now lands on `NumberInput`'s wrapper, and `.flow-num__input` / `.flow-num__suffix` no longer match anything. Replace lines 111-134 with:

```css
.flow-num__control {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  width: fit-content;
}
/* The dialog's field is larger than the panels' — override NumberInput's
   compact panel sizing without touching the shared control. */
.flow-num__control .flow-ctl-num__input {
  font-size: 0.875rem;
  width: 5rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid #d6dae4;
  border-radius: 8px;
  background: #fbfcfe;
  color: #4a5163;
  text-align: left;
}
.flow-num__control .flow-ctl-num__input:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: -2px;
}
.flow-num__control .flow-ctl-num__unit {
  font-size: 0.8125rem;
  color: #6b7280;
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test -- --run && npm run typecheck`
Expected: PASS across the suite.

- [ ] **Step 6: Check the dialog visually, then commit**

Run: `npx playwright test e2e/grid-size.spec.ts e2e/menu-preferences.spec.ts`
Expected: PASS. If either spec selects the old `.flow-num__input` class, update the selector to `.flow-ctl-num__input` or, better, `getByLabel("Grid size")`.

```bash
git add src/ui/PreferencesDialog.tsx src/ui/PreferencesDialog.test.tsx src/ui/preferences-dialog.css
git commit -m "refactor(prefs): build grid size on NumberInput so it scrubs too"
```

---

### Task 9: Full verification and memory

**Files:**
- Create: `.claude/memory/scrub-numeric-inputs.md`
- Modify: `.claude/memory/MEMORY.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the repo-local memory entry `CLAUDE.md` requires at the end of substantial sessions.

- [ ] **Step 1: Run the entire suite**

```bash
npm test -- --run
npm run typecheck
npx playwright test
```

Expected: all green. Fix any failure in the implementation, never by weakening a test.

- [ ] **Step 2: Manually check the gesture in the app**

Run `npm run dev` and confirm, on a selected rectangle:

- Hovering any numeric field shows the `↕` cursor and the grip darkens.
- Dragging stroke width up thickens the outline live; one Ctrl+Z restores it.
- Clicking a field selects its digits for typing; typing and Enter still commits.
- Shift-dragging X moves the shape ~10× faster; Alt-dragging inches it.
- Escape mid-drag snaps the value back with no undo entry left behind.
- Dragging font size moves the digits only, and the text resizes on release.

- [ ] **Step 3: Write the memory file**

Create `.claude/memory/scrub-numeric-inputs.md`:

```markdown
# Drag-to-scrub numeric inputs

**Shipped:** 2026-08-05. Spec: `docs/superpowers/specs/2026-08-05-scrub-numeric-inputs-design.md`.
Plan: `docs/superpowers/plans/2026-08-05-scrub-numeric-inputs.md`.

Every numeric field in the panels scrubs like Firefox devtools' CSS inspector.
The range sliders beside stroke width and opacity are gone; the two arrowhead
sizes keep bare sliders because their number is meaningless.

## How it works

- `src/ui/panels/controls/useScrubDrag.ts` owns the gesture. 150px of vertical
  drag sweeps `span` value units (up increases), Shift ×10, Alt ×0.1, 3px drag
  threshold, Escape reverts to the gesture's start value.
- Listeners live on `window`, not pointer capture — jsdom implements no
  `setPointerCapture`, and window listeners survive a drag leaving the field.
- `span` defaults to `max - min`. Fields whose bounds are sanity clamps pass
  their own: W/H/X/Y 300, radius/padding 200, font size 150.

## The undo rule

Callbacks are `(value, transient)`. `transient` writes use
`CaptureUpdateAction.EVENTUALLY`, the commit uses `IMMEDIATELY`, so one gesture
is one undo entry. **Never use `NEVER` for this** — it advances the history
snapshot, so undo would only step back the last intermediate value.

Threaded through `useSelectionStyle.setProp`/`update` and `lib/transform.ts`'s
`resizeElementDimension`/`setContainerPadding`, all defaulting to non-transient.

## Font size is the exception

Excalidraw's `changeFontSize` action hardcodes `IMMEDIATELY` and flow does not
fork it, so `TextPanel` holds the in-progress value in local state and calls
`executeAction` once on release. Its digits track the drag; the canvas does not.

## Gotchas

- `NumberInput`'s `step` is forwarded to `useNumberField` only when a caller
  passes it explicitly. A default of 1 would round the fractional values the
  Transform fields accept.
- Field accessible names lost the `" value"` suffix (`"Stroke width"`,
  `"Fill opacity"`) when the sibling slider disappeared. Font size kept
  `"Font size value"` — its S/M/L/XL group owns `"Font size"`.
```

- [ ] **Step 4: Index it and commit**

Append one line to `.claude/memory/MEMORY.md`, matching the existing format:

```markdown
- [Scrub numeric inputs](scrub-numeric-inputs.md) — Firefox-devtools drag-to-scrub on every panel number field; sliders retired except arrowhead size; transient/EVENTUALLY undo batching; shipped 2026-08-05
```

```bash
git add .claude/memory/scrub-numeric-inputs.md .claude/memory/MEMORY.md
git commit -m "docs(memory): record the drag-to-scrub numeric input work"
```
