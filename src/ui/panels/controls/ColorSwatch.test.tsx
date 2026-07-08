import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorSwatch } from "./ColorSwatch";
import { MIXED } from "../../../lib/selection-style";

describe("ColorSwatch", () => {
  it("opens the picker and reports a preset choice", async () => {
    const onChange = vi.fn();
    render(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Stroke color" />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    await userEvent.click(screen.getByRole("button", { name: "#e03131" }));
    expect(onChange).toHaveBeenCalledWith("#e03131");
  });

  it("commits a valid hex typed into the field", async () => {
    const onChange = vi.fn();
    render(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Stroke color" />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    const hex = screen.getByLabelText("Stroke color hex");
    await userEvent.type(hex, "#abcdef{Enter}");
    expect(onChange).toHaveBeenCalledWith("#abcdef");
  });

  it("ignores an invalid hex", async () => {
    const onChange = vi.fn();
    render(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Stroke color" />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    await userEvent.type(screen.getByLabelText("Stroke color hex"), "nope{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers None only when transparent is allowed", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Background" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Background" }));
    expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();

    rerender(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Background" allowTransparent />);
    await userEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith("transparent");
  });

  it("shows a mixed indicator without a solid background", () => {
    render(<ColorSwatch value={MIXED} onChange={() => {}} ariaLabel="Stroke color" />);
    const btn = screen.getByRole("button", { name: "Stroke color" });
    expect(btn).toHaveAttribute("title", "Mixed");
  });

  it("does not open when disabled", async () => {
    render(<ColorSwatch value="#1971c2" onChange={() => {}} ariaLabel="Stroke color" disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
