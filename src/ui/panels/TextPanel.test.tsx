import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The real package runs DOM/canvas code that throws in jsdom (no `canvas`
// package installed, so getContext("2d") is null) — same issue worked around
// in useSelectionStyle.test.tsx and search-matches.test.ts. Stub just the
// constant TextPanel actually imports at runtime.
vi.mock("@excalidraw/excalidraw", () => ({
  FONT_FAMILY: {
    Virgil: 1,
    Helvetica: 2,
    Cascadia: 3,
    Excalifont: 5,
    Nunito: 6,
    "Lilita One": 7,
    "Comic Shanns": 8,
    "Liberation Sans": 9,
  },
}));

import { TextPanel } from "./TextPanel";
import type { SelectionStyle } from "./useSelectionStyle";

const textEl = { id: "t", type: "text", fontSize: 20, fontFamily: 1, textAlign: "left" };

function mockSel(over: Record<string, unknown> = {}) {
  const executeAction = vi.fn();
  const sel = {
    elements: [textEl],
    appState: null,
    selectedIds: { t: true },
    textTargetIds: { t: true },
    hasSelection: true,
    selectedCount: 1,
    hasText: true,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction,
    ...over,
  } as unknown as SelectionStyle;
  return { sel, executeAction };
}

describe("TextPanel", () => {
  it("shows the selected text's font size", () => {
    const { sel } = mockSel();
    render(<TextPanel sel={sel} />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(20);
  });

  it("shows scrubbed digits without writing, then commits once on release", () => {
    const { sel, executeAction } = mockSel();
    const { container } = render(<TextPanel sel={sel} />);
    const field = container.querySelectorAll(".flow-ctl-num__input")[0];

    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 290 }); // 10px × (150/150) = +10
    // The digits track the drag; the canvas deliberately does not, because
    // Excalidraw's changeFontSize action always captures history.
    expect(screen.getByLabelText("Font size value")).toHaveValue(30);
    expect(executeAction).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { clientY: 290 });
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledWith("changeFontSize", 30);
  });

  it("still commits a typed size on Enter", async () => {
    const { sel, executeAction } = mockSel();
    render(<TextPanel sel={sel} />);
    const field = screen.getByLabelText("Font size value");
    fireEvent.change(field, { target: { value: "42" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(executeAction).toHaveBeenLastCalledWith("changeFontSize", 42);
  });

  it("disables the field with no text selected", () => {
    const { sel } = mockSel({ hasText: false, textTargetIds: {} });
    render(<TextPanel sel={sel} />);
    expect(screen.getByLabelText("Font size value")).toBeDisabled();
  });
});
