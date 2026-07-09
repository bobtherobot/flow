import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorPanel } from "./ColorPanel";
import type { SelectionStyle } from "./useSelectionStyle";

/** Minimal SelectionStyle stub — empty scene, tool-default colors. */
function makeSel(overrides: Partial<SelectionStyle> = {}): SelectionStyle {
  return {
    elements: [],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
      laserColor: "#ff0000",
    } as unknown as SelectionStyle["appState"],
    selectedIds: {},
    textTargetIds: {},
    hasSelection: false,
    selectedCount: 0,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...overrides,
  };
}

describe("ColorPanel laser row", () => {
  it("renders a Laser swatch and opacity control", () => {
    render(<ColorPanel sel={makeSel()} onChangeLaserColor={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Laser color" })).toBeInTheDocument();
    expect(screen.getByLabelText("Laser opacity value")).toBeInTheDocument();
  });

  it("calls onChangeLaserColor with combined hex when opacity changes, not setProp", () => {
    const onChangeLaserColor = vi.fn();
    const sel = makeSel();
    render(<ColorPanel sel={sel} onChangeLaserColor={onChangeLaserColor} />);

    const opacity = screen.getByLabelText("Laser opacity value");
    fireEvent.change(opacity, { target: { value: "50" } });
    fireEvent.blur(opacity);

    expect(onChangeLaserColor).toHaveBeenCalledWith("#ff000080");
    expect(sel.setProp).not.toHaveBeenCalled();
  });
});
