import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HueSlider } from "./HueSlider";
import { AlphaSlider } from "./AlphaSlider";

function stubBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 12, right: 200, bottom: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe("HueSlider", () => {
  it("exposes slider semantics", () => {
    render(<HueSlider hue={120} onChange={vi.fn()} />);
    const el = screen.getByRole("slider", { name: /hue/i });
    expect(el).toHaveAttribute("aria-valuenow", "120");
    expect(el).toHaveAttribute("aria-valuemin", "0");
    expect(el).toHaveAttribute("aria-valuemax", "360");
  });

  it("maps a press to a hue transiently", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={0} onChange={onChange} />);
    const el = screen.getByRole("slider", { name: /hue/i });
    stubBox(el);
    fireEvent.pointerDown(el, { clientX: 100, clientY: 6, button: 0 });
    expect(onChange).toHaveBeenCalledWith(180, true);
  });

  it("steps with arrow keys and commits immediately", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={120} onChange={onChange} />);
    const el = screen.getByRole("slider", { name: /hue/i });
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(121, false);
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(119, false);
  });

  it("takes a coarse step with shift", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={120} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(130, false);
  });

  it("clamps arrow steps at the ends", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={0} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0, false);
  });

  it("ignores unrelated keys", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={120} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AlphaSlider", () => {
  it("exposes slider semantics on a 0-100 range", () => {
    render(<AlphaSlider alpha={40} hue={0} onChange={vi.fn()} />);
    const el = screen.getByRole("slider", { name: /opacity/i });
    expect(el).toHaveAttribute("aria-valuenow", "40");
    expect(el).toHaveAttribute("aria-valuemax", "100");
  });

  it("maps a press to an alpha percentage", () => {
    const onChange = vi.fn();
    render(<AlphaSlider alpha={0} hue={0} onChange={onChange} />);
    const el = screen.getByRole("slider", { name: /opacity/i });
    stubBox(el);
    fireEvent.pointerDown(el, { clientX: 50, clientY: 6, button: 0 });
    expect(onChange).toHaveBeenCalledWith(25, true);
  });
});
