import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolButton } from "./ToolButton";

describe("ToolButton", () => {
  it("exposes the label as its accessible name", () => {
    render(<ToolButton icon={<i />} label="Rectangle" active={false} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
  });

  it("reflects active state via aria-pressed", () => {
    render(<ToolButton icon={<i />} label="Rectangle" active onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "true");
  });

  it("fires onClick when pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ToolButton icon={<i />} label="Rectangle" active={false} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
