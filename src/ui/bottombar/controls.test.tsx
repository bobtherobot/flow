import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoomControl } from "./ZoomControl";
import { SearchControl } from "./SearchControl";

describe("ZoomControl", () => {
  it("shows the percentage and wires the three actions", async () => {
    const user = userEvent.setup();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onReset = vi.fn();
    render(
      <ZoomControl pct={150} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onReset={onReset} />,
    );

    expect(screen.getByText("150%")).toBeTruthy();
    await user.click(screen.getByLabelText("Zoom in"));
    await user.click(screen.getByLabelText("Zoom out"));
    await user.click(screen.getByRole("button", { name: /Zoom 150%/ }));

    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("SearchControl", () => {
  it("executes the typed query on submit", async () => {
    const user = userEvent.setup();
    const onExecute = vi.fn();
    render(<SearchControl onExecute={onExecute} />);

    await user.type(screen.getByLabelText("Search canvas"), "widget");
    await user.click(screen.getByLabelText("Run search"));

    expect(onExecute).toHaveBeenCalledWith("widget");
  });

  it("executes on Enter", async () => {
    const user = userEvent.setup();
    const onExecute = vi.fn();
    render(<SearchControl onExecute={onExecute} />);

    await user.type(screen.getByLabelText("Search canvas"), "box{Enter}");
    expect(onExecute).toHaveBeenCalledWith("box");
  });
});
