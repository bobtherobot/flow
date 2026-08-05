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
