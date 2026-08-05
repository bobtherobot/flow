import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { StrokePanel } from "./StrokePanel";
import type { SelectionStyle } from "./useSelectionStyle";

function mockSel(over: Record<string, unknown> = {}): SelectionStyle {
  return {
    elements: [],
    appState: null,
    selectedIds: {},
    textTargetIds: {},
    hasSelection: false,
    selectedCount: 0,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

describe("StrokePanel", () => {
  it("offers a 0-10px stroke width range", () => {
    render(<StrokePanel sel={mockSel()} units="px" />);
    const slider = screen.getByLabelText("Stroke width");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "10");
  });

  it("falls back to the 2px app default before appState is available", () => {
    render(<StrokePanel sel={mockSel()} units="px" />);
    expect(screen.getByLabelText("Stroke width value")).toHaveValue(2);
  });

  it("shows the selected element's width over the fallback", () => {
    const sel = mockSel({
      elements: [{ id: "a", type: "rectangle", strokeWidth: 7 }],
      selectedIds: { a: true },
      hasSelection: true,
    });
    render(<StrokePanel sel={sel} units="px" />);
    expect(screen.getByLabelText("Stroke width value")).toHaveValue(7);
  });
});
