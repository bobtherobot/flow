// src/ui/panels/SwatchPicker.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwatchPicker } from "./SwatchPicker";

describe("SwatchPicker", () => {
  it("commits a scrubbed hex from the text field on Enter", () => {
    const onCommit = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={onCommit} onClose={vi.fn()} />);
    const hex = screen.getByLabelText("Swatch hex");
    fireEvent.change(hex, { target: { value: "abc" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("#aabbcc");
  });

  it("commits from the native color input", () => {
    const onCommit = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={onCommit} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText("Swatch color"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    expect(onCommit).toHaveBeenCalledWith("#123456");
  });

  it("does not commit invalid hex", () => {
    const onCommit = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={onCommit} onClose={vi.fn()} />);
    const hex = screen.getByLabelText("Swatch hex");
    fireEvent.change(hex, { target: { value: "nope" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("closes on Escape from anywhere inside the popover, not just the hex field", () => {
    const onClose = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={vi.fn()} onClose={onClose} />);
    const addButton = screen.getByRole("button", { name: "Add color" });
    fireEvent.keyDown(addButton, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on pointerdown outside the popover", () => {
    const onClose = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={vi.fn()} onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
