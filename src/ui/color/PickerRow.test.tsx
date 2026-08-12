import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EyeDropperButton } from "./EyeDropperButton";
import { PickerRow } from "./PickerRow";

describe("PickerRow", () => {
  const hsv = { h: 200, s: 50, v: 80 };

  it("renders the eyedropper and both tracks", () => {
    render(<PickerRow hsv={hsv} alpha={100} onHue={vi.fn()} onAlpha={vi.fn()} />);
    expect(screen.getByRole("button", { name: /pick a color/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
  });

  it("no longer renders a preview well", () => {
    // Removed deliberately (design spec §7); this pins it so it cannot creep
    // back in as part of an unrelated change.
    const { container } = render(
      <PickerRow hsv={hsv} alpha={100} onHue={vi.fn()} onAlpha={vi.fn()} />,
    );
    expect(container.querySelector(".flow-clr-preview")).toBeNull();
  });

  it("forwards hue and alpha changes", () => {
    const onHue = vi.fn();
    const onAlpha = vi.fn();
    render(<PickerRow hsv={hsv} alpha={100} onHue={onHue} onAlpha={onAlpha} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowRight" });
    expect(onHue).toHaveBeenCalledWith(201, false);
    fireEvent.keyDown(screen.getByRole("slider", { name: /opacity/i }), { key: "ArrowLeft" });
    expect(onAlpha).toHaveBeenCalledWith(99, false);
  });
});

describe("EyeDropperButton", () => {
  it("is disabled with no handler", () => {
    render(<EyeDropperButton />);
    expect(screen.getByRole("button", { name: /pick a color/i })).toBeDisabled();
  });

  it("calls the handler when clicked", () => {
    const onPick = vi.fn();
    render(<EyeDropperButton onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /pick a color/i }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
