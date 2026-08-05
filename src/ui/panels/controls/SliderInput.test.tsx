import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SliderInput } from "./SliderInput";

describe("SliderInput", () => {
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
});
