import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorPreview } from "./ColorPreview";
import { EyeDropperButton } from "./EyeDropperButton";
import { PickerRow } from "./PickerRow";

describe("ColorPreview", () => {
  it("paints the color at full opacity", () => {
    render(<ColorPreview hex="#ff0000" alpha={100} />);
    expect(screen.getByLabelText(/current color/i).firstElementChild).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("reports the color and opacity in its accessible name", () => {
    render(<ColorPreview hex="#ff0000" alpha={40} />);
    expect(screen.getByLabelText("Current color #ff0000, 40% opacity")).toBeInTheDocument();
  });

  it("shows the checkerboard when the color is transparent", () => {
    render(<ColorPreview hex="transparent" alpha={0} />);
    expect(screen.getByLabelText(/no color/i)).toHaveClass("flow-clr-preview--none");
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

describe("PickerRow", () => {
  const hsv = { h: 200, s: 50, v: 80 };

  it("renders the eyedropper, preview and both tracks", () => {
    render(<PickerRow hsv={hsv} alpha={100} isNone={false} onHue={vi.fn()} onAlpha={vi.fn()} />);
    expect(screen.getByRole("button", { name: /pick a color/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/current color/i)).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
  });

  it("shows the none preview when isNone", () => {
    render(<PickerRow hsv={hsv} alpha={0} isNone onHue={vi.fn()} onAlpha={vi.fn()} />);
    expect(screen.getByLabelText(/no color/i)).toBeInTheDocument();
  });

  it("forwards hue and alpha changes", () => {
    const onHue = vi.fn();
    const onAlpha = vi.fn();
    render(<PickerRow hsv={hsv} alpha={100} isNone={false} onHue={onHue} onAlpha={onAlpha} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowRight" });
    expect(onHue).toHaveBeenCalledWith(201, false);
    fireEvent.keyDown(screen.getByRole("slider", { name: /opacity/i }), { key: "ArrowLeft" });
    expect(onAlpha).toHaveBeenCalledWith(99, false);
  });
});
