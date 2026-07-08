import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconToggleGroup, type IconOption } from "./IconToggleGroup";
import { MIXED } from "../../../lib/selection-style";

const OPTS: IconOption<"solid" | "dashed" | "dotted">[] = [
  { value: "solid", label: "Solid", icon: <span>—</span> },
  { value: "dashed", label: "Dashed", icon: <span>- -</span> },
  { value: "dotted", label: "Dotted", icon: <span>···</span> },
];

describe("IconToggleGroup", () => {
  it("marks the selected option and no other", () => {
    render(<IconToggleGroup options={OPTS} value="dashed" onChange={() => {}} ariaLabel="Stroke style" />);
    expect(screen.getByRole("radio", { name: "Dashed" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Solid" })).not.toBeChecked();
  });

  it("marks nothing when the value is MIXED", () => {
    render(<IconToggleGroup options={OPTS} value={MIXED} onChange={() => {}} ariaLabel="Stroke style" />);
    for (const opt of OPTS) {
      expect(screen.getByRole("radio", { name: opt.label })).not.toBeChecked();
    }
  });

  it("calls onChange with the clicked value", async () => {
    const onChange = vi.fn();
    render(<IconToggleGroup options={OPTS} value="solid" onChange={onChange} ariaLabel="Stroke style" />);
    await userEvent.click(screen.getByRole("radio", { name: "Dotted" }));
    expect(onChange).toHaveBeenCalledWith("dotted");
  });

  it("disables every option when disabled", async () => {
    const onChange = vi.fn();
    render(
      <IconToggleGroup options={OPTS} value="solid" onChange={onChange} ariaLabel="Stroke style" disabled />,
    );
    const solid = screen.getByRole("radio", { name: "Solid" });
    expect(solid).toBeDisabled();
    await userEvent.click(solid);
    expect(onChange).not.toHaveBeenCalled();
  });
});
