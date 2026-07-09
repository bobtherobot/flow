import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "./NumberInput";

describe("NumberInput", () => {
  it("shows the current value and unit", () => {
    render(<NumberInput value={20} unit="px" onChange={() => {}} ariaLabel="Font size value" />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(20);
    expect(screen.getByText("px")).toBeInTheDocument();
  });

  it("renders an empty field for a mixed (null) value", () => {
    render(<NumberInput value={null} onChange={() => {}} ariaLabel="Font size value" />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(null);
  });

  it("commits a typed number, clamped to range", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "24");
    expect(onChange).toHaveBeenLastCalledWith(24);
  });

  it("clamps below the minimum", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "0");
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("reflects an external value change when not focused", () => {
    const { rerender } = render(<NumberInput value={20} onChange={() => {}} ariaLabel="Font size value" />);
    rerender(<NumberInput value={28} onChange={() => {}} ariaLabel="Font size value" />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(28);
  });

  it("disables the input when disabled", () => {
    render(<NumberInput value={20} onChange={() => {}} ariaLabel="Font size value" disabled />);
    expect(screen.getByLabelText("Font size value")).toBeDisabled();
  });
});
