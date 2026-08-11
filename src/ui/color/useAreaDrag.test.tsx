import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAreaDrag } from "./useAreaDrag";

function Harness({ onChange }: { onChange: (p: { x: number; y: number }, t: boolean) => void }) {
  const { ref, onPointerDown } = useAreaDrag({ onChange });
  return <div ref={ref} data-testid="area" onPointerDown={onPointerDown} />;
}

/** jsdom gives every element a zero-size box; fake a 200x100 one at the origin. */
function stubBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

let onChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  stubBox(screen.getByTestId("area"));
});

function press(clientX: number, clientY: number) {
  screen.getByTestId("area").dispatchEvent(
    new PointerEvent("pointerdown", { clientX, clientY, bubbles: true, pointerId: 1, button: 0 }),
  );
}

describe("useAreaDrag", () => {
  it("reports a normalized position on press, transiently", () => {
    press(100, 50);
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 }, true);
  });

  it("tracks pointermove on the window", () => {
    press(0, 0);
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 25, pointerId: 1 }));
    expect(onChange).toHaveBeenCalledWith({ x: 0.25, y: 0.25 }, true);
  });

  it("clamps outside the box", () => {
    press(0, 0);
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: -80, clientY: 400, pointerId: 1 }));
    expect(onChange).toHaveBeenCalledWith({ x: 0, y: 1 }, true);
  });

  it("commits non-transiently on pointerup", () => {
    press(100, 50);
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, clientY: 50, pointerId: 1 }));
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 }, false);
  });

  it("stops tracking after release", () => {
    press(0, 0);
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 0, pointerId: 1 }));
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 50, pointerId: 1 }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
