import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaturationBox } from "./SaturationBox";

function stubBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

const base = { h: 200, s: 50, v: 50 };

describe("SaturationBox", () => {
  it("maps the top-right corner to full saturation and value", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={base} onChange={onChange} />);
    const el = screen.getByRole("application", { name: /saturation/i });
    stubBox(el);
    fireEvent.pointerDown(el, { clientX: 200, clientY: 0, button: 0 });
    expect(onChange).toHaveBeenCalledWith({ s: 100, v: 100 }, true);
  });

  it("maps the bottom-left corner to zero saturation and value", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={base} onChange={onChange} />);
    const el = screen.getByRole("application", { name: /saturation/i });
    stubBox(el);
    fireEvent.pointerDown(el, { clientX: 0, clientY: 100, button: 0 });
    expect(onChange).toHaveBeenCalledWith({ s: 0, v: 0 }, true);
  });

  it("paints its backdrop from the hue alone", () => {
    render(<SaturationBox hsv={{ h: 0, s: 10, v: 10 }} onChange={vi.fn()} />);
    // Pure red at full S/V — proves S and V do not leak into the backdrop.
    expect(screen.getByRole("application", { name: /saturation/i })).toHaveStyle({
      backgroundColor: "#ff0000",
    });
  });

  it("steps saturation and value with arrow keys, committing", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={base} onChange={onChange} />);
    const el = screen.getByRole("application", { name: /saturation/i });
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ s: 51, v: 50 }, false);
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith({ s: 50, v: 51 }, false);
  });

  it("clamps arrow steps at the edges", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={{ h: 200, s: 100, v: 100 }} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("application", { name: /saturation/i }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ s: 100, v: 100 }, false);
  });
});
