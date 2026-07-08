import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconActionGroup, type ActionOption } from "./IconActionGroup";

const makeOpts = (onClick = () => {}): ActionOption[] => [
  { key: "left", label: "Align left", icon: <span>L</span>, onClick },
  { key: "right", label: "Align right", icon: <span>R</span>, onClick },
];

describe("IconActionGroup", () => {
  it("renders one button per option inside a group (not a radiogroup)", () => {
    render(<IconActionGroup options={makeOpts()} ariaLabel="Align" />);
    const group = screen.getByRole("group", { name: "Align" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Align left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Align right" })).toBeInTheDocument();
    // momentary buttons never carry checked state
    expect(screen.getByRole("button", { name: "Align left" })).not.toHaveAttribute("aria-checked");
  });

  it("fires the clicked option's onClick", async () => {
    const onClick = vi.fn();
    render(<IconActionGroup options={makeOpts(onClick)} ariaLabel="Align" />);
    await userEvent.click(screen.getByRole("button", { name: "Align right" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables every button and does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(<IconActionGroup options={makeOpts(onClick)} ariaLabel="Align" disabled />);
    const left = screen.getByRole("button", { name: "Align left" });
    expect(left).toBeDisabled();
    expect(screen.getByRole("group", { name: "Align" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(left);
    expect(onClick).not.toHaveBeenCalled();
  });
});
