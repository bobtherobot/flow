// src/ui/panels/SwatchGrid.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwatchGrid } from "./SwatchGrid";

const base = {
  colors: ["#111111", "#222222"],
  selected: [] as number[],
  onAdd: vi.fn(),
  onSelect: vi.fn(),
  onEdit: vi.fn(),
  onReorder: vi.fn(),
};

describe("SwatchGrid", () => {
  it("renders the + tile and one button per color", () => {
    render(<SwatchGrid {...base} />);
    expect(screen.getByRole("button", { name: "Add swatch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swatch #111111" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swatch #222222" })).toBeInTheDocument();
  });

  it("calls onAdd from the + tile", () => {
    const onAdd = vi.fn();
    render(<SwatchGrid {...base} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add swatch" }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("reports shift state on select", () => {
    const onSelect = vi.fn();
    render(<SwatchGrid {...base} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Swatch #222222" }), { shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith(1, true);
  });

  it("double-click edits", () => {
    const onEdit = vi.fn();
    render(<SwatchGrid {...base} onEdit={onEdit} />);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Swatch #111111" }));
    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it("marks selected swatches with aria-pressed", () => {
    render(<SwatchGrid {...base} selected={[1]} />);
    expect(screen.getByRole("button", { name: "Swatch #222222" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reorders via drag/drop", () => {
    const onReorder = vi.fn();
    render(<SwatchGrid {...base} onReorder={onReorder} />);
    const a = screen.getByRole("button", { name: "Swatch #111111" });
    const b = screen.getByRole("button", { name: "Swatch #222222" });
    fireEvent.dragStart(a);
    fireEvent.dragOver(b);
    fireEvent.drop(b);
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });
});
