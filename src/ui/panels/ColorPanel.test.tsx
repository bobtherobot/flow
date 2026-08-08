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

describe("ColorPanel", () => {
  it("renders the three per-element color rows", () => {
    render(<ColorPanel sel={makeSel()} />);
    for (const label of ["Fill", "Stroke", "Text"]) {
      expect(screen.getByRole("button", { name: `${label} color` })).toBeInTheDocument();
      expect(screen.getByLabelText(`${label} opacity`)).toBeInTheDocument();
    }
  });

  it("writes an opacity change to the selection", () => {
    const sel = makeSel();
    render(<ColorPanel sel={sel} />);

    const opacity = screen.getByLabelText("Stroke opacity");
    fireEvent.change(opacity, { target: { value: "50" } });
    fireEvent.blur(opacity);

    expect(sel.setProp).toHaveBeenCalledWith(
      expect.objectContaining({ prop: "strokeColor", value: "#1e1e1e80" }),
    );
  });

  // The laser trail is a global preference, not an element property — it moved
  // to File ▸ Preferences. See PreferencesDialog.test.tsx.
  it("no longer renders a Laser row", () => {
    render(<ColorPanel sel={makeSel()} />);
    expect(screen.queryByRole("button", { name: "Laser color" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Laser opacity")).not.toBeInTheDocument();
  });
});
