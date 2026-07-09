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

  it("does not commit while typing, only on Enter", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "24");
    expect(onChange).not.toHaveBeenCalled(); // still editing
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(24);
  });

  it("commits on blur", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "24");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(24);
  });

  it("clamps below the minimum on commit", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "0{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("reverts to the current value on Escape without committing", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "99{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue(20);
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
