import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickButton } from "./QuickButton";

describe("QuickButton", () => {
  it("exposes the label as its accessible name", () => {
    render(<QuickButton icon={<i />} label="Duplicate" active={false} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
  });

  it("fires onClick when pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<QuickButton icon={<i />} label="Duplicate" active={false} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("returns focus to the canvas after the click handler runs (fire-and-forget, not a popup trigger)", async () => {
    const canvasContainer = document.createElement("div");
    canvasContainer.className = "excalidraw-container";
    canvasContainer.tabIndex = 0;
    document.body.appendChild(canvasContainer);

    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<QuickButton icon={<i />} label="Duplicate" active={false} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(canvasContainer);

    canvasContainer.remove();
  });
});
