import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomButton } from "./BottomButton";

describe("BottomButton", () => {
  it("exposes the label as its accessible name", () => {
    render(<BottomButton icon={<i />} label="Grid" active={false} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Grid" })).toBeInTheDocument();
  });

  it("fires onClick when pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<BottomButton icon={<i />} label="Grid" active={false} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Grid" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("returns focus to the canvas after the click handler runs (fire-and-forget, not a popup trigger)", async () => {
    const canvasContainer = document.createElement("div");
    canvasContainer.className = "excalidraw-container";
    canvasContainer.tabIndex = 0;
    document.body.appendChild(canvasContainer);

    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<BottomButton icon={<i />} label="Grid" active={false} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Grid" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(canvasContainer);

    canvasContainer.remove();
  });
});
