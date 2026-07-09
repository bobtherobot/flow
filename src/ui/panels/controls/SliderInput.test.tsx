import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SliderInput } from "./SliderInput";

describe("SliderInput", () => {
  it("shows the current value and unit", () => {
    render(<SliderInput value={4} min={0} max={100} unit="px" onChange={() => {}} ariaLabel="Stroke width" />);
    expect(screen.getByLabelText("Stroke width value")).toHaveValue(4);
    expect(screen.getByText("px")).toBeInTheDocument();
  });

  it("renders an empty field for a mixed (null) value", () => {
    render(<SliderInput value={null} min={0} max={100} onChange={() => {}} ariaLabel="Stroke width" />);
    expect(screen.getByLabelText("Stroke width value")).toHaveValue(null);
  });

  it("commits a typed number, clamped to range", async () => {
    const onChange = vi.fn();
    render(<SliderInput value={4} min={0} max={20} onChange={onChange} ariaLabel="Stroke width" />);
    const field = screen.getByLabelText("Stroke width value");
    await userEvent.clear(field);
    await userEvent.type(field, "50");
    expect(onChange).toHaveBeenLastCalledWith(20); // clamped to max
  });

  it("commits when the range slider moves", () => {
    const onChange = vi.fn();
    render(<SliderInput value={4} min={0} max={100} onChange={onChange} ariaLabel="Stroke width" />);
    const range = screen.getByRole("slider", { name: "Stroke width" });
    fireEvent.change(range, { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("disables both inputs when disabled", () => {
    render(<SliderInput value={4} min={0} max={100} onChange={() => {}} ariaLabel="Stroke width" disabled />);
    expect(screen.getByLabelText("Stroke width")).toBeDisabled();
    expect(screen.getByLabelText("Stroke width value")).toBeDisabled();
  });

  it("hideValue renders only the range slider (no numeric field)", () => {
    render(<SliderInput value={6} min={2} max={12} hideValue onChange={() => {}} ariaLabel="Start arrowhead size" />);
    expect(screen.getByRole("slider", { name: "Start arrowhead size" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Start arrowhead size value")).not.toBeInTheDocument();
  });
});
