import { renderHook } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { useDrag } from "./useDrag";

/** jsdom has no PointerEvent, but MouseEvent carries clientX/Y and dispatches to
 *  the window "pointermove"/"pointerup" listeners useDrag registers. */
function fireWindow(type: string, clientX: number, clientY: number): void {
  window.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

function pointerDown(clientX: number, clientY: number): React.PointerEvent {
  return {
    button: 0,
    clientX,
    clientY,
    preventDefault() {},
    target: document.body,
  } as unknown as React.PointerEvent;
}

describe("useDrag", () => {
  it("onEnd reads the latest closure, not the pointer-down snapshot", () => {
    // Regression: onEnd used to be frozen at pointer-down, so a callback reading
    // React state set mid-drag (e.g. the sub-panel drop index) always saw the
    // stale initial value and skipped its dispatch.
    const ended: number[] = [];
    const { result, rerender } = renderHook(
      ({ v }: { v: number }) =>
        useDrag({ threshold: 1, onMove: () => {}, onEnd: () => ended.push(v) }),
      { initialProps: { v: 1 } },
    );

    act(() => result.current(pointerDown(0, 0)));

    // Value changes after the drag started — a fresh onEnd closure is created.
    rerender({ v: 2 });

    act(() => fireWindow("pointermove", 20, 20));
    act(() => fireWindow("pointerup", 20, 20));

    expect(ended).toEqual([2]);
  });

  it("onMove also tracks the latest closure", () => {
    const moved: number[] = [];
    const { result, rerender } = renderHook(
      ({ v }: { v: number }) =>
        useDrag({ threshold: 1, onMove: () => moved.push(v), onEnd: () => {} }),
      { initialProps: { v: 1 } },
    );

    act(() => result.current(pointerDown(0, 0)));
    rerender({ v: 2 });
    act(() => fireWindow("pointermove", 20, 20));

    expect(moved).toEqual([2]);
  });
});
